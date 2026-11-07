/** DATA LAYER - 據點、報到、派送任務（後端 meal_dispatch，T-112）。 */
import { mealGet, mealSend } from './client'
import type { Assignment, Cached, CheckInResult, MyStation, Station } from './types'

/** GET /stations */
export function listStations(): Promise<Cached<Station[]>> {
  return mealGet<Station[]>('/stations')
}

/** GET /stations/mine（station：含 qr_text、qr_expires_at、今天的報到；QR 在 qr_expires_at 前重新取得，M15） */
export function getMyStation(): Promise<Cached<MyStation>> {
  return mealGet<MyStation>('/stations/mine')
}

/** POST /checkins（volunteer）。qrText = 掃到的 QR 內容（meal-relay:checkin:<code>:<token>，M15） */
export function checkIn(qrText: string): Promise<CheckInResult> {
  return mealSend<CheckInResult>('POST', '/checkins', { qr_text: qrText })
}

/** GET /assignments/mine（volunteer）：只回傳進行中（assigned）的任務，完成後消失（M13） */
export function listMyAssignments(): Promise<Cached<Assignment[]>> {
  return mealGet<Assignment[]>('/assignments/mine')
}
