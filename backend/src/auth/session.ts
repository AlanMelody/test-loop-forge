import { createHash, randomBytes } from 'node:crypto';
import type { Request, Response } from 'express';
import type { Pool } from '../db/pool.js';
import type { Role } from '../domain/status.js';

export interface AuthenticatedUser {
  id: string;
  username: string;
  role: Role;
}

export interface SessionConfig {
  cookieName: string;
  ttlSeconds: number;
  secure: boolean;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
      sessionToken?: string;
    }
  }
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function parseCookies(header: string | undefined): Record<string, string> {
  const result: Record<string, string> = {};
  if (!header) return result;
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index < 0) continue;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (key) result[key] = decodeURIComponent(value);
  }
  return result;
}

export function readToken(req: Request, cookieName: string): string | undefined {
  return req.cookies?.[cookieName] ?? parseCookies(req.headers.cookie)[cookieName];
}

export async function createSession(
  pool: Pool,
  userId: string,
  res: Response,
  config: SessionConfig,
): Promise<void> {
  const token = randomBytes(32).toString('base64url');
  await pool.query(
    'INSERT INTO sessions(token_hash, user_id, expires_at) VALUES ($1,$2, now() + ($3 * interval \'1 second\'))',
    [hashToken(token), userId, config.ttlSeconds],
  );
  res.cookie(config.cookieName, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.secure,
    path: '/',
    maxAge: config.ttlSeconds * 1000,
  });
}

export async function deleteSession(pool: Pool, token: string | undefined): Promise<void> {
  if (!token) return;
  await pool.query('DELETE FROM sessions WHERE token_hash=$1', [hashToken(token)]);
}

export interface SessionLookup {
  pool: Pool;
  cookieName: string;
}

/** 同时供 HTTP 中间件与 WebSocket upgrade 使用；过期会话返回 null。 */
export async function authenticateToken({ pool, cookieName }: SessionLookup, token: string | undefined): Promise<AuthenticatedUser | null> {
  if (!token) return null;
  const { rows } = await pool.query<AuthenticatedUser>(
    `SELECT u.id, u.username, u.role
       FROM sessions s JOIN users u ON u.id=s.user_id
      WHERE s.token_hash=$1 AND s.expires_at > now()`,
    [hashToken(token)],
  );
  return rows[0] ?? null;
}
