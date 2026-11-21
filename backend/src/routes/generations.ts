import { Router } from 'express';
import type { AppContext } from '../context.js';
import { requireAuth } from '../auth/middleware.js';
import { ApiError, asyncRoute } from '../domain/errors.js';
import { generationSchema } from '../domain/validation.js';
import { STATE_MACHINE, type Section } from '../domain/status.js';
import { requireRequirement } from '../domain/repository.js';
import { getDocumentSnapshot } from '../collab/persistence.js';

interface GenerationRow {
  id: string;
  section: Section;
  content: string;
  status: 'draft' | 'approved' | 'rejected' | 'superseded';
  document_version: number;
  expected_version: number;
}

function present(row: GenerationRow) {
  return {
    id: row.id,
    section: row.section,
    content: row.content,
    status: row.status,
    documentVersion: row.document_version,
  };
}

const GENERATION_COLUMNS = `id, section, content, status, document_version, expected_version`;

export function generationRoutes(ctx: AppContext): Router {
  const router = Router();

  router.post('/requirements/:id/generations', requireAuth(ctx.pool, ctx.session), asyncRoute(async (req, res) => {
    const requirement = await requireRequirement(ctx.pool, req.params.id);
    const { expectedVersion, idempotencyKey } = generationSchema.parse(req.body);
    if (expectedVersion !== requirement.version) {
      throw new ApiError(409, '版本已变化，请重新获取需求详情');
    }
    const section = STATE_MACHINE[requirement.status].section;
    if (!section) throw new ApiError(422, '终态需求不再生成草稿');

    const existing = await ctx.pool.query<GenerationRow>(
      `SELECT ${GENERATION_COLUMNS} FROM generations WHERE requirement_id=$1 AND idempotency_key=$2`,
      [requirement.id, idempotencyKey],
    );
    if (existing.rows[0]) {
      if (existing.rows[0].expected_version !== expectedVersion) {
        throw new ApiError(409, '幂等键已用于其他版本');
      }
      res.json(present(existing.rows[0]));
      return;
    }

    const document = await getDocumentSnapshot(ctx.pool, requirement.id);
    if (!document) throw new ApiError(422, '需求文档不存在');
    const draft = await ctx.ai.generate({
      requirementId: requirement.id,
      title: requirement.title,
      status: requirement.status,
      section,
      currentSections: document.sections,
      documentVersion: document.version,
    });

    const client = await ctx.pool.connect();
    let result: GenerationRow;
    try {
      await client.query('BEGIN');
      const locked = await client.query<{ version: number }>(
        'SELECT version FROM requirements WHERE id=$1 FOR UPDATE',
        [requirement.id],
      );
      if (!locked.rows[0]) throw new ApiError(422, '需求不存在');
      if (locked.rows[0].version !== expectedVersion) {
        throw new ApiError(409, '版本已变化，请重新获取需求详情');
      }
      const duplicate = await client.query<GenerationRow>(
        `SELECT ${GENERATION_COLUMNS} FROM generations WHERE requirement_id=$1 AND idempotency_key=$2`,
        [requirement.id, idempotencyKey],
      );
      if (duplicate.rows[0]) {
        if (duplicate.rows[0].expected_version !== expectedVersion) {
          throw new ApiError(409, '幂等键已用于其他版本');
        }
        await client.query('COMMIT');
        res.json(present(duplicate.rows[0]));
        return;
      }
      await client.query(
        `UPDATE generations SET status='superseded'
          WHERE requirement_id=$1 AND section=$2 AND status='draft'`,
        [requirement.id, section],
      );
      const inserted = await client.query<GenerationRow>(
        `INSERT INTO generations(
           requirement_id, section, content, status, document_version, expected_version, idempotency_key, created_by)
         VALUES ($1,$2,$3,'draft',$4,$5,$6,$7)
         RETURNING ${GENERATION_COLUMNS}`,
        [requirement.id, section, draft.content, document.version, expectedVersion, idempotencyKey, req.user!.id],
      );
      result = inserted.rows[0];
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    res.json(present(result));
  }));

  return router;
}
