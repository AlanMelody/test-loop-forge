import pg from 'pg';
import { loadEnv } from '../config/env.js';

export type Pool = pg.Pool;

export function createPool(connectionString: string): Pool {
  return new pg.Pool({
    connectionString,
    max: 10,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
  });
}

let singleton: Pool | undefined;

/** 服务进程使用的共享连接池；测试直接调用 createPool 以使用独立测试库。 */
export function getPool(): Pool {
  if (!singleton) {
    singleton = createPool(loadEnv().databaseUrl);
  }
  return singleton;
}
