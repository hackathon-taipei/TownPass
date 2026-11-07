import { createApp, nextTick } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Assignment, CheckInResult, Claim, Elder, Food } from '@/features/meal-relay/data'

// 志工頁 MR-P04 與我的任務 MR-P05 的邏輯（T-118，logic/volunteer.ts）。資料層與 App bridge 都用 mock，不連網路。

const bridge = vi.hoisted(() => ({ inApp: true, request: vi.fn() }))
vi.mock('@/platform/bridge', () => ({
  isInApp: () => bridge.inApp,
  request: bridge.request,
  send: vi.fn(),
}))

vi.mock('@/features/meal-relay/data', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/features/meal-relay/data')>()
  return {
    MealApiError: real.MealApiError,
    imageSrc: real.imageSrc,
    currentAccountId: vi.fn(async () => 'u-vol-1'),
    getMe: vi.fn(),
    checkIn: vi.fn(),
    listStations: vi.fn(async () => []),
    listMyAssignments: vi.fn(),
    listMyClaims: vi.fn(),
    pickupClaim: vi.fn(),
    cancelClaim: vi.fn(),
    reportVisit: vi.fn(),
    uploadImage: vi.fn(),
    listElders: vi.fn(),
  }
})

const data = await import('@/features/meal-relay/data')
const v = await import('@/features/meal-relay/logic/volunteer')
const d = vi.mocked(data)
const apiError = (code: string, message: string, status = 409) => new data.MealApiError(code, message, status)

// ---------------------------------------------------------------- 測試資料

const elder = (id: string, extra: Partial<Elder> = {}): Elder =>
  ({
    id,
    alias: `長者${id}`,
    station_id: 'st-1',
    allergens: [],
    location: { lat: 25.03, lng: 121.56 },
    alert: true,
    care_due: true,
    meal_due: true,
    last_seen_at: null,
    ...extra,
  }) as Elder

const food = (extra: Partial<Food> = {}): Food =>
  ({ id: 'f-1', name: '雞腿便當', category: 'meal_box', allergens: [], point_name: '某某據點', ...extra }) as Food

const claim = (id: string, assignmentId: string, extra: Partial<Claim> = {}): Claim =>
  ({
    id,
    food_id: 'f-1',
    elder_id: 'e-1',
    qty: 1,
    method: 'delivery',
    status: 'claimed',
    assignment_id: assignmentId,
    food: food(),
    elder: { id: 'e-1', alias: '長者e-1', location: { lat: 25.03, lng: 121.56 } },
    ...extra,
  }) as Claim

const assignment = (id: string, extra: Partial<Assignment> = {}): Assignment =>
  ({
    id,
    checkin_id: 'ck-1',
    volunteer_id: 'u-vol-1',
    elder_id: `e-${id}`,
    station_id: 'st-1',
    needs_meal: true,
    needs_care: true,
    claim_id: null,
    status: 'assigned',
    expires_at: '2099-01-01T00:00:00+08:00',
    elder: elder(`e-${id}`),
    claim: null,
    ...extra,
  }) as Assignment

const station = { id: 'st-1', name: '大安關懷據點', location: { lat: 25.03, lng: 121.55 }, source: '臺北市銀髮族服務_社區照顧關懷據點' }
const checkinResult = (assignments: Assignment[]): CheckInResult => ({
  checkin: { id: 'ck-1', volunteer_id: 'u-vol-1', volunteer_name: '志工一', station_id: 'st-1', checked_in_at: '2026-11-07T09:05:00+08:00' },
  station,
  assignments,
})

/** 在一個真的元件裡跑 composable（onMounted 會執行），回傳結果與卸載函數 */
async function mountComposable<T>(use: () => T): Promise<{ r: T; unmount: () => void }> {
  let r!: T
  const app = createApp({
    setup() {
      r = use()
      return () => null
    },
  })
  app.mount(document.createElement('div'))
  await flush()
  return { r, unmount: () => app.unmount() }
}

