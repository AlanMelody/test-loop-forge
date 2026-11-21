import { createServer } from 'node:http';
import { createApp } from './app.js';
import { createAiAdapter } from './ai/deterministic.js';
import { loadEnv } from './config/env.js';
import { attachWebSockets } from './collab/wss.js';
import { createPool } from './db/pool.js';
import { EventBroadcaster } from './events/broadcaster.js';

const env = loadEnv();
const pool = createPool(env.databaseUrl);
const broadcaster = new EventBroadcaster();
const app = createApp({
  pool,
  broadcaster,
  ai: createAiAdapter(env.aiAdapter),
  session: {
    cookieName: env.sessionCookieName,
    ttlSeconds: env.sessionTtlSeconds,
    secure: env.nodeEnv === 'production',
  },
});
const server = createServer(app);
const sockets = attachWebSockets(server, {
  pool,
  cookieName: env.sessionCookieName,
  broadcaster,
});

server.listen(env.port, () => {
  console.log(`backend listening on http://127.0.0.1:${env.port}`);
});

async function shutdown(): Promise<void> {
  server.close();
  await sockets.close();
  broadcaster.close();
  await pool.end();
  process.exit(0);
}

process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());
