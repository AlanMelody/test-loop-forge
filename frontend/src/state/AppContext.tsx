import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { adapter } from '../adapters';
import type { ConnectionStatus } from '../adapters';
import { config } from '../config';
import type {
  CommentCreatedEvent,
  RequirementSummary,
  RequirementUpdatedEvent,
  User,
} from '../types/domain';
import { isUnauthorized, messageForError } from '../utils/errors';

type Tagged<T> = T & { at: number };

interface AppContextValue {
  mode: 'mock' | 'real';
  user: User | null;
  ready: boolean;
  globalError: string | null;
  setGlobalError(message: string | null): void;
  login(input: { username: string; password: string }): Promise<User>;
  logout(): Promise<void>;
  handleError(error: unknown, options?: { inline?: boolean }): string;
  requirements: RequirementSummary[];
  loadingRequirements: boolean;
  requirementsError: string | null;
  loadRequirements(): Promise<void>;
  createRequirement(title: string): Promise<RequirementSummary>;
  eventsStatus: ConnectionStatus | 'idle';
  lastRequirementUpdate: Tagged<RequirementUpdatedEvent> | null;
  lastCommentEvent: Tagged<CommentCreatedEvent> | null;
  refreshToken: number;
  requestRefresh(): void;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [requirements, setRequirements] = useState<RequirementSummary[]>([]);
  const [loadingRequirements, setLoadingRequirements] = useState(false);
  const [requirementsError, setRequirementsError] = useState<string | null>(null);
  const [eventsStatus, setEventsStatus] = useState<ConnectionStatus | 'idle'>('idle');
  const [lastRequirementUpdate, setLastRequirementUpdate] =
    useState<Tagged<RequirementUpdatedEvent> | null>(null);
  const [lastCommentEvent, setLastCommentEvent] = useState<Tagged<CommentCreatedEvent> | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);

  const requestRefresh = useCallback(() => setRefreshToken((value) => value + 1), []);

  const handleError = useCallback(
    (error: unknown, options?: { inline?: boolean }): string => {
      const message = messageForError(error);
      if (isUnauthorized(error)) {
        void adapter.auth.logout().catch(() => undefined);
        setUser(null);
        setRequirements([]);
        const from = location.pathname + location.search;
        navigate(`/login?from=${encodeURIComponent(from)}`, { replace: true });
      } else if (!options?.inline) {
        setGlobalError(message);
      }
      return message;
    },
    [location.pathname, location.search, navigate],
  );

  const loadRequirements = useCallback(async () => {
    setLoadingRequirements(true);
    setRequirementsError(null);
    try {
      const items = await adapter.requirements.list();
      setRequirements(items);
    } catch (error) {
      handleError(error, { inline: true });
      setRequirementsError(messageForError(error));
      if (!isUnauthorized(error)) setGlobalError(messageForError(error));
    } finally {
      setLoadingRequirements(false);
    }
  }, [handleError]);

  useEffect(() => {
    let active = true;
    void (async () => {
      const restored = adapter.auth.restoreUser();
      if (restored) {
        try {
          await adapter.requirements.list();
          if (active) setUser(restored);
        } catch {
          await adapter.auth.logout().catch(() => undefined);
          if (active) setUser(null);
        }
      }
      if (active) setReady(true);
    })();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!user) return;
    return adapter.events.subscribe({
      onRequirementUpdated(message) {
        setLastRequirementUpdate({ ...message, at: Date.now() });
        void loadRequirements();
      },
      onCommentCreated(message) {
        setLastCommentEvent({ ...message, at: Date.now() });
      },
      onStatusChange(status) {
        setEventsStatus(status);
      },
      onReconnect() {
        void loadRequirements();
        requestRefresh();
      },
    });
  }, [user, loadRequirements, requestRefresh]);

  const login = useCallback(async (input: { username: string; password: string }) => {
    const loggedIn = await adapter.auth.login(input);
    setUser(loggedIn);
    setGlobalError(null);
    return loggedIn;
  }, []);

  const logout = useCallback(async () => {
    try {
      await adapter.auth.logout();
    } finally {
      setUser(null);
      setRequirements([]);
      setLastRequirementUpdate(null);
      setLastCommentEvent(null);
      setGlobalError(null);
      navigate('/login', { replace: true });
    }
  }, [navigate]);

  const createRequirement = useCallback(
    async (title: string) => {
      const created = await adapter.requirements.create({ title });
      setRequirements((current) => [...current, created]);
      setLastRequirementUpdate({ type: 'requirement.updated', requirementId: created.id, version: created.version, at: Date.now() });
      return created;
    },
    [],
  );

  const value = useMemo<AppContextValue>(
    () => ({
      mode: config.mode,
      user,
      ready,
      globalError,
      setGlobalError,
      login,
      logout,
      handleError,
      requirements,
      loadingRequirements,
      requirementsError,
      loadRequirements,
      createRequirement,
      eventsStatus,
      lastRequirementUpdate,
      lastCommentEvent,
      refreshToken,
      requestRefresh,
    }),
    [
      user,
      ready,
      globalError,
      login,
      logout,
      handleError,
      requirements,
      loadingRequirements,
      requirementsError,
      loadRequirements,
      createRequirement,
      eventsStatus,
      lastRequirementUpdate,
      lastCommentEvent,
      refreshToken,
      requestRefresh,
    ],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const value = useContext(AppContext);
  if (!value) throw new Error('useApp 必须在 AppProvider 内使用。');
  return value;
}
