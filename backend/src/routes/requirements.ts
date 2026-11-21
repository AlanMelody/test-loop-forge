import { Router } from 'express';
import type { AppContext } from '../context.js';
import { requireAuth } from '../auth/middleware.js';
import { asyncRoute } from '../domain/errors.js';
import { createRequirementSchema } from '../domain/validation.js';
import { ROLES, STATE_MACHINE, type Role, type Status } from '../domain/status.js';
import { createDocument, getDocumentSnapshot } from '../collab/persistence.js';
import { findRequirement, listMembers, parseRequirementId, requireRequirement, toListItem } from '../domain/repository.js';

interface GenerationRow {
  id: string;
  section: 'prd' | 'technical' | 'frontend' | 'tests';
  content: string;
  status: 'draft' | 'approved' | 'rejected' | 'superseded';
  document_version: number;
}

interface TransitionRow {
  id: string;
  from_status: Status;
  to_status: Status;
  decision: 'approve' | 'reject';
  reason: string | null;
  generation_id: string;
  actor_id: string;
  actor_role: Role;
  from_version: number;
  to_version: number;
  created_at: Date;
}

export function requirementRoutes(ctx: AppContext): Router {
  const router = Router();
  const auth = requireAuth(ctx.pool, ctx.session);

  router.get('/requirements', auth, asyncRoute(async (_req, res) => {
    const { rows } = await ctx.pool.query<{
      id: string; title: string; status: Status; version: number;
    }>('SELECT id, title, status, version FROM requirements ORDER BY created_at DESC, id DESC');
    res.json({ items: rows });
  }));

  router.post('/requirements', auth, asyncRoute(async (req, res) => {
    const { title } = createRequirementSchema.parse(req.body);
    const client = await ctx.pool.connect();
    let created;
    try {
      await client.query('BEGIN');
      const inserted = await client.query<{
        id: string; title: string; status: Status; version: number;
      }>('INSERT INTO requirements(title) VALUES ($1) RETURNING id, title, status, version', [title]);
      created = inserted.rows[0];
      for (const role of ROLES) {
        const users = await client.query<{ id: string }>('SELECT id FROM users WHERE role=$1', [role]);
        if (!users.rows[0]) throw new Error(`Missing seed user for role ${role}`);
        await client.query(
          'INSERT INTO requirement_members(requirement_id, user_id, role) VALUES ($1,$2,$3)',
          [created.id, users.rows[0].id, role],
        );
      }
      await createDocument(client, created.id);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    ctx.broadcaster.broadcast({
      type: 'requirement.updated',
      requirementId: created.id,
      version: created.version,
      data: created,
    });
    res.json(created);
  }));

  router.get('/requirements/:id', auth, asyncRoute(async (req, res) => {
    const id = parseRequirementId(req.params.id);
    const requirement = await requireRequirement(ctx.pool, id);
    const [members, document, generations, transitions] = await Promise.all([
      listMembers(ctx.pool, id),
      getDocumentSnapshot(ctx.pool, id),
      (async () => {
        const section = STATE_MACHINE[requirement.status].section;
        if (!section) return [];
        const { rows } = await ctx.pool.query<GenerationRow>(
          `SELECT id, section, content, status, document_version
             FROM generations WHERE requirement_id=$1 AND section=$2
            ORDER BY created_at DESC, id DESC LIMIT 1`,
          [id, section],
        );
        return rows;
      })(),
      ctx.pool.query<TransitionRow>(
        `SELECT t.id, t.from_status, t.to_status, t.decision, t.reason, t.generation_id,
                t.actor_id, u.role AS actor_role, t.from_version, t.to_version, t.created_at
           FROM transitions t JOIN users u ON u.id=t.actor_id
          WHERE t.requirement_id=$1 ORDER BY t.created_at ASC, t.id ASC`,
        [id],
      ),
    ]);
    if (!document) throw new Error(`Missing document for requirement ${id}`);
    const generation = generations[0];
    res.json({
      ...toListItem(requirement),
      members,
      document: { id: document.id, sections: document.sections },
      generation: generation
        ? {
            id: generation.id,
            section: generation.section,
            content: generation.content,
            status: generation.status,
            documentVersion: generation.document_version,
          }
        : null,
      transitions: transitions.rows.map((row) => ({
        id: row.id,
        fromStatus: row.from_status,
        toStatus: row.to_status,
        decision: row.decision,
        reason: row.reason,
        generationId: row.generation_id,
        actor: { id: row.actor_id, role: row.actor_role },
        fromVersion: row.from_version,
        toVersion: row.to_version,
        createdAt: row.created_at.toISOString(),
      })),
    });
  }));

  return router;
}

export { findRequirement };
