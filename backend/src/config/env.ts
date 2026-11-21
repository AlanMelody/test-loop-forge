import 'dotenv/config';

export interface SeedAccount {
  username: string;
  password: string;
  role: 'pm' | 'backend' | 'frontend' | 'test';
}

export interface AppEnv {
  nodeEnv: string;
  port: number;
  databaseUrl: string;
  sessionCookieName: string;
  sessionTtlSeconds: number;
  aiAdapter: string;
}

const PLACEHOLDER_PATTERN = /^<.*>$/;

function readSeedAccount(prefix: SeedAccount['role']): SeedAccount {
  const envKey = prefix.toUpperCase();
  const username = process.env[`SEED_${envKey}_USERNAME`] ?? '';
  const password = process.env[`SEED_${envKey}_PASSWORD`] ?? '';
  return { role: prefix, username, password };
}

export function validateSeedAccounts(accounts: SeedAccount[]): void {
  const seen = new Set<string>();
  for (const account of accounts) {
    if (!account.username || !account.password) {
      throw new Error(`Missing seed credentials for role ${account.role}`);
    }
    if (PLACEHOLDER_PATTERN.test(account.password)) {
      throw new Error(`Placeholder password for role ${account.role}; set a real environment value`);
    }
    if (seen.has(account.username)) {
      throw new Error(`Duplicate seed username: ${account.username}`);
    }
    seen.add(account.username);
  }
}

export function loadEnv(): AppEnv {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required');
  }
  const seedAccounts: SeedAccount[] = [
    readSeedAccount('pm'),
    readSeedAccount('backend'),
    readSeedAccount('frontend'),
    readSeedAccount('test'),
  ];
  validateSeedAccounts(seedAccounts);
  return {
    nodeEnv: process.env.NODE_ENV ?? 'development',
    port: Number(process.env.PORT ?? 4000),
    databaseUrl: process.env.DATABASE_URL,
    sessionCookieName: process.env.SESSION_COOKIE_NAME ?? 'lf_session',
    sessionTtlSeconds: Number(process.env.SESSION_TTL_SECONDS ?? 28_800),
    aiAdapter: process.env.AI_ADAPTER ?? 'deterministic',
  };
}

/** 仅播种时调用；真实凭证必须来自部署环境，不写入代码或文档。 */
export function loadSeedAccounts(): SeedAccount[] {
  const accounts: SeedAccount[] = [
    readSeedAccount('pm'),
    readSeedAccount('backend'),
    readSeedAccount('frontend'),
    readSeedAccount('test'),
  ];
  validateSeedAccounts(accounts);
  return accounts;
}
