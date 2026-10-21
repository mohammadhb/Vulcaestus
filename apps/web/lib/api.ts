import { cookies } from 'next/headers';

export const API_URL =
  process.env.API_INTERNAL_URL ?? process.env.API_URL ?? 'http://localhost:4000';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const cookieStore = await cookies();
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      accept: 'application/json',
      cookie: cookieStore.toString(),
      ...(init.body ? { 'content-type': 'application/json' } : {}),
      ...(init.headers ?? {}),
    },
    cache: 'no-store',
  });
  if (!response.ok) {
    let message = `Request failed with ${response.status}`;
    let details: unknown;
    try {
      const payload = (await response.json()) as { error?: string; details?: unknown };
      message = payload.error ?? message;
      details = payload.details;
    } catch {
      // non-json error
    }
    throw new ApiError(response.status, message, details);
  }
  return (await response.json()) as T;
}

export async function safeApi<T>(path: string): Promise<T | null> {
  try {
    return await api<T>(path);
  } catch {
    return null;
  }
}

export async function publicApi<T>(path: string): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, { cache: 'no-store' });
  if (!response.ok) throw new ApiError(response.status, 'Request failed');
  return (await response.json()) as T;
}
