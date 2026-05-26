import { supabase } from '../supabase/client';

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000';

async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function request<T>(
  method: 'GET' | 'POST' | 'DELETE' | 'PUT',
  path: string,
  body?: unknown,
  options: { signal?: AbortSignal } = {},
): Promise<T> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...(await authHeaders()),
  };
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    signal: options.signal,
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    let parsed: any;
    try { parsed = JSON.parse(txt); } catch { /* ignore */ }
    throw new Error(parsed?.error ?? `HTTP ${res.status}: ${txt.slice(0, 200)}`);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const api = {
  get: <T>(path: string, options?: { signal?: AbortSignal }) =>
    request<T>('GET', path, undefined, options),
  post: <T>(path: string, body?: unknown, options?: { signal?: AbortSignal }) =>
    request<T>('POST', path, body, options),
  del: <T>(path: string, options?: { signal?: AbortSignal }) =>
    request<T>('DELETE', path, undefined, options),
  put: <T>(path: string, body?: unknown, options?: { signal?: AbortSignal }) =>
    request<T>('PUT', path, body, options),
};

export const API_BASE_URL = API_URL;
