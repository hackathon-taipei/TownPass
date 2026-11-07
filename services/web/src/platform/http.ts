/**
 * DATA LAYER - platform adapter: HTTP to our backend.
 * Base URL from VITE_API_BASE. Sends a bearer token when one is set (only the optional auth add-on sets it).
 */
const __BASE = (import.meta.env.VITE_API_BASE ?? 'http://localhost:8000').replace(/\/$/, '')
let __token: string | null = null

export class HttpError extends Error {
  status: number
  /** JSON 錯誤回應的 `detail`（FastAPI 格式）；回應不是 JSON 或沒有 detail 時為 undefined */
  detail?: unknown
  constructor(status: number, message: string, detail?: unknown) {
    super(message)
    this.status = status
    this.detail = detail
  }
}

/** Called by the session module only. */
export function setAuthToken(token: string | null): void {
  __token = token
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${__BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(__token ? { Authorization: `Bearer ${__token}` } : {}),
      ...init?.headers,
    },
  })
  if (!res.ok) throw new HttpError(res.status, `${init?.method ?? 'GET'} ${path} -> ${res.status}`, await __errorDetail(res))
  return (res.status === 204 ? undefined : await res.json()) as T
}

async function __errorDetail(res: Response): Promise<unknown> {
  try {
    const body: unknown = await res.json()
    return body && typeof body === 'object' && 'detail' in body ? (body as { detail: unknown }).detail : undefined
  } catch {
    return undefined
  }
}
