import * as Y from 'yjs';
import * as syncProtocol from 'y-protocols/sync';
import * as awarenessProtocol from 'y-protocols/awareness';
import * as decoding from 'lib0/decoding';
import * as encoding from 'lib0/encoding';
import { WebSocket } from 'ws';
import type { Pool } from '../db/pool.js';
import { LOAD_ORIGIN, loadDocument, persistUpdate } from './persistence.js';

const MESSAGE_SYNC = 0;
const MESSAGE_AWARENESS = 1;

export class Room {
  readonly clients = new Set<WebSocket>();
  readonly awareness: awarenessProtocol.Awareness;
  private queue: Promise<void> = Promise.resolve();
  private readonly awarenessClients = new Map<WebSocket, Set<number>>();
  onPersistenceError: ((error: unknown) => void) | undefined;

  constructor(
    readonly requirementId: string,
    readonly docId: string,
    readonly doc: Y.Doc,
    public version: number,
    private readonly pool: Pool,
  ) {
    this.awareness = new awarenessProtocol.Awareness(doc);
    this.awareness.on('update', ({ added, updated, removed }: { added: number[]; updated: number[]; removed: number[] }, origin: unknown) => {
      const changed = [...added, ...updated, ...removed];
      if (!changed.length) return;
      if (origin instanceof WebSocket) {
        const owned = this.awarenessClients.get(origin) ?? new Set<number>();
        for (const id of [...added, ...updated]) owned.add(id);
        for (const id of removed) owned.delete(id);
        this.awarenessClients.set(origin, owned);
      }
      const frame = encoding.createEncoder();
      encoding.writeVarUint(frame, MESSAGE_AWARENESS);
      encoding.writeVarUint8Array(frame, awarenessProtocol.encodeAwarenessUpdate(this.awareness, changed));
      this.broadcast(encoding.toUint8Array(frame));
    });
    this.doc.on('update', (update: Uint8Array, origin: unknown) => {
      if (origin === LOAD_ORIGIN) return;
      const source = origin instanceof WebSocket ? origin : undefined;
      this.enqueuePersist(update, source);
    });
  }

  /** 新连接先发送 syncStep1，由客户端补发其缺失更新，实现断线重连同步。 */
  sendSyncStep1(client: WebSocket): void {
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, MESSAGE_SYNC);
    syncProtocol.writeSyncStep1(encoder, this.doc);
    if (client.readyState === WebSocket.OPEN) client.send(Buffer.from(encoding.toUint8Array(encoder)));
    const states = [...this.awareness.getStates().keys()];
    if (states.length) {
      const awarenessFrame = encoding.createEncoder();
      encoding.writeVarUint(awarenessFrame, MESSAGE_AWARENESS);
      encoding.writeVarUint8Array(awarenessFrame, awarenessProtocol.encodeAwarenessUpdate(this.awareness, states));
      client.send(Buffer.from(encoding.toUint8Array(awarenessFrame)));
    }
  }

  handleMessage(client: WebSocket, data: Uint8Array): void {
    const decoder = decoding.createDecoder(data);
    const messageType = decoding.readVarUint(decoder);
    if (messageType === MESSAGE_SYNC) {
      const encoder = encoding.createEncoder();
      syncProtocol.readSyncMessage(decoder, encoder, this.doc, client, (error) => {
        console.error('[collab] invalid Yjs update', error);
      });
      if (encoding.length(encoder) > 0) {
        const frame = encoding.createEncoder();
        encoding.writeVarUint(frame, MESSAGE_SYNC);
        encoding.writeUint8Array(frame, encoding.toUint8Array(encoder));
        client.send(Buffer.from(encoding.toUint8Array(frame)));
      }
      return;
    }
    if (messageType === MESSAGE_AWARENESS) {
      awarenessProtocol.applyAwarenessUpdate(
        this.awareness,
        decoding.readTailAsUint8Array(decoder),
        client,
      );
    }
  }

  addClient(client: WebSocket): void {
    this.clients.add(client);
  }

  removeClient(client: WebSocket): void {
    this.clients.delete(client);
    const owned = this.awarenessClients.get(client);
    if (owned?.size) awarenessProtocol.removeAwarenessStates(this.awareness, [...owned], 'disconnect');
    this.awarenessClients.delete(client);
  }

  whenIdle(): Promise<void> {
    return this.queue;
  }

  destroy(): void {
    this.awareness.destroy();
    this.doc.destroy();
  }

  private enqueuePersist(update: Uint8Array, source: WebSocket | undefined): void {
    this.queue = this.queue
      .then(async () => {
        const result = await persistUpdate(this.pool, this.docId, this.doc, update);
        this.version = result.documentVersion;
        const frame = encoding.createEncoder();
        encoding.writeVarUint(frame, MESSAGE_SYNC);
        syncProtocol.writeUpdate(frame, update);
        const payload = encoding.toUint8Array(frame);
        for (const client of this.clients) {
          if (client !== source && client.readyState === WebSocket.OPEN) {
            client.send(Buffer.from(payload));
          }
        }
      })
      .catch((error: unknown) => {
        console.error('[collab] failed to persist update', error);
        this.onPersistenceError?.(error);
      });
  }

  private broadcast(payload: Uint8Array, exclude?: WebSocket): void {
    for (const client of this.clients) {
      if (client !== exclude && client.readyState === WebSocket.OPEN) {
        client.send(Buffer.from(payload));
      }
    }
  }
}

/** 每个需求至多一个权威 Y.Doc；按 requirementId 完全隔离。 */
export class RoomManager {
  private readonly rooms = new Map<string, Room>();
  private readonly loading = new Map<string, Promise<Room>>();

  constructor(private readonly pool: Pool) {}

  async get(requirementId: string): Promise<Room> {
    const existing = this.rooms.get(requirementId);
    if (existing) return existing;
    const inFlight = this.loading.get(requirementId);
    if (inFlight) return inFlight;

    const pending = loadDocument(this.pool, requirementId).then((loaded) => {
      const room = new Room(requirementId, loaded.docId, loaded.doc, loaded.version, this.pool);
      room.onPersistenceError = () => {
        void this.evict(requirementId, room);
      };
      this.rooms.set(requirementId, room);
      this.loading.delete(requirementId);
      return room;
    }).catch((error: unknown) => {
      this.loading.delete(requirementId);
      throw error;
    });
    this.loading.set(requirementId, pending);
    return pending;
  }

  peek(requirementId: string): Room | undefined {
    return this.rooms.get(requirementId);
  }

  async evict(requirementId: string, expected?: Room): Promise<void> {
    const room = this.rooms.get(requirementId);
    if (!room || (expected && room !== expected)) return;
    await room.whenIdle();
    if (this.rooms.get(requirementId) !== room) return;
    this.rooms.delete(requirementId);
    for (const client of room.clients) client.close(1011, 'room reloaded from database');
    room.clients.clear();
    room.destroy();
  }

  async closeAll(): Promise<void> {
    for (const id of [...this.rooms.keys()]) await this.evict(id);
  }
}
