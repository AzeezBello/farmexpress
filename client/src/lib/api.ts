import { storage } from './storage';

const API = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';
const TOKEN_KEY = 'farmexpress_token';
export const LOGOUT_EVENT = 'farmexpress:logout';

export const tokenStore = { get: () => storage.get<string | null>(TOKEN_KEY, null), set: (t: string) => storage.set(TOKEN_KEY, t), clear: () => storage.remove(TOKEN_KEY) };

export class ApiError extends Error { constructor(message: string, public status: number) { super(message); } }

export async function api<T>(path: string, { json, ...options }: RequestInit & { json?: unknown } = {}): Promise<T> {
  const token = tokenStore.get();
  let res: Response;
  try {
    res = await fetch(`${API}${path}`, {
      ...options,
      body: json === undefined ? options.body : JSON.stringify(json),
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...options.headers },
    });
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') throw e;
    throw new ApiError('Cannot reach FarmExpress servers. Check your connection.', 0);
  }
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    if (res.status === 401 && token) { tokenStore.clear(); window.dispatchEvent(new Event(LOGOUT_EVENT)); }
    throw new ApiError(data?.message || 'Request failed', res.status);
  }
  return data as T;
}
