import { beforeEach, describe, expect, it, vi } from 'vitest';
import { realAdapter } from '../../src/adapters/real';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('real 适配器：HTTP 契约', () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.unstubAllGlobals();
  });

  it('登录使用 POST /sessions、携带凭据且只保存非敏感用户对象', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ user: { id: 'u-1', username: 'pm', role: 'pm' } }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const user = await realAdapter.auth.login({ username: 'pm', password: 'secret' });
    expect(user.role).toBe('pm');
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/sessions');
    expect(init.method).toBe('POST');
    expect(init.credentials).toBe('include');
    expect(JSON.parse(String(init.body))).toEqual({ username: 'pm', password: 'secret' });
    expect(sessionStorage.getItem('test-loop-forge:user')).toContain('pm');
    expect(sessionStorage.getItem('test-loop-forge:user')).not.toContain('secret');
  });

  it('列表/创建/详情/评论/生成/审核路径与 mutation 字段符合契约', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url === '/requirements') return Promise.resolve(jsonResponse({ items: [] }));
      if (url.endsWith('/generations')) {
        return Promise.resolve(
          jsonResponse({ id: 'g1', section: 'prd', content: '草稿', status: 'ready', documentVersion: 3 }),
        );
      }
      if (url.endsWith('/reviews')) {
        return Promise.resolve(jsonResponse({ id: 'r1', title: 'T', status: 'confirmed', version: 4 }));
      }
      if (url.endsWith('/comments')) {
        return Promise.resolve(jsonResponse({ id: 'c1', author: { id: 'u', role: 'pm' }, content: 'ok', createdAt: '2026-01-01' }));
      }
      return Promise.resolve(jsonResponse({ items: [] }));
    });
    vi.stubGlobal('fetch', fetchMock);

    await realAdapter.requirements.list();
    await realAdapter.generations.create('r 1', { expectedVersion: 3, idempotencyKey: 'idem-1' });
    await realAdapter.reviews.create('r1', {
      decision: 'approve',
      reason: '',
      generationId: 'g1',
      expectedVersion: 3,
    });
    await realAdapter.comments.create('r1', { content: 'ok' });

    const calls = fetchMock.mock.calls as Array<[string, RequestInit]>;
    expect(calls[0][0]).toBe('/requirements');
    expect(calls[1][0]).toBe('/requirements/r%201/generations');
    expect(JSON.parse(String(calls[1][1].body))).toEqual({
      expectedVersion: 3,
      idempotencyKey: 'idem-1',
    });
    expect(calls[2][0]).toBe('/requirements/r1/reviews');
    expect(JSON.parse(String(calls[2][1].body))).toEqual({
      decision: 'approve',
      reason: '',
      generationId: 'g1',
      expectedVersion: 3,
    });
    expect(calls[3][0]).toBe('/requirements/r1/comments');
  });

  it('错误按状态映射为 ApiError，网络异常有可读文案', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({ error: { code: 'VERSION_CONFLICT', message: '版本冲突' } }, 409),
      ),
    );
    await expect(
      realAdapter.generations.create('r1', { expectedVersion: 1, idempotencyKey: 'k' }),
    ).rejects.toMatchObject({ status: 409, code: 'VERSION_CONFLICT', message: '版本冲突' });

    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    await expect(realAdapter.requirements.list()).rejects.toMatchObject({
      status: 0,
      code: 'NETWORK_ERROR',
    });
  });
});
