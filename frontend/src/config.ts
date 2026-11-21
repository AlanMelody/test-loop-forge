export type AdapterMode = 'mock' | 'real';

function readMode(value: string | undefined): AdapterMode {
  return value === 'real' ? 'real' : 'mock';
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

function deriveWsBase(apiBase: string): string {
  if (!apiBase) return typeof location !== 'undefined' ? `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}` : 'ws://localhost:3000';
  return apiBase.replace(/^http/, 'ws');
}

export const config = {
  mode: readMode(import.meta.env.VITE_API_MODE),
  apiBaseUrl: trimTrailingSlash(import.meta.env.VITE_API_BASE_URL ?? ''),
  wsBaseUrl: trimTrailingSlash(import.meta.env.VITE_WS_BASE_URL ?? deriveWsBase(trimTrailingSlash(import.meta.env.VITE_API_BASE_URL ?? ''))),
  eventsWsUrl: import.meta.env.VITE_EVENTS_WS_URL ?? '',
  mockScenario: import.meta.env.VITE_MOCK_SCENARIO ?? '',
} as const;

export const isMockMode = config.mode === 'mock';
