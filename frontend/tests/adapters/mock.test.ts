import { describe, expect, it } from 'vitest';
import { mockAdapter } from '../../src/adapters/mock';
import { ApiError } from '../../src/utils/errors';

async function loginAs(username: string) {
  return mockAdapter.auth.login({ username, password: 'demo1234' });
}

describe('mock 适配器：契约行为', () => {
  it('登录失败不泄露账号信息，成功返回服务端式用户对象', async () => {
    await expect(
      mockAdapter.auth.login({ username: 'pm', password: 'wrong' }),
    ).rejects.toMatchObject({ status: 401, code: 'INVALID_CREDENTIALS' });
    const user = await loginAs('pm');
    expect(user).toEqual({ id: 'u-pm', username: 'pm', role: 'pm' });
    expect(mockAdapter.auth.restoreUser()?.role).toBe('pm');
  });

  it('空标题被拒绝；创建后列表与详情版本一致', async () => {
    await loginAs('pm');
    await expect(mockAdapter.requirements.create({ title: '  ' })).rejects.toMatchObject({
      status: 422,
    });
    const created = await mockAdapter.requirements.create({ title: '  协作平台  ' });
    expect(created).toMatchObject({ title: '协作平台', status: 'draft', version: 1 });
    const list = await mockAdapter.requirements.list();
    expect(list).toHaveLength(1);
    const detail = await mockAdapter.requirements.get(created.id);
    expect(detail.document.sections).toEqual({ prd: '', technical: '', frontend: '', tests: '' });
    expect(detail.members).toHaveLength(4);
    expect(detail.version).toBe(1);
  });

  it('评论携带作者角色，空内容被拒绝', async () => {
    await loginAs('backend');
    const requirement = await mockAdapter.requirements.create({ title: '评论测试' });
    await expect(
      mockAdapter.comments.create(requirement.id, { content: '  ' }),
    ).rejects.toMatchObject({ status: 422 });
    const comment = await mockAdapter.comments.create(requirement.id, { content: '  已阅读  ' });
    expect(comment).toMatchObject({ content: '已阅读', author: { role: 'backend' } });
    expect(await mockAdapter.comments.list(requirement.id)).toHaveLength(1);
  });

  it('生成草稿携带章节与版本；过期版本返回 409', async () => {
    await loginAs('pm');
    const requirement = await mockAdapter.requirements.create({ title: '草稿测试' });
    const generation = await mockAdapter.generations.create(requirement.id, {
      expectedVersion: 1,
      idempotencyKey: 'key-1',
    });
    expect(generation).toMatchObject({ section: 'prd', documentVersion: 1, status: 'ready' });
    expect(generation.content).toContain('草稿测试');
    await expect(
      mockAdapter.generations.create(requirement.id, {
        expectedVersion: 99,
        idempotencyKey: 'key-2',
      }),
    ).rejects.toMatchObject({ status: 409, code: 'VERSION_CONFLICT' });
  });

  it('打回理由必填、非责任角色 403、草稿打回保持 draft', async () => {
    await loginAs('pm');
    const requirement = await mockAdapter.requirements.create({ title: '审核测试' });
    await mockAdapter.generations.create(requirement.id, {
      expectedVersion: 1,
      idempotencyKey: 'key-1',
    });
    await expect(
      mockAdapter.reviews.create(requirement.id, {
        decision: 'reject',
        reason: '  ',
        generationId: 'gen-x',
        expectedVersion: 1,
      }),
    ).rejects.toMatchObject({ status: 422, code: 'REASON_REQUIRED' });

    const generation = (await mockAdapter.requirements.get(requirement.id)).generation!;
    await mockAdapter.auth.logout();
    await loginAs('backend');
    await expect(
      mockAdapter.reviews.create(requirement.id, {
        decision: 'approve',
        reason: '',
        generationId: generation.id,
        expectedVersion: 1,
      }),
    ).rejects.toMatchObject({ status: 403 });

    await mockAdapter.auth.logout();
    await loginAs('pm');
    const rejected = await mockAdapter.reviews.create(requirement.id, {
      decision: 'reject',
      reason: '范围需要补充',
      generationId: generation.id,
      expectedVersion: 1,
    });
    expect(rejected).toMatchObject({ status: 'draft', version: 2 });
    const detail = await mockAdapter.requirements.get(requirement.id);
    expect(detail.transitions[detail.transitions.length - 1]).toMatchObject({
      decision: 'reject',
      to: 'draft',
    });
  });

  it('通过后进入下一状态并推进版本，done 不再审批', async () => {
    await loginAs('pm');
    const requirement = await mockAdapter.requirements.create({ title: '流转测试' });
    const flow: Array<[string, string]> = [
      ['pm', 'confirmed'],
      ['pm', 'design'],
      ['backend', 'development'],
      ['frontend', 'testing'],
      ['test', 'done'],
    ];
    let version = 1;
    for (const [actor, expectedStatus] of flow) {
      if (actor !== 'pm' || version > 2) {
        await mockAdapter.auth.logout();
        await loginAs(actor);
      }
      const generation = await mockAdapter.generations.create(requirement.id, {
        expectedVersion: version,
        idempotencyKey: `key-${version}`,
      });
      const result = await mockAdapter.reviews.create(requirement.id, {
        decision: 'approve',
        reason: '',
        generationId: generation.id,
        expectedVersion: version,
      });
      expect(result.status).toBe(expectedStatus);
      version += 1;
      expect(result.version).toBe(version);
    }
    const detail = await mockAdapter.requirements.get(requirement.id);
    expect(detail.status).toBe('done');
    await expect(
      mockAdapter.reviews.create(requirement.id, {
        decision: 'approve',
        reason: '',
        generationId: 'any',
        expectedVersion: version,
      }),
    ).rejects.toBeInstanceOf(ApiError);
  });
});
