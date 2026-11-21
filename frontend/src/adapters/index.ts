import { config } from '../config';
import { mockAdapter } from './mock';
import { realAdapter } from './real';
import type { WorkspaceAdapter } from './types';

export const adapter: WorkspaceAdapter = config.mode === 'real' ? realAdapter : mockAdapter;

export type { ConnectionStatus, PresenceUser, WorkspaceAdapter } from './types';
