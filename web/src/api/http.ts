/**
 * fetch 래퍼: 주소, 토큰(Authorization: Bearer), 시간 제한, 오류 문구를 한곳에서 처리한다.
 */
export const API_BASE = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') || 'https://hackathon23.onrender.com';

export class ApiError extends Error {
  status: number;
  constructor(message: string, status = 0) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

const TOKEN_KEY = 'etabuilder.token';
let memToken: string | null = null;

export function getToken(): string | null {
  if (memToken) return memToken;
  try {
    memToken = localStorage.getItem(TOKEN_KEY);
  } catch {
    /* 저장소를 못 쓰는 환경이면 메모리에만 둔다 */
  }
  return memToken;
}

export function setToken(token: string | null) {
  memToken = token;
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* 무시 */
  }
}

export interface RequestOptions {
  method?: string;
  body?: unknown;
  form?: FormData;
  timeoutMs?: number;
}

export async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, form, timeoutMs = 30000 } = opts;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  const headers: Record<string, string> = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body: form ?? (body !== undefined ? JSON.stringify(body) : undefined),
      signal: ctrl.signal
    });
    if (!res.ok) {
      let detail = '';
      try {
        const data = await res.json();
        const d = data?.detail ?? data?.message ?? data;
        detail = typeof d === 'string' ? d : Array.isArray(d) ? d.map((x) => x?.msg ?? '').join(', ') : '';
      } catch {
        detail = '';
      }
      throw new ApiError(detail || `서버 오류 (${res.status})`, res.status);
    }
    return (await res.json()) as T;
  } catch (e) {
    if (e instanceof ApiError) throw e;
    if (e instanceof DOMException && e.name === 'AbortError') throw new ApiError('서버 응답이 너무 늦어요', 0);
    throw new ApiError('서버에 연결할 수 없어요', 0);
  } finally {
    clearTimeout(timer);
  }
}
