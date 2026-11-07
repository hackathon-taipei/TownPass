/** DATA LAYER - 長者與拜訪回報（後端 meal_elder，T-111）。 */
import { mealGet, mealSend } from './client'
import type {
  Cached,
  Elder,
  ElderCreate,
  ElderCreated,
  ElderMeUpsert,
  ElderUpdate,
  Location,
  Visit,
  VisitCreate,
} from './types'

/** GET /elders/me（elder）；還沒建立自己的資料 → null */
export function getMyElder(): Promise<Cached<Elder | null>> {
  return mealGet<Elder | null>('/elders/me')
}

/** PUT /elders/me（elder：location、allergens、alias?） */
export function upsertMyElder(body: ElderMeUpsert): Promise<Elder> {
  return mealSend<Elder>('PUT', '/elders/me', body)
}

/** GET /elders（volunteer 自己據點、admin） */
export function listElders(): Promise<Cached<Elder[]>> {
  return mealGet<Elder[]>('/elders')
}

/** POST /elders（volunteer 自己據點、admin）；回應附 nearby（M12） */
export function createElder(body: ElderCreate): Promise<ElderCreated> {
  return mealSend<ElderCreated>('POST', '/elders', body)
}

/** PATCH /elders/{id}（volunteer 自己據點、admin） */
export function updateElder(id: string, body: ElderUpdate): Promise<Elder> {
  return mealSend<Elder>('PATCH', `/elders/${encodeURIComponent(id)}`, body)
}

/** GET /elders/nearby?lat=&lng=（volunteer、admin） */
export function findNearbyElders(location: Location): Promise<Cached<Elder[]>> {
  return mealGet<Elder[]>('/elders/nearby', { lat: location.lat, lng: location.lng })
}

/** POST /elders/{id}/merge（admin）：把 id 併入 into，回傳合併後保留的長者（into） */
export function mergeElder(id: string, into: string): Promise<Elder> {
  return mealSend<Elder>('POST', `/elders/${encodeURIComponent(id)}/merge`, { into })
}

/** POST /visits（volunteer） */
export function reportVisit(body: VisitCreate): Promise<Visit> {
  return mealSend<Visit>('POST', '/visits', body)
}
