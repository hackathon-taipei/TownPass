/**
 * DATA LAYER - 長者名冊與拜訪回報（後端 meal_elder，T-111）。
 * ADR-026：長者不是帳號、不使用 App；名冊只有管理員維護，志工只能回報自己任務上的長者。
 */
import { mealGet, mealSend } from './client'
import type { Cached, Elder, ElderCreate, ElderUpdate, Visit, VisitCreate } from './types'

/** GET /elders（admin：長者名冊） */
export function listElders(): Promise<Cached<Elder[]>> {
  return mealGet<Elder[]>('/elders')
}

/** POST /elders（admin：登記長者，回傳建立的長者） */
export function createElder(body: ElderCreate): Promise<Elder> {
  return mealSend<Elder>('POST', '/elders', body)
}

/** PATCH /elders/{id}（admin） */
export function updateElder(id: string, body: ElderUpdate): Promise<Elder> {
  return mealSend<Elder>('PATCH', `/elders/${encodeURIComponent(id)}`, body)
}

/** POST /visits（volunteer：只限自己 assigned 任務上的長者，否則 NOT_OWNER，M13） */
export function reportVisit(body: VisitCreate): Promise<Visit> {
  return mealSend<Visit>('POST', '/visits', body)
}
