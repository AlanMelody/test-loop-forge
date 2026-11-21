import * as Y from 'yjs';
import type { Pool } from '../db/pool.js';
import { SECTIONS, type Section } from '../domain/status.js';

export type Sections = Record<Section, string>;
export const LOAD_ORIGIN = Symbol('database-load');

export function emptySections(): Sections {
  return { prd: '', technical: '', frontend: '', tests: '' };
}

export function sectionsFromDoc(doc: Y.Doc): Sections {
  const result = emptySections();
  for (const section of SECTIONS) {
    result[section] = doc.getText(section).toString();
  }
  return result;
}

export interface LoadedDocument {
  docId: string;
  version: number;
  doc: Y.Doc;
  sections: Sections;
}

/** 创建需求时一并创建唯一文档，并保存初始 Yjs 状态（更新版本 1）。 */
export async function createDocument(
  client: import('pg').PoolClient,
  requirementId: string,
): Promise<{ id: string; version: number }> {
  const doc = new Y.Doc();
  const initialState = Y.encodeStateAsUpdate(doc);
  const { rows } = await client.query<{ id: string; version: number }>(
    `INSERT INTO documents(requirement_id, version, snapshot)
     VALUES ($1, 1, $2::jsonb) RETURNING id, version`,
    [requirementId, JSON.stringify(emptySections())],
  );
  await client.query(
    'INSERT INTO document_updates(document_id, version, update) VALUES ($1, 1, $2)',
    [rows[0].id, Buffer.from(initialState)],
  );
  doc.destroy();
  return rows[0];
}

/** 从最新快照 + 后续增量重建文档；服务重启后走此路径。 */
export async function loadDocument(pool: Pool, requirementId: string): Promise<LoadedDocument> {
  const { rows } = await pool.query<{ id: string; version: number }>(
    'SELECT id, version FROM documents WHERE requirement_id=$1',
    [requirementId],
  );
  if (!rows[0]) throw new Error(`No document for requirement ${requirementId}`);

  const doc = new Y.Doc();
  const snapshotResult = await pool.query<{ version: number; state: Buffer }>(
    'SELECT version, state FROM document_snapshots WHERE document_id=$1 ORDER BY version DESC LIMIT 1',
    [rows[0].id],
  );
  const snapshot = snapshotResult.rows[0];
  if (snapshot) {
    Y.applyUpdate(doc, new Uint8Array(snapshot.state), LOAD_ORIGIN);
  }
  const updates = await pool.query<{ version: number; update: Buffer }>(
    `SELECT version, update FROM document_updates
      WHERE document_id=$1 ${snapshot ? 'AND version > $2' : ''}
      ORDER BY version ASC`,
    snapshot ? [rows[0].id, snapshot.version] : [rows[0].id],
  );
  for (const row of updates.rows) {
    Y.applyUpdate(doc, new Uint8Array(row.update), LOAD_ORIGIN);
  }
  return { docId: rows[0].id, version: rows[0].version, doc, sections: sectionsFromDoc(doc) };
}

export async function getDocumentSnapshot(
  pool: Pool,
  requirementId: string,
): Promise<{ id: string; version: number; sections: Sections } | null> {
  const { rows } = await pool.query<{ id: string; version: number; snapshot: Sections }>(
    'SELECT id, version, snapshot FROM documents WHERE requirement_id=$1',
    [requirementId],
  );
  return rows[0] ? { id: rows[0].id, version: rows[0].version, sections: rows[0].snapshot } : null;
}

export interface PersistedUpdate {
  documentVersion: number;
  snapshotted: boolean;
}

/** 在事务中递增文档版本、追加 Yjs 增量并刷新四章节快照。 */
export async function persistUpdate(
  pool: Pool,
  documentId: string,
  doc: Y.Doc,
  update: Uint8Array,
): Promise<PersistedUpdate> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query<{ version: number }>(
      `UPDATE documents SET version=version+1, snapshot=$2::jsonb, updated_at=now()
        WHERE id=$1 RETURNING version`,
      [documentId, JSON.stringify(sectionsFromDoc(doc))],
    );
    const version = rows[0].version;
    await client.query(
      'INSERT INTO document_updates(document_id, version, update) VALUES ($1,$2,$3)',
      [documentId, version, Buffer.from(update)],
    );
    let snapshotted = false;
    if (version % 100 === 0) {
      await client.query(
        'INSERT INTO document_snapshots(document_id, version, state, snapshot) VALUES ($1,$2,$3,$4::jsonb)',
        [documentId, version, Buffer.from(Y.encodeStateAsUpdate(doc)), JSON.stringify(sectionsFromDoc(doc))],
      );
      snapshotted = true;
    }
    await client.query('COMMIT');
    return { documentVersion: version, snapshotted };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
