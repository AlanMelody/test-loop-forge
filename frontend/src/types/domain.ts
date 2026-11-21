export type Role = 'pm' | 'backend' | 'frontend' | 'test';

export type Status =
  | 'draft'
  | 'confirmed'
  | 'design'
  | 'development'
  | 'testing'
  | 'done';

export type SectionKey = 'prd' | 'technical' | 'frontend' | 'tests';

export interface User {
  id: string;
  username: string;
  role: Role;
}

export interface RequirementSummary {
  id: string;
  title: string;
  status: Status;
  version: number;
}

export interface Member {
  id: string;
  username?: string;
  role: Role;
}

export interface SharedDocument {
  id: string;
  sections: Record<SectionKey, string>;
}

// generation.status / transitions 详细字段以服务端为准，前端容错展示。
export interface Generation {
  id: string;
  section: SectionKey;
  content: string;
  status?: string;
  documentVersion?: number;
}

export interface Transition {
  id?: string;
  from?: Status;
  to?: Status;
  decision?: 'approve' | 'reject';
  reason?: string;
  actor?: { id?: string; role?: Role };
  createdAt?: string;
  [key: string]: unknown;
}

export interface RequirementDetail extends RequirementSummary {
  members: Member[];
  document: SharedDocument;
  generation: Generation | null;
  transitions: Transition[];
}

export interface Comment {
  id: string;
  author: { id: string; role: Role };
  content: string;
  createdAt: string;
}

export interface ApiErrorPayload {
  error: { code: string; message: string };
}

export interface RequirementUpdatedEvent {
  type: 'requirement.updated';
  requirementId: string;
  version?: number;
  data?: unknown;
}

export interface CommentCreatedEvent {
  type: 'comment.created';
  requirementId: string;
  version?: number;
  data?: unknown;
}

export type WorkspaceEvent = RequirementUpdatedEvent | CommentCreatedEvent;
