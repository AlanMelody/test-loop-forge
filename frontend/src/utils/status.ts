import type { Role, Status } from '../types/domain';

export const STATUS_ORDER: Status[] = [
  'draft',
  'confirmed',
  'design',
  'development',
  'testing',
  'done',
];

export const STATUS_LABELS: Record<Status, string> = {
  draft: '草稿',
  confirmed: '已确认',
  design: '技术方案',
  development: '开发中',
  testing: '测试中',
  done: '已完成',
};

export const ROLE_LABELS: Record<Role, string> = {
  pm: '产品经理',
  backend: '服务端工程师',
  frontend: '前端工程师',
  test: '测试工程师',
};

export const SECTION_LABELS = {
  prd: '产品需求文档（PRD）',
  technical: '技术方案',
  frontend: '前端说明',
  tests: '测试用例',
} as const;

export const SECTION_ORDER = ['prd', 'technical', 'frontend', 'tests'] as const;

/** 当前状态对应的审核责任角色；done 不需要审核。 */
export const RESPONSIBLE_ROLE: Partial<Record<Status, Role>> = {
  draft: 'pm',
  confirmed: 'pm',
  design: 'backend',
  development: 'frontend',
  testing: 'test',
};

/** 状态流转以服务端为权威，此处仅用于界面提示与禁用控制。 */
export function nextStatus(status: Status, decision: 'approve' | 'reject'): Status | null {
  const table: Record<Exclude<Status, 'done'>, { approve: Status; reject: Status }> = {
    draft: { approve: 'confirmed', reject: 'draft' },
    confirmed: { approve: 'design', reject: 'draft' },
    design: { approve: 'development', reject: 'confirmed' },
    development: { approve: 'testing', reject: 'design' },
    testing: { approve: 'done', reject: 'development' },
  };
  if (status === 'done') return null;
  return table[status][decision];
}

export function canReview(status: Status, role: Role): boolean {
  return RESPONSIBLE_ROLE[status] === role;
}

export function responsibleLabel(status: Status): string {
  const role = RESPONSIBLE_ROLE[status];
  return role ? ROLE_LABELS[role] : '无（流程已结束）';
}

export function isKnownStatus(value: unknown): value is Status {
  return typeof value === 'string' && (STATUS_ORDER as string[]).includes(value);
}
