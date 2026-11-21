import type {
  Comment,
  Generation,
  RequirementDetail,
  RequirementSummary,
  User,
} from '../../types/domain';
import { ApiError } from '../../utils/errors';
import type { WorkspaceAdapter } from '../types';
import { connectCollaboration } from './collaboration';
import { subscribeEvents } from './events';
import { apiFetch } from './http';

const USER_STORAGE_KEY = 'test-loop-forge:user';

function isUser(value: unknown): value is User {
  if (!value || typeof value !== 'object') return false;
  const user = value as Record<string, unknown>;
  return (
    typeof user.id === 'string' &&
    typeof user.username === 'string' &&
    ['pm', 'backend', 'frontend', 'test'].includes(String(user.role))
  );
}

export const realAdapter: WorkspaceAdapter = {
  mode: 'real',

  auth: {
    async login({ username, password }) {
      const response = await apiFetch<{ user: User }>('/sessions', {
        method: 'POST',
        body: JSON.stringify({ username, password }),
      });
      if (!isUser(response.user)) {
        throw new ApiError(500, 'INVALID_SESSION', '服务端返回的会话信息无效。');
      }
      sessionStorage.setItem(USER_STORAGE_KEY, JSON.stringify(response.user));
      return response.user;
    },
    async logout() {
      try {
        await apiFetch<void>('/sessions', { method: 'DELETE' });
      } finally {
        sessionStorage.removeItem(USER_STORAGE_KEY);
      }
    },
    restoreUser() {
      try {
        const raw = sessionStorage.getItem(USER_STORAGE_KEY);
        if (!raw) return null;
        const parsed: unknown = JSON.parse(raw);
        return isUser(parsed) ? parsed : null;
      } catch {
        sessionStorage.removeItem(USER_STORAGE_KEY);
        return null;
      }
    },
  },

  requirements: {
    async list() {
      const response = await apiFetch<{ items: RequirementSummary[] }>('/requirements');
      return response.items;
    },
    async create({ title }) {
      return apiFetch<RequirementSummary>('/requirements', {
        method: 'POST',
        body: JSON.stringify({ title }),
      });
    },
    async get(id) {
      return apiFetch<RequirementDetail>(`/requirements/${encodeURIComponent(id)}`);
    },
  },

  comments: {
    async list(requirementId) {
      const response = await apiFetch<{ items: Comment[] }>(
        `/requirements/${encodeURIComponent(requirementId)}/comments`,
      );
      return response.items;
    },
    async create(requirementId, { content }) {
      return apiFetch<Comment>(`/requirements/${encodeURIComponent(requirementId)}/comments`, {
        method: 'POST',
        body: JSON.stringify({ content }),
      });
    },
  },

  generations: {
    async create(requirementId, { expectedVersion, idempotencyKey }) {
      return apiFetch<Generation>(
        `/requirements/${encodeURIComponent(requirementId)}/generations`,
        {
          method: 'POST',
          body: JSON.stringify({ expectedVersion, idempotencyKey }),
        },
      );
    },
  },

  reviews: {
    async create(requirementId, { decision, reason, generationId, expectedVersion }) {
      return apiFetch<RequirementSummary>(
        `/requirements/${encodeURIComponent(requirementId)}/reviews`,
        {
          method: 'POST',
          body: JSON.stringify({ decision, reason, generationId, expectedVersion }),
        },
      );
    },
  },

  collaboration: { connect: connectCollaboration },
  events: { subscribe: subscribeEvents },
};
