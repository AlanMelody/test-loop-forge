import { createServer, type Server } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import type { Express } from 'express';
import request from 'supertest';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { createApp } from '../../src/app.js';
import { attachWebSockets } from '../../src/collab/wss.js';
import { DeterministicDraftAdapter } from '../../src/ai/deterministic.js';
import type { SeedAccount } from '../../src/config/env.js';
import { createPool, type Pool } from '../../src/db/pool.js';
import { runMigrations } from '../../src/db/migrate.js';
import { seedUsers } from '../../src/db/seed.js';
import { EventBroadcaster } from '../../src/events/broadcaster.js';
import { ROLES, type Role } from '../../src/domain/status.js';

interface DataRuntime {
  db: PGlite;
  socketServer: PGLiteSocketServer;
  pool: Pool;
}

interface ServiceRuntime {
  app: Express;
  server: Server;
  broadcaster: EventBroadcaster;
  baseUrl: string;
}

export interface Harness {
  pool: Pool;
  app: Express;
  baseUrl: string;
  credentials: Record<Role, SeedAccount>;
  loginCookie(role: Role): Promise<string>;
  restartService(): Promise<void>;
  restartDatabase(): Promise<void>;
  close(): Promise<void>;
}

function credentialsFor(): Record<Role, SeedAccount> {
  const suffix = randomBytes(6).toString('hex');
  return Object.fromEntries(
    ROLES.map((role) => [role, {
      role,
      username: `${role}_${suffix}`,
      password: `Test!${suffix}!${role}`,
    }]),
  ) as Record<Role, SeedAccount>;
}

/**
 * 集成测试基座：PostgreSQL 18 引擎（PGlite WASM）监听真实 TCP，
 * 被测服务使用 pg 驱动与真实 WebSocket 连接，不使用模拟 DB/模拟 UI。
 */
export async function createHarness(): Promise<Harness> {
  const dataDir = await mkdtemp(join(tmpdir(), 'tlf-pg-'));
  const credentials = credentialsFor();
  let data: DataRuntime;
  let service: ServiceRuntime;

  async function openData(seed: boolean): Promise<DataRuntime> {
    const db = new PGlite(dataDir);
    await db.waitReady;
    const socketServer = new PGLiteSocketServer({ db, port: 0, host: '127.0.0.1', maxConnections: 20 });
    await socketServer.start();
    const pool = createPool(`postgresql://postgres@${socketServer.getServerConn()}/postgres`);
    await runMigrations(pool);
    if (seed) await seedUsers(pool, ROLES.map((role) => credentials[role]));
    return { db, socketServer, pool };
  }

  async function closeData(runtime: DataRuntime): Promise<void> {
    await runtime.pool.end();
    await runtime.socketServer.stop();
    await runtime.db.close();
  }

  async function startService(runtime: DataRuntime): Promise<ServiceRuntime> {
    const broadcaster = new EventBroadcaster();
    const app = createApp({
      pool: runtime.pool,
      broadcaster,
      ai: new DeterministicDraftAdapter(),
      session: { cookieName: 'lf_session', ttlSeconds: 3600, secure: false },
    });
    const server = createServer(app);
    const sockets = attachWebSockets(server, {
      pool: runtime.pool,
      cookieName: 'lf_session',
      broadcaster,
    });
    (server as Server & { __sockets?: typeof sockets }).__sockets = sockets;
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('failed to listen');
    return { app, server, broadcaster, baseUrl: `http://127.0.0.1:${address.port}` };
  }

  async function stopService(runtime: ServiceRuntime): Promise<void> {
    const sockets = (runtime.server as Server & { __sockets?: Awaited<ReturnType<typeof attachWebSockets>> }).__sockets;
    if (sockets) await sockets.close();
    const closing = new Promise<void>((resolve) => runtime.server.close(() => resolve()));
    runtime.server.closeAllConnections();
    await closing;
    runtime.broadcaster.close();
  }

  data = await openData(true);
  service = await startService(data);

  return {
    get pool() { return data.pool; },
    get app() { return service.app; },
    get baseUrl() { return service.baseUrl; },
    credentials,
    async loginCookie(role) {
      const response = await request(service.app)
        .post('/sessions')
        .send({ username: credentials[role].username, password: credentials[role].password })
        .expect(200);
      const cookie = response.headers['set-cookie']?.[0];
      if (!cookie) throw new Error('login did not set cookie');
      return cookie.split(';')[0];
    },
    async restartService() {
      await stopService(service);
      service = await startService(data);
    },
    async restartDatabase() {
      await stopService(service);
      await closeData(data);
      data = await openData(false);
      service = await startService(data);
    },
    async close() {
      await stopService(service);
      await closeData(data);
      await rm(dataDir, { recursive: true, force: true });
    },
  };
}
