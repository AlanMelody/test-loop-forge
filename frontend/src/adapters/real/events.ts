import type {
  CommentCreatedEvent,
  RequirementUpdatedEvent,
  WorkspaceEvent,
} from '../../types/domain';
import { wsUrl } from './http';
import type { ConnectionStatus } from '../types';

interface EventHandlers {
  onRequirementUpdated(message: RequirementUpdatedEvent): void;
  onCommentCreated(message: CommentCreatedEvent): void;
  onStatusChange(status: ConnectionStatus): void;
  onReconnect?(): void;
}

function isWorkspaceEvent(value: unknown): value is WorkspaceEvent {
  if (!value || typeof value !== 'object') return false;
  const event = value as Record<string, unknown>;
  return (
    (event.type === 'requirement.updated' || event.type === 'comment.created') &&
    typeof event.requirementId === 'string'
  );
}

export function subscribeEvents(handlers: EventHandlers): () => void {
  let socket: WebSocket | null = null;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  let attempts = 0;
  let disposed = false;

  const scheduleReconnect = () => {
    if (disposed) return;
    const wait = Math.min(1000 * 2 ** attempts, 10_000);
    attempts += 1;
    retryTimer = setTimeout(connect, wait);
  };

  const connect = () => {
    if (disposed) return;
    onStatus(attempts === 0 ? 'connecting' : 'reconnecting');
    try {
      socket = new WebSocket(wsUrl('/events'));
    } catch {
      scheduleReconnect();
      return;
    }
    socket.onopen = () => {
      if (disposed) return;
      attempts = 0;
      onStatus('connected');
      handlers.onReconnect?.();
    };
    socket.onmessage = (event: MessageEvent) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(String(event.data));
      } catch {
        return;
      }
      if (!isWorkspaceEvent(parsed)) return;
      if (parsed.type === 'requirement.updated') handlers.onRequirementUpdated(parsed);
      else handlers.onCommentCreated(parsed);
    };
    socket.onerror = () => socket?.close();
    socket.onclose = () => {
      if (disposed) return;
      onStatus('reconnecting');
      scheduleReconnect();
    };
  };

  const onStatus = (status: ConnectionStatus) => handlers.onStatusChange(status);

  connect();

  return () => {
    disposed = true;
    if (retryTimer) clearTimeout(retryTimer);
    socket?.close();
  };
}
