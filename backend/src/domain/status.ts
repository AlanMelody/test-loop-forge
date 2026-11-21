export const ROLES = ['pm', 'backend', 'frontend', 'test'] as const;
export type Role = (typeof ROLES)[number];

export const STATUSES = ['draft', 'confirmed', 'design', 'development', 'testing', 'done'] as const;
export type Status = (typeof STATUSES)[number];

export const SECTIONS = ['prd', 'technical', 'frontend', 'tests'] as const;
export type Section = (typeof SECTIONS)[number];

export interface StateRule {
  reviewer: Role | null;
  section: Section | null;
  approve: Status | null;
  reject: Status | null;
}

/** 状态机与状态→章节映射（实现锁定项，见 backend/docs/integration.md）。 */
export const STATE_MACHINE: Record<Status, StateRule> = {
  draft: { reviewer: 'pm', section: 'prd', approve: 'confirmed', reject: 'draft' },
  confirmed: { reviewer: 'pm', section: 'prd', approve: 'design', reject: 'draft' },
  design: { reviewer: 'backend', section: 'technical', approve: 'development', reject: 'confirmed' },
  development: { reviewer: 'frontend', section: 'frontend', approve: 'testing', reject: 'design' },
  testing: { reviewer: 'test', section: 'tests', approve: 'done', reject: 'development' },
  done: { reviewer: null, section: null, approve: null, reject: null },
};

export function isStatus(value: string): value is Status {
  return (STATUSES as readonly string[]).includes(value);
}

export function isRole(value: string): value is Role {
  return (ROLES as readonly string[]).includes(value);
}

export function isSection(value: string): value is Section {
  return (SECTIONS as readonly string[]).includes(value);
}
