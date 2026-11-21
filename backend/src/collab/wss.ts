import type { IncomingMessage, Server } from 'node:http';
import type { Duplex } from 'node:stream';
import { WebSocket, WebSocketServer } from 'ws';
import type { Pool } from '../db/pool.js';
import { authenticateToken, parseCookies } from '../auth/session.js';
import { EventBroadcaster } from '../events/broadcaster.js';
import { uuidSchema } from '../domain/validation.js';
import { RoomManager } from './roomManager.js';

export interface WebSocketOptions {
  pool: Pool;
  cookieName: string;
  broadcaster: EventBroadcaster;
}

function rejectUpgrade(socket: Duplex, status: number, code: string, message: string): void {
  const body = JSON.stringify({ error: { code, message } });
  socket.write(
    `HTTP/1.1 ${status} ${status === 401 ? 'Unauthorized' : 'Forbidden'}\r\n` +
      'Content-Type: application/json\r\n' +
      `Content-Length: ${Buffer.byteLength(body)}\r\n` +
      'Connection: close\r\n\r\n' +
      body,
  );
  socket.destroy();
}

async function authenticateUpgrade(
  req: IncomingMessage,
  options: WebSocketOptions,
): Promise<{ id: string; username: string; role: 'pm' | 'backend' | 'frontend' | 'test' } | null> {
  const token = parseCookies(req.headers.cookie)[options.cookieName];
  return authenticateToken({ pool: options.pool, cookieName: options.cookieName }, token);
}

export function attachWebSockets(server: Server, options: WebSocketOptions): { roomManager: RoomManager; close: () => Promise<void> } {
  const collaboration = new WebSocketServer({ noServer: true, maxPayload: 8 * 1024 * 1024 });
  const events = new WebSocketServer({ noServer: true });
  const roomManager = new RoomManager(options.pool);
  const roomBySocket = new WeakMap<WebSocket, string>();

  server.on('upgrade', (req, socket, head) => {
    void (async () => {
      const url = new URL(req.url ?? '/', 'http://localhost');
      if (url.pathname !== '/collaboration' && url.pathname !== '/events') {
        socket.destroy();
        return;
      }
      const user = await authenticateUpgrade(req, options);
      if (!user) {
        rejectUpgrade(socket, 401, '401', '请先登录');
        return;
      }
      if (url.pathname === '/events') {
        events.handleUpgrade(req, socket, head, (ws) => events.emit('connection', ws, req));
        return;
      }

      const parsed = uuidSchema.safeParse(url.searchParams.get('requirementId'));
      if (!parsed.success) {
        rejectUpgrade(socket, 403, '403', '无效的需求 ID');
        return;
      }
      const membership = await options.pool.query(
        'SELECT 1 FROM requirement_members WHERE requirement_id=$1 AND user_id=$2',
        [parsed.data, user.id],
      );
      if (!membership.rowCount) {
        rejectUpgrade(socket, 403, '403', '无权访问该需求文档');
        return;
      }
      collaboration.handleUpgrade(req, socket, head, (ws) => {
        roomBySocket.set(ws, parsed.data);
        collaboration.emit('connection', ws, req);
      });
    })().catch((error: unknown) => {
      console.error('[ws] upgrade failed', error);
      socket.destroy();
    });
  });

  collaboration.on('connection', (ws: WebSocket, _req: IncomingMessage) => {
    const requirementId = roomBySocket.get(ws);
    const queued: Uint8Array[] = [];
    let room: Awaited<ReturnType<typeof roomManager.get>> | undefined;
    let closed = false;

    // 立即挂接监听：客户端可能在房间从数据库加载完成前就发出 syncStep1。
    ws.on('message', (data, isBinary) => {
      if (!isBinary) return;
      const message = new Uint8Array(data as Buffer);
      if (!room) {
        queued.push(message);
        return;
      }
      try {
        room.handleMessage(ws, message);
      } catch (error) {
        console.error('[collab] bad message', error);
      }
    });
    ws.on('close', () => {
      closed = true;
      if (!room || !requirementId) return;
      room.removeClient(ws);
      if (room.clients.size === 0) void roomManager.evict(requirementId, room);
    });
    ws.on('error', (error) => console.error('[collab] socket error', error));

    void (async () => {
      if (!requirementId) throw new Error('missing requirementId on socket');
      room = await roomManager.get(requirementId);
      if (closed || ws.readyState !== WebSocket.OPEN) {
        void roomManager.evict(requirementId, room);
        return;
      }
      room.addClient(ws);
      room.sendSyncStep1(ws);
      for (const message of queued) room.handleMessage(ws, message);
      queued.length = 0;
    })().catch((error: unknown) => {
      console.error('[collab] join failed', error);
      ws.close(1011, 'failed to load document');
    });
  });

  events.on('connection', (ws: WebSocket) => {
    options.broadcaster.add(ws);
    ws.on('message', () => {
      // /events 为单向广播通道，忽略客户端消息。
    });
  });

  return {
    roomManager,
    close: async () => {
      for (const client of collaboration.clients) client.close(1001, 'server shutdown');
      for (const client of events.clients) client.close(1001, 'server shutdown');
      await roomManager.closeAll();
      await new Promise<void>((resolve) => {
        collaboration.close(() => resolve());
      });
      await new Promise<void>((resolve) => {
        events.close(() => resolve());
      });
    },
  };
}
