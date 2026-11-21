import type { NextFunction, Request, Response } from 'express';
import type { Pool } from '../db/pool.js';
import { ApiError } from '../domain/errors.js';
import { authenticateToken, readToken, type SessionConfig } from './session.js';

export function requireAuth(pool: Pool, config: Pick<SessionConfig, 'cookieName'>) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      const token = readToken(req, config.cookieName);
      const user = await authenticateToken({ pool, cookieName: config.cookieName }, token);
      if (!user) throw new ApiError(401, '请先登录');
      req.user = user;
      req.sessionToken = token;
      next();
    } catch (error) {
      next(error);
    }
  };
}
