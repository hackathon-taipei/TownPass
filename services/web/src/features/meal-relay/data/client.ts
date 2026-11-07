/**
 * DATA LAYER - 鄰食轉運站呼叫後端的共用工具（合約 §2 身分、§7 錯誤、§9 斷網）。
 *
 * - 每個請求帶 `X-Demo-User`：網址 `?as=<id>`（存在裝置上）> 已存的 id > 台北通 userinfo 的 id > 'mock-user'
 * - 錯誤一律轉成 MealApiError {code, message, status}；401／403 不吞掉
 * - 讀取（GET）成功就存在裝置上；斷網時回傳上次的資料並標 `stale_at`
 * - 寫入不存、不重送：斷網直接丟 MealApiError('OFFLINE')
 */
import { request as bridgeRequest } from '@/platform/bridge'
import { api, HttpError } from '@/platform/http'
import { readJson, writeJson } from '@/platform/storage'
import type { Cached, ErrorDetail } from './types'

const __AS_KEY = 'meal-relay.as'
const __CACHE_PREFIX = 'meal-relay.cache.'
const __API_BASE = (import.meta.env.VITE_API_BASE ?? 'http://localhost:8000').replace(/\/$/, '')
let __appUserId: string | null = null

/** 後端回應的業務錯誤（§7），或連不上後端（code = 'OFFLINE'，status = 0）。 */
export class MealApiError extends Error {
  code: string
  status: number
  constructor(code: string, message: string, status: number) {
    super(message)
    this.name = 'MealApiError'
    this.code = code
    this.status = status
  }
}

type Query = Record<string, string | number | boolean | null | undefined>

/** 組查詢字串，略過 undefined／null／空字串。 */
export function withQuery(path: string, query?: Query): string {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value === undefined || value === null || value === '') continue
    params.set(key, typeof value === 'boolean' ? (value ? '1' : '0') : String(value))
  }
  const qs = params.toString()
  return qs ? `${path}?${qs}` : path
}

/** 現在的帳號 id（`X-Demo-User` 的值）。 */
export async function currentAccountId(): Promise<string> {
  const fromUrl = __asFromUrl()
  if (fromUrl) {
    writeJson(__AS_KEY, fromUrl)
    return fromUrl
  }
  const stored = readJson<string | null>(__AS_KEY, null)
  if (stored) return stored
  if (__appUserId) return __appUserId
  try {
    // 只取 id（AGENTS.md 隱私規則）
    const info = await bridgeRequest<{ id?: unknown }>('userinfo')
    if (typeof info?.id === 'string' && info.id) __appUserId = info.id
  } catch {
    /* 不在 App 裡也沒有 mock → 用預設值 */
  }
  return __appUserId ?? 'mock-user'
}

/** 改用指定帳號（管理系統登入用）；傳 null 清掉，回到台北通帳號。 */
export function setAccountId(id: string | null): void {
  writeJson(__AS_KEY, id || null)
}

/** 後端給的相對圖片路徑（/meal-relay/images/...）→ 完整網址，可直接放進 <img src>。 */
export function imageSrc(url: string | null | undefined): string | null {
  if (!url) return null
  return /^https?:|^data:/.test(url) ? url : `${__API_BASE}${url}`
}

/** 讀取：成功就存在裝置上，斷網時回傳上次的資料（標 stale_at）。 */
export async function mealGet<T>(path: string, query?: Query): Promise<Cached<T>> {
  const fullPath = withQuery(path, query)
  const accountId = await currentAccountId()
  const cacheKey = `${__CACHE_PREFIX}${accountId}:${fullPath}`
  try {
    const data = await api<T>(`/meal-relay${fullPath}`, { headers: { 'X-Demo-User': accountId } })
    writeJson(cacheKey, { data, saved_at: new Date().toISOString() })
    return data as Cached<T>
  } catch (e) {
    if (e instanceof HttpError) throw __toMealError(e) // 401/403/404… 都往上丟，不用舊資料蓋過
    const cached = readJson<{ data: T; saved_at: string } | null>(cacheKey, null)
    if (cached) return __markStale(cached.data, cached.saved_at)
    throw new MealApiError('OFFLINE', '目前連不上伺服器，請稍後再試', 0)
  }
}

/** 寫入（POST／PUT／PATCH）：不存在裝置上，斷網直接失敗。 */
export async function mealSend<T>(method: 'POST' | 'PUT' | 'PATCH', path: string, body?: unknown): Promise<T> {
  const accountId = await currentAccountId()
  try {
    return await api<T>(`/meal-relay${path}`, {
      method,
      headers: { 'X-Demo-User': accountId },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    })
  } catch (e) {
    if (e instanceof HttpError) throw __toMealError(e)
    throw new MealApiError('OFFLINE', '目前連不上伺服器，這個動作沒有送出', 0)
  }
}

function __asFromUrl(): string | null {
  if (typeof window === 'undefined') return null
  const { search, hash } = window.location
  const hashQuery = hash.includes('?') ? hash.slice(hash.indexOf('?')) : ''
  for (const qs of [hashQuery, search]) {
    const value = new URLSearchParams(qs).get('as')?.trim()
    if (value) return value
  }
  return null
}

function __toMealError(e: HttpError): MealApiError {
  const d = e.detail
  if (d && typeof d === 'object' && 'code' in d && typeof (d as ErrorDetail).code === 'string') {
    const { code, message } = d as ErrorDetail
    return new MealApiError(code, typeof message === 'string' ? message : code, e.status)
  }
  const fallback: Record<number, string> = { 401: 'UNAUTHENTICATED', 403: 'FORBIDDEN_ROLE', 404: 'NOT_FOUND', 422: 'VALIDATION_ERROR' }
  return new MealApiError(fallback[e.status] ?? 'HTTP_ERROR', typeof d === 'string' ? d : e.message, e.status)
}

function __markStale<T>(data: T, savedAt: string): Cached<T> {
  if (Array.isArray(data)) return Object.assign([...data], { stale_at: savedAt }) as unknown as Cached<T>
  if (data && typeof data === 'object') return { ...data, stale_at: savedAt } as Cached<T>
  return data as Cached<T>
}