async function flush() {
  for (let i = 0; i < 5; i++) {
    await Promise.resolve()
    await nextTick()
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  bridge.inApp = true
  d.getMe.mockResolvedValue({ id: 'u-vol-1', role: 'volunteer', name: '志工一', station_id: 'st-1', supplier: null })
  d.listMyAssignments.mockResolvedValue([])
  d.listMyClaims.mockResolvedValue([])
})

let unmount: (() => void) | undefined
afterEach(() => {
  unmount?.()
  unmount = undefined
})

// ---------------------------------------------------------------- MR-P04 掃描報到

describe('掃描報到（M15、§9）', () => {
  it('normalizeScan：取消（null）、空白、不是字串都不送', () => {
    expect(v.normalizeScan(null)).toBeNull()
    expect(v.normalizeScan('   ')).toBeNull()
    expect(v.normalizeScan(123)).toBeNull()
    expect(v.normalizeScan(' meal-relay:checkin:abc:123 ')).toBe('meal-relay:checkin:abc:123')
  })

  it('掃描取消（App 回傳 null）就不送出報到', async () => {
    bridge.request.mockResolvedValue(null)
    const m = await mountComposable(v.useVolunteerPage)
    unmount = m.unmount
    await m.r.scan()
    expect(bridge.request).toHaveBeenCalledWith('qr_code_scan', null, expect.any(Number))
    expect(d.checkIn).not.toHaveBeenCalled()
    expect(m.r.checkinError.value).toBe('')
  })

  it('掃到 QR 就用掃到的文字報到，顯示據點與任務數', async () => {
    bridge.request.mockResolvedValue('meal-relay:checkin:code1:abcdef0123')
    d.checkIn.mockResolvedValue(checkinResult([assignment('as-1'), assignment('as-2')]))
    const m = await mountComposable(v.useVolunteerPage)
    unmount = m.unmount
    await m.r.scan()
    expect(d.checkIn).toHaveBeenCalledWith('meal-relay:checkin:code1:abcdef0123')
    expect(m.r.station.value?.name).toBe('大安關懷據點')
    expect(m.r.taskCount.value).toBe(2)
    expect(m.r.checkedIn.value).toBe(true)
    expect(m.r.notice.value).toContain('2 件任務')
  })

  it('瀏覽器沒有 App：改成貼上 QR 文字，不呼叫掃描', async () => {
    bridge.inApp = false
    d.checkIn.mockResolvedValue(checkinResult([]))
    const m = await mountComposable(v.useVolunteerPage)
    unmount = m.unmount
    expect(m.r.scannable).toBe(false)
    m.r.pasted.value = '  '
    await m.r.submitPasted()
    expect(d.checkIn).not.toHaveBeenCalled()
    m.r.pasted.value = 'meal-relay:checkin:code1:abcdef0123'
    await m.r.submitPasted()
    expect(bridge.request).not.toHaveBeenCalled()
    expect(d.checkIn).toHaveBeenCalledWith('meal-relay:checkin:code1:abcdef0123')
  })

  it('V18 QR_EXPIRED：請掃據點畫面上最新的 QR', async () => {
    bridge.request.mockResolvedValue('meal-relay:checkin:code1:oldtoken00')
    d.checkIn.mockRejectedValue(apiError('QR_EXPIRED', 'QR code 已過期'))
    const m = await mountComposable(v.useVolunteerPage)
    unmount = m.unmount
    await m.r.scan()
    expect(m.r.checkinError.value).toContain('請掃據點畫面上最新的 QR code')
    expect(m.r.checkedIn.value).toBe(false)
  })

  it('WRONG_STATION、NOT_FOUND 顯示後端訊息（§7）', () => {
    expect(v.checkinErrorText(apiError('WRONG_STATION', '這不是你所屬據點的 QR code', 403))).toBe('這不是你所屬據點的 QR code')
    expect(v.checkinErrorText(apiError('NOT_FOUND', '找不到這個據點', 404))).toBe('找不到這個據點')
  })

  it('V15 同一志工重複報到拿到同一批任務：提示沒有重複派送', async () => {
    const tasks = [assignment('as-1'), assignment('as-2')]
    d.listMyAssignments.mockResolvedValue(tasks)
    bridge.request.mockResolvedValue('meal-relay:checkin:code1:abcdef0123')
    d.checkIn.mockResolvedValue(checkinResult(tasks))
    const m = await mountComposable(v.useVolunteerPage)
    unmount = m.unmount
    await m.r.scan()
    expect(m.r.taskCount.value).toBe(2)
    expect(m.r.notice.value).toContain('沒有重複派送')
    expect(v.isRepeatCheckin([], checkinResult(tasks))).toBe(false)
  })

  it('M13 志工頁沒有長者清單或地圖：只回傳任務數，不呼叫任何列出長者的端點', async () => {
    d.listMyAssignments.mockResolvedValue([assignment('as-1')])
    const m = await mountComposable(v.useVolunteerPage)
    unmount = m.unmount
    expect(m.r.taskCount.value).toBe(1)
    expect(d.listElders).not.toHaveBeenCalled()
    for (const key of Object.keys(m.r as object)) expect(key).not.toMatch(/elder|marker|assignments/i)
  })

  it('斷網（stale_at）時停用報到', async () => {
    d.getMe.mockResolvedValue({ id: 'u-vol-1', role: 'volunteer', name: '志工一', station_id: 'st-1', supplier: null, stale_at: '2026-11-07T08:00:00Z' })
    const m = await mountComposable(v.useVolunteerPage)
    unmount = m.unmount
    expect(m.r.offline.value).toBe(true)
  })
})

