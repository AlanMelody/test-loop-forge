import { describe, expect, it } from 'vitest';
import { STATE_MACHINE, STATUSES } from '../../src/domain/status.js';

describe('状态机与章节映射', () => {
  it('锁定六个状态的审核角色、章节与流转目标', () => {
    expect(STATE_MACHINE.draft).toMatchObject({ reviewer: 'pm', section: 'prd', approve: 'confirmed', reject: 'draft' });
    expect(STATE_MACHINE.confirmed).toMatchObject({ reviewer: 'pm', section: 'prd', approve: 'design', reject: 'draft' });
    expect(STATE_MACHINE.design).toMatchObject({ reviewer: 'backend', section: 'technical', approve: 'development', reject: 'confirmed' });
    expect(STATE_MACHINE.development).toMatchObject({ reviewer: 'frontend', section: 'frontend', approve: 'testing', reject: 'design' });
    expect(STATE_MACHINE.testing).toMatchObject({ reviewer: 'test', section: 'tests', approve: 'done', reject: 'development' });
  });

  it('done 是终态，不再审核也不再生成', () => {
    expect(STATE_MACHINE.done).toEqual({ reviewer: null, section: null, approve: null, reject: null });
  });

  it('所有状态均有显式规则', () => {
    for (const status of STATUSES) expect(STATE_MACHINE[status]).toBeDefined();
  });
});
