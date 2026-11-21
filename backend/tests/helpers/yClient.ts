import { once } from 'node:events';
import { WebSocket } from 'ws';
import * as Y from 'yjs';
import * as sync from 'y-protocols/sync';
import * as decoding from 'lib0/decoding';
import * as encoding from 'lib0/encoding';
import type { Section } from '../../src/domain/status.js';

const SYNC = 0;

export async function waitFor(predicate: () => boolean | Promise<boolean>, timeoutMs = 10_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`condition not met within ${timeoutMs}ms`);
}

/** 说标准 y-websocket 线协议的真实 WS 客户端，用于验证服务端协作实现。 */
export class YClient {
  readonly doc = new Y.Doc();
  private resolveSynced!: () => void;
  private readonly synced: Promise<void>;

  private constructor(private readonly ws: WebSocket) {
    this.synced = new Promise<void>((resolve) => { this.resolveSynced = resolve; });
    this.doc.on('update', (update: Uint8Array, origin: unknown) => {
      if (origin === 'remote') return;
      this.sendSync((encoder) => sync.writeUpdate(encoder, update));
    });
    ws.on('message', (raw, isBinary) => {
      if (!isBinary) return;
      const decoder = decoding.createDecoder(new Uint8Array(raw as Buffer));
      const type = decoding.readVarUint(decoder);
      if (type !== SYNC) return;
      const encoder = encoding.createEncoder();
      const innerType = sync.readSyncMessage(decoder, encoder, this.doc, 'remote');
      if (innerType === sync.messageYjsSyncStep2) this.resolveSynced();
      if (encoding.length(encoder) > 0) {
        const reply = encoding.toUint8Array(encoder);
        this.sendSync((frame) => encoding.writeUint8Array(frame, reply));
      }
    });
  }

  static async connect(wsUrl: string, cookie: string): Promise<YClient> {
    const ws = new WebSocket(wsUrl, { headers: { Cookie: cookie } });
    await once(ws, 'open');
    const client = new YClient(ws);
    client.sendSync((encoder) => sync.writeSyncStep1(encoder, client.doc));
    await Promise.race([
      client.synced,
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('sync timeout')), 10_000)),
    ]);
    return client;
  }

  text(section: Section): string {
    return this.doc.getText(section).toString();
  }

  insert(section: Section, index: number, text: string): void {
    this.doc.getText(section).insert(index, text);
  }

  async waitForText(section: Section, expected: string): Promise<void> {
    await waitFor(() => this.text(section) === expected);
  }

  private sendSync(write: (encoder: encoding.Encoder) => void): void {
    if (this.ws.readyState !== WebSocket.OPEN) return;
    const frame = encoding.createEncoder();
    encoding.writeVarUint(frame, SYNC);
    write(frame);
    this.ws.send(Buffer.from(encoding.toUint8Array(frame)));
  }

  close(): void {
    this.ws.close();
    this.doc.destroy();
  }
}

export interface EventsClient {
  messages: Array<Record<string, unknown>>;
  close(): void;
}

export async function connectEvents(baseUrl: string, cookie: string): Promise<EventsClient> {
  const ws = new WebSocket(`${baseUrl.replace('http://', 'ws://')}/events`, {
    headers: { Cookie: cookie },
  });
  await once(ws, 'open');
  const messages: Array<Record<string, unknown>> = [];
  ws.on('message', (raw) => {
    messages.push(JSON.parse(raw.toString()) as Record<string, unknown>);
  });
  return { messages, close: () => ws.close() };
}
