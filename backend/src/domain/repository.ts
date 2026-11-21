import type { Pool } from '../db/pool.js';
import { ApiError } from './errors.js';
import type { Role, Status } from './status.js';
import { uuidSchema } from './validation.js';

export interface RequirementRow {
  id: string;
  title: string;
  status: Status;
  version: number;
  created_at: Date;
  updated_at: Date;
}

export interface RequirementListItem {
  id: string;
  title: string;
  status: Status;
  version: number;
}

export function parseRequirementId(raw: string): string {
  const result = uuidSchema.safeParse(raw);
  if (!result.success) throw new ApiError(422, '无效的需求 ID');
  return result.data;
}

export async function findRequirement(pool: Pool, id: string): Promise<RequirementRow | null> {
  const { rows } = await pool.query<RequirementRow>('SELECT * FROM requirements WHERE id=$1', [id]);
  return rows[0] ?? null;
}

export async function requireRequirement(pool: Pool, rawId: string): Promise<RequirementRow> {
  const id = parseRequirementId(rawId);
  const row = await findRequirement(pool, id);
  if (!row) throw new ApiError(422, '需求不存在');
  return row;
}

export function toListItem(row: RequirementRow): RequirementListItem {
  return { id: row.id, title: row.title, status: row.status, version: row.version };
}

export interface MemberRow {
  id: string;
  username: string;
  role: Role;
}

export async function listMembers(pool: Pool, requirementId: string): Promise<MemberRow[]> {
  const { rows } = await pool.query<MemberRow>(
    `SELECT u.id, u.username, m.role
       FROM requirement_members m JOIN users u ON u.id=m.user_id
      WHERE m.requirement_id=$1
      ORDER BY CASE m.role WHEN 'pm' THEN 1 WHEN 'backend' THEN 2 WHEN 'frontend' THEN 3 ELSE 4 END`,
    [requirementId],
  );
  return rows;
}

export async function getDocumentVersion(pool: Pool, requirementId: string): Promise<number> {
  const { rows } = await pool.query<{ version: number }>(
    'SELECT version FROM documents WHERE requirement_id=$1',
    [requirementId],
  );
  return rows[0]?.version ?? 0;
}
