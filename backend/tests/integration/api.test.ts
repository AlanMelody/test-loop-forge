import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import request, { type Agent } from 'supertest';
import { createHarness, type Harness } from '../helpers/harness.js';
import { ROLES, type Role, type Status } from '../../src/domain/status.js';

interface Created {
  id: string;
  title: string;
  status: Status;
  version: number;
}

interface Generation {
  id: string;
  section: string;
  content: string;
  status: string;
  documentVersion: number;
}

describe('JSON API 与业务规则（真实 PostgreSQL + HTTP）', () => {
  let harness: Harness;
  let agents: Record<Role, Agent>;
  const observedRoles: Role[] = [];

  beforeAll(async () => {
    harness = await createHarness();
    agents = {} as Record<Role, Agent>;
    for (const role of ROLES) {
      const agent = request.agent(harness.app);
      const response = await agent
        .post('/sessions')
        .send({ username: harness.credentials[role].username, password: harness.credentials[role].password })
        .expect(200);
      expect(response.body.user.role).toBe(role);
      expect(response.headers['set-cookie']?.[0]).toMatch(/HttpOnly/i);
      agents[role] = agent;
      observedRoles.push(response.body.user.role);
    }
  }, 60_000);

  afterAll(async () => {
    await harness?.close();
  });

  async function createRequirement(title = `需求 ${randomUUID()}`): Promise<Created> {
    const response = await agents.pm.post('/requirements').send({ title }).expect(200);
    return response.body as Created;
  }

  async function detail(id: string): Promise<Record<string, any>> {
    const response = await agents.pm.get(`/requirements/${id}`).expect(200);
    return response.body;
  }

  async function generate(role: Role, requirement: Created, idempotencyKey = randomUUID()): Promise<Generation> {
    const response = await agents[role]
      .post(`/requirements/${requirement.id}/generations`)
      .send({ expectedVersion: requirement.version, idempotencyKey })
      .expect(200);
    return response.body as Generation;
  }

  function review(role: Role, requirement: Created, body: Record<string, unknown>) {
    return agents[role].post(`/requirements/${requirement.id}/reviews`).send(body);
  }

  it('AC-1 错误密码返回 401 且不建立会话', async () => {
    const response = await request(harness.app)
      .post('/sessions')
      .send({ username: harness.credentials.pm.username, password: 'definitely-wrong' })
      .expect(401);
    expect(response.body.error.code).toBe('401');
    expect(response.headers['set-cookie']).toBeUndefined();
  });

  it('AC-2 四个固定账号分别登录并返回自身角色', () => {
    expect(observedRoles).toEqual(['pm', 'backend', 'frontend', 'test']);
  });

  it('AC-3 非责任角色审核被 403 拒绝，责任角色可进入', async () => {
    const requirement = await createRequirement();
    const generation = await generate('pm', requirement);
    for (const role of ['backend', 'frontend', 'test'] as Role[]) {
      const response = await review(role, requirement, {
        decision: 'approve',
        generationId: generation.id,
        expectedVersion: requirement.version,
      });
      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe('403');
    }
    const approved = await review('pm', requirement, {
      decision: 'approve',
      generationId: generation.id,
      expectedVersion: requirement.version,
    }).expect(200);
    expect(approved.body.status).toBe('confirmed');
    expect(approved.body.version).toBe(requirement.version + 1);
  });

  it('AC-4 打回保持 draft、理由必填、历史与版本递增', async () => {
    const requirement = await createRequirement('打回路径');
    const generation = await generate('pm', requirement);
    const noReason = await review('pm', requirement, {
      decision: 'reject',
      generationId: generation.id,
      expectedVersion: requirement.version,
    });
    expect(noReason.status).toBe(422);
    expect(noReason.body.error.code).toBe('422');

    const rejected = await review('pm', requirement, {
      decision: 'reject',
      reason:   '范围需要收紧',
      generationId: generation.id,
      expectedVersion: requirement.version,
    }).expect(200);
    expect(rejected.body.status).toBe('draft');
    expect(rejected.body.version).toBe(2);

    const after = await detail(requirement.id);
    expect(after.version).toBe(2);
    expect(after.transitions).toHaveLength(1);
    expect(after.transitions[0]).toMatchObject({
      fromStatus: 'draft',
      toStatus: 'draft',
      decision: 'reject',
      reason: '范围需要收紧',
      fromVersion: 1,
      toVersion: 2,
      actor: { role: 'pm' },
    });
    expect(after.generation.status).toBe('rejected');
  });

  it('AC-5 相同 expectedVersion 的并发审批只有一个成功', async () => {
    const requirement = await createRequirement('并发审批');
    const generation = await generate('pm', requirement);
    const responses = await Promise.all([
      review('pm', requirement, { decision: 'approve', generationId: generation.id, expectedVersion: requirement.version }),
      review('pm', requirement, { decision: 'approve', generationId: generation.id, expectedVersion: requirement.version }),
    ]);
    expect(responses.map((r) => r.status).sort()).toEqual([200, 409]);
    const after = await detail(requirement.id);
    expect(after.status).toBe('confirmed');
    expect(after.version).toBe(2);
    expect(after.transitions).toHaveLength(1);
  });

  it('AC-9 契约错误码、幂等与未知需求处理', async () => {
    const unauth = await request(harness.app).get('/requirements').expect(401);
    expect(unauth.body.error).toMatchObject({ code: '401' });
    const badTitle = await agents.pm.post('/requirements').send({ title: '   ' }).expect(422);
    expect(badTitle.body.error.code).toBe('422');
    const unknown = await agents.pm.get(`/requirements/${randomUUID()}`).expect(422);
    expect(unknown.body.error.code).toBe('422');

    const requirement = await createRequirement('幂等校验');
    const key = randomUUID();
    const first = await generate('pm', requirement, key);
    const repeated = await generate('pm', requirement, key);
    expect(repeated).toEqual(first);
    const stale = await agents.pm
      .post(`/requirements/${requirement.id}/generations`)
      .send({ expectedVersion: 99, idempotencyKey: randomUUID() })
      .expect(409);
    expect(stale.body.error.code).toBe('409');
  });

  it('AC-10 全流程审批到 done，之后不可审批，评论全员可见', async () => {
    const requirement = await createRequirement('全流程');
    const steps: Array<{ status: Status; role: Role; section: string; next: Status }> = [
      { status: 'draft', role: 'pm', section: 'prd', next: 'confirmed' },
      { status: 'confirmed', role: 'pm', section: 'prd', next: 'design' },
      { status: 'design', role: 'backend', section: 'technical', next: 'development' },
      { status: 'development', role: 'frontend', section: 'frontend', next: 'testing' },
      { status: 'testing', role: 'test', section: 'tests', next: 'done' },
    ];
    for (const [index, step] of steps.entries()) {
      const current = await detail(requirement.id);
      expect(current.status).toBe(step.status);
      const generation = await generate(step.role, { ...requirement, version: current.version }, `flow-${requirement.id}-${index}`);
      expect(generation.section).toBe(step.section);
      expect(generation.status).toBe('draft');
      const reviewed = await review(step.role, { ...requirement, version: current.version }, {
        decision: 'approve',
        generationId: generation.id,
        expectedVersion: current.version,
      }).expect(200);
      expect(reviewed.body.status).toBe(step.next);
      expect(reviewed.body.version).toBe(current.version + 1);
    }

    const done = await detail(requirement.id);
    expect(done.status).toBe('done');
    expect(done.transitions).toHaveLength(5);
    const postDone = await review('pm', { ...requirement, version: done.version }, {
      decision: 'approve',
      generationId: done.transitions.at(-1).generationId,
      expectedVersion: done.version,
    });
    expect(postDone.status).toBe(422);

    for (const role of ROLES) {
      await agents[role]
        .post(`/requirements/${requirement.id}/comments`)
        .send({ content: `来自 ${role} 的评论` })
        .expect(200);
    }
    const comments = await agents.test.get(`/requirements/${requirement.id}/comments`).expect(200);
    expect(comments.body.items).toHaveLength(4);
    expect(comments.body.items.map((c: any) => c.author.role)).toEqual(['pm', 'backend', 'frontend', 'test']);
    expect(comments.body.items.every((c: any) => typeof c.createdAt === 'string')).toBe(true);
  });
});
