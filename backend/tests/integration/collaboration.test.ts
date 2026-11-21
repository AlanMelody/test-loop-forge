import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { createHarness, type Harness } from '../helpers/harness.js';
import { connectEvents, waitFor, YClient } from '../helpers/yClient.js';
import { getDocumentSnapshot } from '../../src/collab/persistence.js';
import type { Role } from '../../src/domain/status.js';

describe('Yjs 实时协作与事件广播（真实 WebSocket + PostgreSQL）', () => {
  let harness: Harness;
  let cookies: Record<Role, string>;

  beforeAll(async () => {
    harness = await createHarness();
    cookies = {
      pm: await harness.loginCookie('pm'),
      backend: await harness.loginCookie('backend'),
      frontend: await harness.loginCookie('frontend'),
      test: await harness.loginCookie('test'),
    };
  }, 60_000);

  afterAll(async () => {
    await harness?.close();
  });

  async function createRequirement(title: string): Promise<string> {
    const response = await request(harness.app)
      .post('/requirements')
      .set('Cookie', cookies.pm)
      .send({ title })
      .expect(200);
    return response.body.id as string;
  }

  async function snapshot(requirementId: string): Promise<string> {
    const document = await getDocumentSnapshot(harness.pool, requirementId);
    if (!document) throw new Error('document missing');
    return document.sections.prd;
  }

  async function connect(role: Role, requirementId: string): Promise<YClient> {
    const url = `${harness.baseUrl.replace('http://', 'ws://')}/collaboration?requirementId=${requirementId}`;
    return YClient.connect(url, cookies[role]);
  }

  it('AC-6 两个客户端并发编辑同一章节后收敛并持久化', async () => {
    const requirementId = await createRequirement('并发编辑');
    const clientA = await connect('pm', requirementId);
    const clientB = await connect('backend', requirementId);
    try {
      clientA.insert('prd', 0, 'AAAA');
      clientB.insert('prd', 0, 'BBBB');
      await waitFor(() =>
        clientA.text('prd').length === 8 &&
        clientB.text('prd').length === 8 &&
        clientA.text('prd') === clientB.text('prd'));
      const merged = clientA.text('prd');
      expect(['AAAABBBB', 'BBBBAAAA']).toContain(merged);
      await waitFor(async () => (await snapshot(requirementId)) === merged);
      expect(await snapshot(requirementId)).toBe(merged);
    } finally {
      clientA.close();
      clientB.close();
    }
  }, 20_000);

  it('AC-7 断线重连与服务重启后内容保留', async () => {
    const requirementId = await createRequirement('断线恢复');
    const first = await connect('pm', requirementId);
    first.insert('prd', 0, 'hello');
    await waitFor(async () => (await snapshot(requirementId)) === 'hello');
    first.close();

    const second = await connect('backend', requirementId);
    second.insert('prd', 5, ' world');
    await waitFor(async () => (await snapshot(requirementId)) === 'hello world');

    const reconnected = await connect('pm', requirementId);
    await reconnected.waitForText('prd', 'hello world');
    reconnected.close();
    second.close();

    await harness.restartDatabase();
    const afterRestart = await connect('frontend', requirementId);
    await afterRestart.waitForText('prd', 'hello world');
    const detail = await request(harness.app)
      .get(`/requirements/${requirementId}`)
      .set('Cookie', cookies.pm)
      .expect(200);
    expect(detail.body.document.sections.prd).toBe('hello world');
    afterRestart.close();
  }, 60_000);

  it('AC-8 不同需求的文档互不干扰', async () => {
    const requirementA = await createRequirement(`隔离 A ${randomUUID()}`);
    const requirementB = await createRequirement(`隔离 B ${randomUUID()}`);
    const clientA = await connect('pm', requirementA);
    try {
      clientA.insert('prd', 0, '只写 A');
      await waitFor(async () => (await snapshot(requirementA)) === '只写 A');
      expect(await snapshot(requirementB)).toBe('');
      const clientB = await connect('test', requirementB);
      expect(clientB.text('prd')).toBe('');
      clientB.close();
    } finally {
      clientA.close();
    }
  }, 20_000);

  it('AC-10 看板状态与评论通过 /events 广播正确结构', async () => {
    const events = await connectEvents(harness.baseUrl, cookies.pm);
    try {
      const requirementId = await createRequirement('事件广播');
      await request(harness.app)
        .post(`/requirements/${requirementId}/comments`)
        .set('Cookie', cookies.backend)
        .send({ content: '事件通道测试' })
        .expect(200);
      await waitFor(() => events.messages.length >= 2);
      const created = events.messages.find((m) => m.type === 'requirement.updated');
      const comment = events.messages.find((m) => m.type === 'comment.created');
      expect(created).toMatchObject({ requirementId, version: 1 });
      expect((created?.data as any).status).toBe('draft');
      expect(comment).toMatchObject({ requirementId, version: 1 });
      expect((comment?.data as any).content).toBe('事件通道测试');
    } finally {
      events.close();
    }
  });

  it('未认证 WebSocket 升级被拒绝', async () => {
    const requirementId = await createRequirement('WS 认证');
    const { WebSocket } = await import('ws');
    const ws = new WebSocket(`${harness.baseUrl.replace('http://', 'ws://')}/collaboration?requirementId=${requirementId}`);
    const result = await new Promise<number>((resolve, reject) => {
      ws.on('unexpected-response', (_req, response) => resolve(response.statusCode ?? 0));
      ws.on('open', () => reject(new Error('unauthenticated WS should not open')));
      ws.on('error', () => undefined);
    });
    expect(result).toBe(401);
  });
});