// ---------------------------------------------------------------- MR-P05 任務

describe('任務（M8、M13、M17）', () => {
  it('taskViews：只有 assigned；申請已取消 → 只做關懷', () => {
    const views = v.taskViews(
      [
        assignment('as-1', { claim_id: 'c-1' }),
        assignment('as-2', { claim_id: 'c-2' }),
        assignment('as-3', { status: 'done' }),
        assignment('as-4', { needs_meal: true, claim_id: null }),
      ],
      [claim('c-1', 'as-1')],
    )
    expect(views.map((t) => t.id)).toEqual(['as-1', 'as-2', 'as-4'])
    expect(views[0]).toMatchObject({ kind: 'meal', todo: ['meal', 'care'], note: '' })
    expect(views[1]).toMatchObject({ kind: 'care', claim: null, note: '這份餐已取消，這次只做關懷' })
    expect(views[2]).toMatchObject({ kind: 'care', note: '這次沒有合適的餐，只做關懷' })
  })

  it('送餐要先取餐才能回報（reportReady）', () => {
    expect(v.reportReady({ claim: claim('c-1', 'as-1') })).toBe(false)
    expect(v.reportReady({ claim: claim('c-1', 'as-1', { status: 'delivering' }) })).toBe(true)
    expect(v.reportReady({ claim: null })).toBe(true)
  })

  it('取餐：claimed → delivering', async () => {
    d.listMyAssignments.mockResolvedValue([assignment('as-1', { claim_id: 'c-1' })])
    d.listMyClaims.mockResolvedValue([claim('c-1', 'as-1')])
    d.pickupClaim.mockResolvedValue(claim('c-1', 'as-1', { status: 'delivering' }))
    const m = await mountComposable(v.useMyTasks)
    unmount = m.unmount
    await m.r.pickup(m.r.tasks.value[0]!)
    expect(d.pickupClaim).toHaveBeenCalledWith('c-1')
    expect(m.r.tasks.value[0]!.claim?.status).toBe('delivering')
  })

  it('V7 取消這份餐：任務保留，改成只做關懷', async () => {
    d.listMyAssignments.mockResolvedValue([assignment('as-1', { claim_id: 'c-1' })])
    d.listMyClaims.mockResolvedValue([claim('c-1', 'as-1')])
    d.cancelClaim.mockResolvedValue(claim('c-1', 'as-1', { status: 'cancelled' }))
    const m = await mountComposable(v.useMyTasks)
    unmount = m.unmount
    await m.r.cancel(m.r.tasks.value[0]!)
    expect(d.cancelClaim).toHaveBeenCalledWith('c-1')
    expect(m.r.tasks.value).toHaveLength(1)
    expect(m.r.tasks.value[0]).toMatchObject({ kind: 'care', claim: null })
  })

  it('斷網時不送取餐，回報也停用', async () => {
    const stale = Object.assign([assignment('as-1', { claim_id: 'c-1' })], { stale_at: '2026-11-07T08:00:00Z' })
    d.listMyAssignments.mockResolvedValue(stale)
    d.listMyClaims.mockResolvedValue([claim('c-1', 'as-1', { status: 'delivering' })])
    const m = await mountComposable(v.useMyTasks)
    unmount = m.unmount
    expect(m.r.offline.value).toBe(true)
    await m.r.pickup(m.r.tasks.value[0]!)
    expect(d.pickupClaim).not.toHaveBeenCalled()
    m.r.openReport(m.r.tasks.value[0]!)
    m.r.form.value.result = 'seen'
    expect(m.r.blockReason.value).toBe('目前離線，暫時不能送出')
  })
})

