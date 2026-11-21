import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hashPassword } from '../auth/password.js';
import { loadEnv, loadSeedAccounts, type SeedAccount } from '../config/env.js';
import { createPool, type Pool } from './pool.js';

export interface SeededUser {
  id: string;
  username: string;
  role: SeedAccount['role'];
}

/** 四固定账号初始化；密码由调用方（环境变量或测试 setup）提供，不写入仓库。 */
export async function seedUsers(pool: Pool, accounts: SeedAccount[]): Promise<SeededUser[]> {
  const seeded: SeededUser[] = [];
  for (const account of accounts) {
    const passwordHash = await hashPassword(account.password);
    const { rows } = await pool.query<SeededUser>(
      `INSERT INTO users(username, role, password_hash)
       VALUES ($1,$2,$3)
       ON CONFLICT (username) DO UPDATE SET role=EXCLUDED.role, password_hash=EXCLUDED.password_hash
       RETURNING id, username, role`,
      [account.username, account.role, passwordHash],
    );
    seeded.push(rows[0]);
  }
  return seeded;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const pool = createPool(loadEnv().databaseUrl);
  try {
    const users = await seedUsers(pool, loadSeedAccounts());
    console.log(`seeded ${users.length} fixed accounts: ${users.map((u) => `${u.username}(${u.role})`).join(', ')}`);
  } finally {
    await pool.end();
  }
}
