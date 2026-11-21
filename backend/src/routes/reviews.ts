import { Router } from 'express';
import type { AppContext } from '../context.js';
import { requireAuth } from '../auth/middleware.js';
import { ApiError, asyncRoute } from '../domain/errors.js';
import { reviewSchema } from '../domain/validation.js';
import { STATE_MACHINE, type Status } from '../domain/status.js';
import { requireRequirement } from '../domain/repository.js';

interface GenerationForReview {
  id: string;
  section: string;
  status: 'draft' | 'approved' | 'rejected' | 'superseded';
  document_version: number;
  expected_version: number;
}

export function reviewRoutes(ctx: AppContext): Router {
  const router = Router();

  router.post('/requirements/:id/reviews', requireAuth(ctx.pool, ctx.session), asyncRoute(async (req, res) => {
    const requirement = await requireRequirement(ctx.pool, req.params.id);
    const input = reviewSchema.parse(req.body);
    const rule = STATE_MACHINE[requirement.status];
    if (!rule.reviewer) throw new ApiError(422, '终态需求不再审批');
    if (rule.reviewer !== req.user!.role) {
      throw new ApiError(403, `当前阶段需由 ${rule.reviewer} 审批`);
    }
    if (input.decision === 'reject' && !input.reason?.trim()) {
      throw new ApiError(422, '打回必须填写理由');
    }

    const client = await ctx.pool.connect();
    let result: { id: string; title: string; status: Status; version: number };
    try {
      await client.query('BEGIN');
      const locked = await client.query<{ status: Status; version: number }>(
        'SELECT status, version FROM requirements WHERE id=$1 FOR UPDATE',
        [requirement.id],
      );
      const current = locked.rows[0];
      if (!current) throw new ApiError(422, '需求不存在');
      if (current.version !== input.expectedVersion) {
        throw new ApiError(409, '版本已变化，请重新获取需求详情后再审批');
      }
      const currentRule = STATE_MACHINE[current.status];
      if (!currentRule.reviewer) throw new ApiError(422, '终态需求不再审批');
      if (currentRule.reviewer !== req.user!.role) {
        throw new ApiError(403, `当前阶段需由 ${currentRule.reviewer} 审批`);
      }
      if (!currentRule.section || !currentRule.approve || !currentRule.reject) {
        throw new ApiError(422, '当前状态不支持审批');
      }

      const generations = await client.query<GenerationForReview>(
        `SELECT id, section, status, document_version, expected_version
           FROM generations WHERE id=$1 AND requirement_id=$2`,
        [input.generationId, requirement.id],
      );
      const generation = generations.rows[0];
      if (!generation) throw new ApiError(422, '草稿不存在或不属于该需求');
      if (generation.section !== currentRule.section || generation.status !== 'draft') {
        throw new ApiError(422, '只能审批当前章节的最新草稿');
      }
      const doc = await client.query<{ version: number }>(
        'SELECT version FROM documents WHERE requirement_id=$1 FOR SHARE',
        [requirement.id],
      );
      if (!doc.rows[0] || doc.rows[0].version !== generation.document_version) {
        throw new ApiError(409, '草稿生成后文档已被编辑，请重新生成草稿');
      }
      if (generation.expected_version !== input.expectedVersion) {
        throw new ApiError(409, '草稿对应的需求版本已过期，请重新生成草稿');
      }

      const nextStatus = input.decision === 'approve' ? currentRule.approve : currentRule.reject;
      const updated = await client.query<{ id: string; title: string; status: Status; version: number }>(
        `UPDATE requirements SET status=$2, version=version+1, updated_at=now()
          WHERE id=$1 AND version=$3
          RETURNING id, title, status, version`,
        [requirement.id, nextStatus, input.expectedVersion],
      );
      if (!updated.rows[0]) throw new ApiError(409, '并发审批冲突，请重新获取需求详情');
      result = updated.rows[0];

      await client.query(
        "UPDATE generations SET status=$2 WHERE id=$1 AND status='draft'",
        [generation.id, input.decision === 'approve' ? 'approved' : 'rejected'],
      );
      await client.query(
        `INSERT INTO transitions(
           requirement_id, from_status, to_status, decision, reason,
           generation_id, actor_id, from_version, to_version)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [
          requirement.id,
          current.status,
          nextStatus,
          input.decision,
          input.decision === 'reject' ? input.reason!.trim() : (input.reason?.trim() ?? null),
          generation.id,
          req.user!.id,
          current.version,
          result.version,
        ],
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

    ctx.broadcaster.broadcast({
      type: 'requirement.updated',
      requirementId: result.id,
      version: result.version,
      data: result,
    });
    res.json(result);
  }));

  return router;
}
