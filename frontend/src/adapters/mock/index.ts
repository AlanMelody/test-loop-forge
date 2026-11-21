import type * as Y from 'yjs';
import type {
  Comment,
  Generation,
  RequirementDetail,
  RequirementSummary,
  SectionKey,
  User,
} from '../../types/domain';
import { RESPONSIBLE_ROLE, SECTION_ORDER, nextStatus } from '../../utils/status';
import { ApiError } from '../../utils/errors';
import { validateRejectReason, validateTitle } from '../../utils/validation';
import type { WorkspaceAdapter } from '../types';
import {
  MOCK_ACCOUNTS,
  assertRequirementRole,
  assertVersion,
  currentUser,
  emitCommentCreated,
  emitRequirementUpdated,
  findRequirement,
  initialMembers,
  loadState,
  maybeSimulateFailure,
  newId,
  saveState,
  subscribeMockEvents,
  updateSections,
} from './store';

function delay(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 80));
}

function requireLogin(): User {
  const user = currentUser();
  if (!user) throw new ApiError(401, 'UNAUTHORIZED', '登录已失效，请重新登录。');
  return user;
}

function summaryOf(requirement: RequirementDetail): RequirementSummary {
  return {
    id: requirement.id,
    title: requirement.title,
    status: requirement.status,
    version: requirement.version,
  };
}

function sectionForStatus(requirement: RequirementDetail): SectionKey {
  switch (requirement.status) {
    case 'draft':
    case 'confirmed':
      return 'prd';
    case 'design':
      return 'technical';
    case 'development':
      return 'frontend';
    case 'testing':
    case 'done':
      return 'tests';
  }
}

/** 确定性模拟草稿：同一标题和章节总是产生同样的内容，不调用真实模型。 */
function simulatedContent(requirement: RequirementDetail, section: SectionKey): string {
  const title = requirement.title;
  switch (section) {
    case 'prd':
      return `# ${title}\n\n## 背景\n为「${title}」明确首版范围与验收口径。\n\n## 用户故事\n- 作为团队成员，我可以查看当前状态与责任角色。\n- 作为责任角色，我可以基于草稿通过或打回。\n\n## 验收标准\n- 四章节内容可被协作编辑。\n- 审核流转与版本冲突有明确反馈。`;
    case 'technical':
      return `# ${title} 技术方案\n\n## 架构\n采用 React + TypeScript 前端、Node.js 服务、PostgreSQL 持久化，Yjs CRDT 通过 WebSocket 同步。\n\n## 接口\n复用 /requirements、/generations、/reviews 契约，mutation 必须携带 expectedVersion。\n\n## 风险\nYjs 帧与版本推进语义需在联调时确认。`;
    case 'frontend':
      return `# ${title} 前端说明\n\n## 页面\n登录页、六列看板、需求详情（主文档 + 右侧审核评论）。\n\n## 交互\nAI 草稿需显式预览与应用；打回理由必填；409 时禁止覆盖人工编辑。\n\n## 可访问性\n语义化结构、键盘可达、状态使用文字标签。`;
    case 'tests':
      return `# ${title} 测试用例\n\n1. 登录成功与失败提示。\n2. 需求创建、六列看板与状态流转。\n3. 章节编辑、评论、生成与差异应用。\n4. 权限校验、打回理由、409 冲突与重读。\n5. 双浏览器合并与事件一致性（真实模式）。`;
  }
}

