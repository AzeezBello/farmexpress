import { storage } from './storage';

const API = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://localhost:4000/api' : '/api');
const API_ORIGIN = API.startsWith('http') ? API.replace(/\/api\/?$/, '') : '';
const TOKEN_KEY = 'farmexpress_token';
export const LOGOUT_EVENT = 'farmexpress:logout';

export const tokenStore = {
  get: () => storage.get<string | null>(TOKEN_KEY, null),
  set: (t: string) => storage.set(TOKEN_KEY, t),
  clear: () => storage.remove(TOKEN_KEY),
};

export class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

export function resolveAssetUrl(url?: string | null): string | undefined {
  if (!url) return undefined;
  if (url.startsWith('/api/')) return `${API_ORIGIN}${url}`;
  return url;
}

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
    if (res.status === 401 && token) {
      tokenStore.clear();
      window.dispatchEvent(new Event(LOGOUT_EVENT));
    }
    throw new ApiError(data?.message || 'Request failed', res.status);
  }
  return data as T;
}

export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => (typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('Could not read file')));
    reader.onerror = () => reject(new Error('Could not read file'));
    reader.readAsDataURL(file);
  });
}

export async function uploadFile(file: File, purpose: 'PRODUCT' | 'KYC' = 'PRODUCT') {
  if (file.size > 4 * 1024 * 1024) {
    throw new Error('File must be 4 MB or smaller');
  }
  const data = await readFileAsDataUrl(file);
  return api<{ id: string; url: string; filename: string; mimeType: string; size: number }>('/uploads', {
    method: 'POST',
    json: {
      filename: file.name,
      mimeType: file.type || 'application/octet-stream',
      data,
      purpose,
    },
  });
}
