import { config } from '../../config';
import type {
  Comment,
  Generation,
  RequirementDetail,
  RequirementUpdatedEvent,
  SectionKey,
  Transition,
  User,
} from '../../types/domain';
import { ApiError, networkError } from '../../utils/errors';

const STORAGE_KEY = 'test-loop-forge:mock:v1';

/** 演示账号，仅用于 mock 模式；真实模式凭据由服务端校验，前端不保存密码。 */
export const MOCK_ACCOUNTS: Array<{ username: string; password: string; user: User }> = [
  { username: 'pm', password: 'demo1234', user: { id: 'u-pm', username: 'pm', role: 'pm' } },
  { username: 'backend', password: 'demo1234', user: { id: 'u-backend', username: 'backend', role: 'backend' } },
  { username: 'frontend', password: 'demo1234', user: { id: 'u-frontend', username: 'frontend', role: 'frontend' } },
  { username: 'test', password: 'demo1234', user: { id: 'u-test', username: 'test', role: 'test' } },
];

export interface MockComment extends Comment {
  requirementId: string;
}

export interface MockState {
  requirements: RequirementDetail[];
  comments: MockComment[];
  generations: Record<string, Generation>;
  transitions: Record<string, Transition[]>;
  sessionUserId: string | null;
}

function initialState(): MockState {
  return { requirements: [], comments: [], generations: {}, transitions: {}, sessionUserId: null };
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export function loadState(): MockState {
  const raw = storage()?.getItem(STORAGE_KEY);
  if (!raw) return initialState();
  try {
    const parsed = JSON.parse(raw) as MockState;
    if (!Array.isArray(parsed.requirements) || !Array.isArray(parsed.comments)) return initialState();
    return {
      requirements: parsed.requirements,
      comments: parsed.comments,
      generations: parsed.generations ?? {},
      transitions: parsed.transitions ?? {},
      sessionUserId: parsed.sessionUserId ?? null,
    };
  } catch {
    return initialState();
  }
}

export function saveState(state: MockState): void {
  storage()?.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function resetMockState(): void {
  storage()?.removeItem(STORAGE_KEY);
  scenarioFlags.conflict = false;
  scenarioFlags.network = false;
}

export function currentUser(): User | null {
  const state = loadState();
  return MOCK_ACCOUNTS.find((account) => account.user.id === state.sessionUserId)?.user ?? null;
}

export function findRequirement(id: string): RequirementDetail | null {
  return loadState().requirements.find((item) => item.id === id) ?? null;
}

export function updateSections(id: string, sections: Record<SectionKey, string>): void {
  const state = loadState();
  const requirement = state.requirements.find((item) => item.id === id);
  if (!requirement) return;
  requirement.document.sections = clone(sections);
  saveState(state);
}

export function newId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

type RequirementEventHandler = (message: RequirementUpdatedEvent) => void;
type CommentEventHandler = (requirementId: string) => void;

const requirementHandlers = new Set<RequirementEventHandler>();
const commentHandlers = new Set<CommentEventHandler>();

export function subscribeMockEvents(
  onRequirementUpdated: RequirementEventHandler,
  onCommentCreated: CommentEventHandler,
): () => void {
  requirementHandlers.add(onRequirementUpdated);
  commentHandlers.add(onCommentCreated);
  return () => {
    requirementHandlers.delete(onRequirementUpdated);
    commentHandlers.delete(onCommentCreated);
  };
}

export function emitRequirementUpdated(requirementId: string, version?: number): void {
  const message: RequirementUpdatedEvent = { type: 'requirement.updated', requirementId, version };
  requirementHandlers.forEach((handler) => handler(message));
}

export function emitCommentCreated(requirementId: string): void {
  commentHandlers.forEach((handler) => handler(requirementId));
}

const scenarioFlags = { conflict: false, network: false };

/** 仅 mock 模式使用：按配置让下一次 mutation 失败一次，用于验证 409/网络错误分支。 */
export function maybeSimulateFailure(): void {
  if (config.mockScenario === 'conflict' && !scenarioFlags.conflict) {
    scenarioFlags.conflict = true;
    throw new ApiError(409, 'VERSION_CONFLICT', '版本冲突：需求已被其他成员更新，请重新读取后再操作。');
  }
  if (config.mockScenario === 'network-error' && !scenarioFlags.network) {
    scenarioFlags.network = true;
    throw networkError();
  }
}

export function assertRequirementRole(role: User['role'], expected: User['role']): void {
  if (role !== expected) {
    throw new ApiError(403, 'FORBIDDEN', `当前角色（${role}）无审核权限，需要 ${expected} 角色操作。`);
  }
}

export function assertVersion(expectedVersion: number, actualVersion: number): void {
  if (!Number.isFinite(expectedVersion) || expectedVersion !== actualVersion) {
    throw new ApiError(409, 'VERSION_CONFLICT', '版本冲突：需求已被其他成员更新，请重新读取后再操作。');
  }
}

export function initialMembers(): RequirementDetail['members'] {
  return MOCK_ACCOUNTS.map(({ user }) => clone(user));
}