export const mockAdapter: WorkspaceAdapter = {
  mode: 'mock',

  auth: {
    async login({ username, password }) {
      await delay();
      const account = MOCK_ACCOUNTS.find(
        (item) => item.username === username.trim() && item.password === password,
      );
      if (!account) {
        throw new ApiError(401, 'INVALID_CREDENTIALS', '用户名或密码错误，请重试。');
      }
      const state = loadState();
      state.sessionUserId = account.user.id;
      saveState(state);
      return { ...account.user };
    },
    async logout() {
      const state = loadState();
      state.sessionUserId = null;
      saveState(state);
    },
    restoreUser() {
      return currentUser();
    },
  },

  requirements: {
    async list() {
      await delay();
      requireLogin();
      return loadState().requirements.map(summaryOf);
    },
    async create({ title }) {
      await delay();
      requireLogin();
      const result = validateTitle(title);
      if (!result.valid) throw new ApiError(422, 'INVALID_TITLE', result.message ?? '标题无效。');
      const state = loadState();
      const now = new Date().toISOString();
      const requirement: RequirementDetail = {
        id: newId('req'),
        title: title.trim(),
        status: 'draft',
        version: 1,
        members: initialMembers(),
        document: { id: newId('doc'), sections: { prd: '', technical: '', frontend: '', tests: '' } },
        generation: null,
        transitions: [
          { id: newId('tr'), from: undefined, to: 'draft', decision: 'approve', reason: '需求创建', createdAt: now },
        ],
      };
      state.requirements.push(requirement);
      state.transitions[requirement.id] = requirement.transitions;
      saveState(state);
      emitRequirementUpdated(requirement.id, requirement.version);
      return summaryOf(requirement);
    },
    async get(id) {
      await delay();
      requireLogin();
      const requirement = findRequirement(id);
      if (!requirement) throw new ApiError(404, 'NOT_FOUND', '未找到该需求。');
      const state = loadState();
      return {
        ...requirement,
        generation: state.generations[id] ?? null,
        transitions: state.transitions[id] ?? requirement.transitions ?? [],
        document: { ...requirement.document, sections: { ...requirement.document.sections } },
      };
    },
  },

  comments: {
    async list(requirementId) {
      await delay();
      requireLogin();
      return loadState()
        .comments.filter((comment) => comment.requirementId === requirementId)
        .map(({ id, author, content, createdAt }) => ({ id, author, content, createdAt }));
    },
    async create(requirementId, { content }) {
      await delay();
      const user = requireLogin();
      if (!content.trim()) throw new ApiError(422, 'INVALID_COMMENT', '请输入评论内容。');
      findRequirement(requirementId);
      const state = loadState();
      const comment = {
        id: newId('cmt'),
        requirementId,
        author: { id: user.id, role: user.role },
        content: content.trim(),
        createdAt: new Date().toISOString(),
      };
      state.comments.push(comment);
      saveState(state);
      emitCommentCreated(requirementId);
      const { requirementId: _ignored, ...publicComment } = comment;
      void _ignored;
      return publicComment as Comment;
    },
  },

  generations: {
    async create(requirementId, { expectedVersion }) {
      await delay();
      requireLogin();
      const requirement = findRequirement(requirementId);
      if (!requirement) throw new ApiError(404, 'NOT_FOUND', '未找到该需求。');
      assertVersion(expectedVersion, requirement.version);
      maybeSimulateFailure();
      const section = sectionForStatus(requirement);
      const generation: Generation = {
        id: newId('gen'),
        section,
        content: simulatedContent(requirement, section),
        status: 'ready',
        documentVersion: requirement.version,
      };
      const state = loadState();
      state.generations[requirementId] = generation;
      saveState(state);
      return { ...generation };
    },
  },

  reviews: {
    async create(requirementId, { decision, reason, generationId, expectedVersion }) {
      await delay();
      const user = requireLogin();
      const state = loadState();
      const requirement = state.requirements.find((item) => item.id === requirementId);
      if (!requirement) throw new ApiError(404, 'NOT_FOUND', '未找到该需求。');
      if (requirement.status === 'done') {
        throw new ApiError(422, 'INVALID_STATUS', '需求已完成，不再审批。');
      }
      const expectedRole = RESPONSIBLE_ROLE[requirement.status];
      if (!expectedRole) throw new ApiError(422, 'INVALID_STATUS', '当前状态不可审核。');
      assertRequirementRole(user.role, expectedRole);
      if (decision !== 'approve' && decision !== 'reject') {
        throw new ApiError(422, 'INVALID_DECISION', '无效的审核决定。');
      }
      if (decision === 'reject' && !validateRejectReason(reason).valid) {
        throw new ApiError(422, 'REASON_REQUIRED', '请填写打回理由。');
      }
      const generation = state.generations[requirementId];
      if (!generation || generation.id !== generationId) {
        throw new ApiError(422, 'GENERATION_REQUIRED', '请先生成草稿，再提交审核。');
      }
      assertVersion(expectedVersion, requirement.version);
      maybeSimulateFailure();

      const to = nextStatus(requirement.status, decision);
      if (!to) throw new ApiError(422, 'INVALID_STATUS', '当前状态不可审核。');
      const from = requirement.status;
      requirement.status = to;
      requirement.version += 1;
      requirement.generation = null;
      const transition = {
        id: newId('tr'),
        from,
        to,
        decision,
        reason: decision === 'reject' ? reason.trim() : reason.trim() || '责任角色通过',
        actor: { id: user.id, role: user.role },
        createdAt: new Date().toISOString(),
      };
      state.transitions[requirementId] = [...(state.transitions[requirementId] ?? []), transition];
      requirement.transitions = state.transitions[requirementId];
      delete state.generations[requirementId];
      saveState(state);
      emitRequirementUpdated(requirementId, requirement.version);
      return summaryOf(requirement);
    },
  },

  collaboration: {
    connect({ requirementId, doc, user, onStatusChange, onPresenceChange }) {
      const sections = doc.getMap<Y.Text>('sections');
      let timer: ReturnType<typeof setTimeout> | undefined;
      const flush = () => {
        const snapshot = {} as Record<SectionKey, string>;
        SECTION_ORDER.forEach((key) => {
          snapshot[key] = sections.get(key)?.toString() ?? '';
        });
        updateSections(requirementId, snapshot);
      };
      const observer = () => {
        if (timer) clearTimeout(timer);
        timer = setTimeout(flush, 150);
      };
      sections.observeDeep(observer);
      onStatusChange('connected');
      onPresenceChange([{ id: user.id, username: user.username, role: user.role }]);
      return () => {
        if (timer) {
          clearTimeout(timer);
          flush();
        }
        sections.unobserveDeep(observer);
        onPresenceChange([]);
        onStatusChange('disconnected');
      };
    },
  },

  events: {
    subscribe(handlers) {
      handlers.onStatusChange('connected');
      return subscribeMockEvents(
        (message) => handlers.onRequirementUpdated(message),
        (requirementId) => handlers.onCommentCreated({ type: 'comment.created', requirementId }),
      );
    },
  },
};
