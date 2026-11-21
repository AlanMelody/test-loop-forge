import { config } from '../../config';
import { networkError, parseErrorResponse } from '../../utils/errors';

export function apiUrl(path: string): string {
  return `${config.apiBaseUrl}${path}`;
}

export function wsUrl(path: string): string {
  if (path.startsWith('ws://') || path.startsWith('wss://')) return path;
  return `${config.wsBaseUrl}${path}`;
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(apiUrl(path), {
      ...init,
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...(init.headers ?? {}),
      },
    });
  } catch {
    throw networkError();
  }
  if (!response.ok) throw await parseErrorResponse(response);
  if (response.status === 204) return undefined as T;
  const text = await response.text();
  return text ? (JSON.parse(text) as T) : (undefined as T);
}
