import { describe, expect, it } from 'vitest';
import { RESPONSIBLE_ROLE, canReview, nextStatus } from '../../src/utils/status';
import type { Role, Status } from '../../src/types/domain';

describe('状态与审核权限映射', () => {
  const cases: Array<[Status, Role | undefined, { approve: Status | null; reject: Status | null }]> = [
    ['draft', 'pm', { approve: 'confirmed', reject: 'draft' }],
    ['confirmed', 'pm', { approve: 'design', reject: 'draft' }],
    ['design', 'backend', { approve: 'development', reject: 'confirmed' }],
    ['development', 'frontend', { approve: 'testing', reject: 'design' }],
    ['testing', 'test', { approve: 'done', reject: 'development' }],
    ['done', undefined, { approve: null, reject: null }],
  ];

  it.each(cases)('%s 的责任角色与流转正确', (status, role, expected) => {
    expect(RESPONSIBLE_ROLE[status]).toBe(role);
    expect(nextStatus(status, 'approve')).toBe(expected.approve);
    expect(nextStatus(status, 'reject')).toBe(expected.reject);
  });

  it('done 状态没有审核责任角色', () => {
    expect(canReview('done', 'pm')).toBe(false);
    expect(canReview('design', 'backend')).toBe(true);
    expect(canReview('design', 'frontend')).toBe(false);
  });
});