// ---------------------------------------------------------------- 拜訪回報

describe('拜訪回報（M9、M11、M13）', () => {
  it('buildVisit：送餐帶 claim_id；放門口帶照片；只做關懷不帶申請', () => {
    const [meal] = v.taskViews([assignment('as-1', { claim_id: 'c-1' })], [claim('c-1', 'as-1', { status: 'delivering' })])
    expect(v.buildVisit(meal!, { ...v.emptyReportForm(), result: 'left_at_door', photoImageId: 'img-1' })).toEqual({
      elder_id: 'e-as-1',
      kind: 'meal',
      result: 'left_at_door',
      assignment_id: 'as-1',
      claim_id: 'c-1',
      photo_image_id: 'img-1',
    })
    const [care] = v.taskViews([assignment('as-2', { claim_id: 'c-2' })], [])
    expect(v.buildVisit(care!, { ...v.emptyReportForm(), result: 'seen' })).toEqual({
      elder_id: 'e-as-2',
      kind: 'care',
      result: 'seen',
      assignment_id: 'as-2',
    })
  })

  it('放門口沒有照片不能送出', async () => {
    d.listMyAssignments.mockResolvedValue([assignment('as-1', { claim_id: 'c-1' })])
    d.listMyClaims.mockResolvedValue([claim('c-1', 'as-1', { status: 'delivering' })])
    const m = await mountComposable(v.useMyTasks)
    unmount = m.unmount
    m.r.openReport(m.r.tasks.value[0]!)
    m.r.form.value.result = 'left_at_door'
    expect(m.r.blockReason.value).toBe('放門口一定要拍照')
    await m.r.submitReport()
    expect(d.reportVisit).not.toHaveBeenCalled()
    m.r.form.value.photoImageId = 'img-1'
    expect(m.r.blockReason.value).toBe('')
  })

  it('V11 生鮮不能選放門口：canLeaveAtDoor、送出鍵停用，後端 FRESH_CANNOT_LEAVE 時清掉選擇', async () => {
    expect(v.canLeaveAtDoor('meal', 'produce')).toBe(false)
    expect(v.canLeaveAtDoor('meal', 'meal_box')).toBe(true)
    expect(v.canLeaveAtDoor('care', undefined)).toBe(false)

    const produce = claim('c-1', 'as-1', { status: 'delivering', food: food({ category: 'produce', name: '高麗菜' }) })
    d.listMyAssignments.mockResolvedValue([assignment('as-1', { claim_id: 'c-1' })])
    d.listMyClaims.mockResolvedValue([produce])
    const m = await mountComposable(v.useMyTasks)
    unmount = m.unmount
    m.r.openReport(m.r.tasks.value[0]!)
    m.r.form.value = { ...m.r.form.value, result: 'left_at_door', photoImageId: 'img-1' }
    expect(m.r.blockReason.value).toBe('生鮮蔬果不能放門口，請改選其他結果')
    await m.r.submitReport()
    expect(d.reportVisit).not.toHaveBeenCalled()

    // 後端仍回 FRESH_CANNOT_LEAVE（例如食物剛被改成生鮮）：顯示後端訊息、清掉選擇、任務還在
    const [meal] = v.taskViews([assignment('as-1', { claim_id: 'c-1' })], [claim('c-1', 'as-1', { status: 'delivering' })])
    m.r.reportTask.value = meal!
    m.r.form.value = { ...v.emptyReportForm(), result: 'left_at_door', photoImageId: 'img-1' }
    d.reportVisit.mockRejectedValueOnce(apiError('FRESH_CANNOT_LEAVE', '生鮮蔬果不能放門口'))
    await m.r.submitReport()
    expect(m.r.reportError.value).toBe('生鮮蔬果不能放門口')
    expect(m.r.form.value.result).toBeNull()
    expect(m.r.tasks.value).toHaveLength(1)
  })

  it('V20 回報後任務從清單移除，裝置上的快取也清掉', async () => {
    const tasks = [assignment('as-1', { claim_id: 'c-1' }), assignment('as-2')]
    const claims = [claim('c-1', 'as-1', { status: 'delivering' })]
    localStorage.setItem('townpass.meal-relay.cache.u-vol-1:/assignments/mine', JSON.stringify({ data: tasks, saved_at: 'x' }))
    localStorage.setItem('townpass.meal-relay.cache.u-vol-1:/claims/mine', JSON.stringify({ data: claims, saved_at: 'x' }))
    d.listMyAssignments.mockResolvedValueOnce(tasks).mockResolvedValue([tasks[1]!])
    d.listMyClaims.mockResolvedValueOnce(claims).mockResolvedValue([])
    d.reportVisit.mockResolvedValue({} as never)
    const m = await mountComposable(v.useMyTasks)
    unmount = m.unmount

    m.r.openReport(m.r.tasks.value[0]!)
    m.r.form.value.result = 'seen'
    await m.r.submitReport()
    expect(d.reportVisit).toHaveBeenCalledWith(expect.objectContaining({ elder_id: 'e-as-1', kind: 'meal', result: 'seen', claim_id: 'c-1' }))
    expect(m.r.tasks.value.map((t) => t.id)).toEqual(['as-2'])
    expect(m.r.reportOpen.value).toBe(false)

    const cachedTasks = JSON.parse(localStorage.getItem('townpass.meal-relay.cache.u-vol-1:/assignments/mine')!)
    const cachedClaims = JSON.parse(localStorage.getItem('townpass.meal-relay.cache.u-vol-1:/claims/mine')!)
    expect(cachedTasks.data.map((a: Assignment) => a.id)).toEqual(['as-2'])
    expect(cachedClaims.data).toEqual([])
  })

  it('V20 回報不屬於自己任務的長者（NOT_OWNER）：顯示後端訊息並移除任務', async () => {
    d.listMyAssignments.mockResolvedValueOnce([assignment('as-1')]).mockResolvedValue([])
    d.reportVisit.mockRejectedValue(apiError('NOT_OWNER', '這位長者不在你的任務裡', 403))
    const m = await mountComposable(v.useMyTasks)
    unmount = m.unmount
    m.r.openReport(m.r.tasks.value[0]!)
    m.r.form.value.result = 'seen'
    await m.r.submitReport()
    expect(m.r.reportError.value).toBe('這位長者不在你的任務裡')
    expect(m.r.tasks.value).toHaveLength(0)
  })
})
