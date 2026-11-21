import { Router } from 'express';
import type { AppContext } from '../context.js';
import { requireAuth } from '../auth/middleware.js';
import { asyncRoute } from '../domain/errors.js';
import { createCommentSchema } from '../domain/validation.js';
import { requireRequirement, toListItem } from '../domain/repository.js';

interface CommentRow {
  id: string;
  author_id: string;
  role: 'pm' | 'backend' | 'frontend' | 'test';
  content: string;
  created_at: Date;
}

function present(row: CommentRow) {
  return {
    id: row.id,
    author: { id: row.author_id, role: row.role },
    content: row.content,
    createdAt: row.created_at.toISOString(),
  };
}

export function commentRoutes(ctx: AppContext): Router {
  const router = Router();
  const auth = requireAuth(ctx.pool, ctx.session);

  router.get('/requirements/:id/comments', auth, asyncRoute(async (req, res) => {
    const requirement = await requireRequirement(ctx.pool, req.params.id);
    const { rows } = await ctx.pool.query<CommentRow>(
      `SELECT c.id, c.author_id, u.role, c.content, c.created_at
         FROM comments c JOIN users u ON u.id=c.author_id
        WHERE c.requirement_id=$1 ORDER BY c.created_at ASC, c.id ASC`,
      [requirement.id],
    );
    res.json({ items: rows.map(present) });
  }));

  router.post('/requirements/:id/comments', auth, asyncRoute(async (req, res) => {
    const requirement = await requireRequirement(ctx.pool, req.params.id);
    const { content } = createCommentSchema.parse(req.body);
    const { rows } = await ctx.pool.query<CommentRow>(
      `INSERT INTO comments(requirement_id, author_id, content)
       VALUES ($1,$2,$3)
       RETURNING id, author_id, (SELECT role FROM users WHERE id=$2) AS role, content, created_at`,
      [requirement.id, req.user!.id, content],
    );
    const comment = present(rows[0]);
    ctx.broadcaster.broadcast({
      type: 'comment.created',
      requirementId: requirement.id,
      version: requirement.version,
      data: comment,
    });
    res.json(comment);
  }));

  return router;
}

export { toListItem };
