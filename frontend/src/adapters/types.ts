import type * as Y from 'yjs';
import type {
  Comment,
  CommentCreatedEvent,
  Generation,
  RequirementDetail,
  RequirementSummary,
  RequirementUpdatedEvent,
  Role,
  User,
} from '../types/domain';

export type ConnectionStatus = 'connecting' | 'connected' | 'reconnecting' | 'disconnected';

export interface PresenceUser {
  id: string;
  username: string;
  role: Role;
}

export interface WorkspaceAdapter {
  readonly mode: 'mock' | 'real';

  auth: {
    login(input: { username: string; password: string }): Promise<User>;
    logout(): Promise<void>;
    restoreUser(): User | null;
  };

  requirements: {
    list(): Promise<RequirementSummary[]>;
    create(input: { title: string }): Promise<RequirementSummary>;
    get(id: string): Promise<RequirementDetail>;
  };

  comments: {
    list(requirementId: string): Promise<Comment[]>;
    create(requirementId: string, input: { content: string }): Promise<Comment>;
  };

  generations: {
    create(
      requirementId: string,
      input: { expectedVersion: number; idempotencyKey: string },
    ): Promise<Generation>;
  };

  reviews: {
    create(
      requirementId: string,
      input: {
        decision: 'approve' | 'reject';
        reason: string;
        generationId: string;
        expectedVersion: number;
      },
    ): Promise<RequirementSummary>;
  };

  collaboration: {
    connect(params: {
      requirementId: string;
      doc: Y.Doc;
      user: User;
      onStatusChange(status: ConnectionStatus): void;
      onPresenceChange(users: PresenceUser[]): void;
      onResync?(): void;
    }): () => void;
  };

  events: {
    subscribe(handlers: {
      onRequirementUpdated(message: RequirementUpdatedEvent): void;
      onCommentCreated(message: CommentCreatedEvent): void;
      onStatusChange(status: ConnectionStatus): void;
      onReconnect?(): void;
    }): () => void;
  };
}
