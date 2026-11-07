/** DATA LAYER - 據點、報到、派送任務（後端 meal_dispatch，T-112）。 */
import { mealGet, mealSend } from './client'
import type { Assignment, Cached, CheckInResult, MyStation, Station } from './types'

/** GET /stations */
export function listStations(): Promise<Cached<Station[]>> {
  return mealGet<Station[]>('/stations')
}

/** GET /stations/mine（station：含 qr_text、今天的報到） */
export function getMyStation(): Promise<Cached<MyStation>> {
  return mealGet<MyStation>('/stations/mine')
}

/** POST /checkins（volunteer）。qrText = 掃到的 QR 內容（meal-relay:checkin:<code>） */
export function checkIn(qrText: string): Promise<CheckInResult> {
  return mealSend<CheckInResult>('POST', '/checkins', { qr_text: qrText })
}

/** GET /assignments/mine（volunteer） */
export function listMyAssignments(): Promise<Cached<Assignment[]>> {
  return mealGet<Assignment[]>('/assignments/mine')
}
