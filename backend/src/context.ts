import type { Pool } from './db/pool.js';
import type { SessionConfig } from './auth/session.js';
import type { EventBroadcaster } from './events/broadcaster.js';
import type { AiDraftAdapter } from './ai/adapter.js';

export interface AppContext {
  pool: Pool;
  session: SessionConfig;
  broadcaster: EventBroadcaster;
  ai: AiDraftAdapter;
}
