import { Router } from 'express';
import type { AppContext } from '../context.js';
import { verifyPassword } from '../auth/password.js';
import { createSession, deleteSession } from '../auth/session.js';
import { requireAuth } from '../auth/middleware.js';
import { ApiError, asyncRoute } from '../domain/errors.js';
import { loginSchema } from '../domain/validation.js';

interface UserRow {
  id: string;
  username: string;
  role: 'pm' | 'backend' | 'frontend' | 'test';
  password_hash: string;
}

export function sessionRoutes(ctx: AppContext): Router {
  const router = Router();

  router.post('/sessions', asyncRoute(async (req, res) => {
    const { username, password } = loginSchema.parse(req.body);
    const { rows } = await ctx.pool.query<UserRow>(
      'SELECT id, username, role, password_hash FROM users WHERE username=$1',
      [username],
    );
    const user = rows[0];
    if (!user || !(await verifyPassword(password, user.password_hash))) {
      throw new ApiError(401, '用户名或密码错误');
    }
    await createSession(ctx.pool, user.id, res, ctx.session);
    res.json({ user: { id: user.id, username: user.username, role: user.role } });
  }));

  router.delete('/sessions', requireAuth(ctx.pool, ctx.session), asyncRoute(async (req, res) => {
    await deleteSession(ctx.pool, req.sessionToken);
    res.clearCookie(ctx.session.cookieName, { path: '/' });
    res.status(204).end();
  }));

  return router;
}
