import * as decoding from 'lib0/decoding';
import * as encoding from 'lib0/encoding';
import * as awarenessProtocol from 'y-protocols/awareness';
import * as syncProtocol from 'y-protocols/sync';
import type * as Y from 'yjs';
import { wsUrl } from './http';
import type { ConnectionStatus, PresenceUser } from '../types';
import type { Role } from '../../types/domain';

const MESSAGE_SYNC = 0;
const MESSAGE_AWARENESS = 1;

interface ConnectParams {
  requirementId: string;
  doc: Y.Doc;
  user: { id: string; username: string; role: Role };
  onStatusChange(status: ConnectionStatus): void;
  onPresenceChange(users: PresenceUser[]): void;
  onResync?(): void;
}

/**
 * 使用 y-protocols 标准二进制帧，路径严格为 /collaboration?requirementId=...
 * 帧格式：[varUint messageType][sync | awareness payload]
 */
export function connectCollaboration({
  requirementId,
  doc,
  user,
  onStatusChange,
  onPresenceChange,
  onResync,
}: ConnectParams): () => void {
  const url = wsUrl(`/collaboration?requirementId=${encodeURIComponent(requirementId)}`);
  const awareness = new awarenessProtocol.Awareness(doc);
  let socket: WebSocket | null = null;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  let attempts = 0;
  let disposed = false;

  const send = (encoder: encoding.Encoder) => {
    if (socket?.readyState === WebSocket.OPEN) {
      socket.send(encoding.toUint8Array(encoder));
    }
  };

  const updatePresence = () => {
    const users: PresenceUser[] = [];
    awareness.getStates().forEach((state) => {
      const remote = (state as { user?: PresenceUser })?.user;
      if (remote && typeof remote.id === 'string') {
        users.push({ id: remote.id, username: remote.username ?? '', role: remote.role });
      }
    });
    onPresenceChange(users);
  };

  const onAwarenessUpdate = (
    { added, updated, removed }: { added: number[]; updated: number[]; removed: number[] },
    origin: unknown,
  ) => {
    const changed = [...added, ...updated, ...removed];
    if (changed.length === 0) return;
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, MESSAGE_AWARENESS);
    encoding.writeVarUint8Array(
      encoder,
      awarenessProtocol.encodeAwarenessUpdate(awareness, changed),
    );
    send(encoder);
    void origin;
  };

  awareness.on('update', onAwarenessUpdate);
  awareness.on('change', updatePresence);
  awareness.setLocalStateField('user', {
    id: user.id,
    username: user.username,
    role: user.role,
  });

  const scheduleReconnect = () => {
    if (disposed) return;
    const wait = Math.min(1000 * 2 ** attempts, 10_000);
    attempts += 1;
    retryTimer = setTimeout(connect, wait);
  };

  const connect = () => {
    if (disposed) return;
    onStatusChange(attempts === 0 ? 'connecting' : 'reconnecting');
    try {
      socket = new WebSocket(url);
    } catch {
      scheduleReconnect();
      return;
    }
    socket.binaryType = 'arraybuffer';
    socket.onopen = () => {
      if (disposed) return;
      attempts = 0;
      onStatusChange('connected');
      onResync?.();
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, MESSAGE_SYNC);
      syncProtocol.writeSyncStep1(encoder, doc);
      send(encoder);
      const awarenessEncoder = encoding.createEncoder();
      encoding.writeVarUint(awarenessEncoder, MESSAGE_AWARENESS);
      encoding.writeVarUint8Array(
        awarenessEncoder,
        awarenessProtocol.encodeAwarenessUpdate(awareness, [doc.clientID]),
      );
      send(awarenessEncoder);
    };
    socket.onmessage = (event: MessageEvent) => {
      if (typeof event.data === 'string') return;
      const data = new Uint8Array(event.data as ArrayBuffer);
      const decoder = decoding.createDecoder(data);
      const messageType = decoding.readVarUint(decoder);
      if (messageType === MESSAGE_SYNC) {
        const encoder = encoding.createEncoder();
        encoding.writeVarUint(encoder, MESSAGE_SYNC);
        syncProtocol.readSyncMessage(decoder, encoder, doc, socket);
        if (encoding.length(encoder) > 1) send(encoder);
      } else if (messageType === MESSAGE_AWARENESS) {
        awarenessProtocol.applyAwarenessUpdate(
          awareness,
          decoding.readVarUint8Array(decoder),
          socket,
        );
      }
    };
    socket.onerror = () => socket?.close();
    socket.onclose = () => {
      if (disposed) return;
      onStatusChange('reconnecting');
      scheduleReconnect();
    };
  };

  connect();

  return () => {
    disposed = true;
    if (retryTimer) clearTimeout(retryTimer);
    awareness.off('update', onAwarenessUpdate);
    awareness.off('change', updatePresence);
    awarenessProtocol.removeAwarenessStates(awareness, [doc.clientID], 'disconnect');
    socket?.close();
    onPresenceChange([]);
    onStatusChange('disconnected');
  };
}
