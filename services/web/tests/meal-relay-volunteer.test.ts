import { createApp, defineComponent, h, nextTick, type Component } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Assignment, CheckInResult, Claim, Elder, Food } from '@/features/meal-relay/data'

// 志工頁 MR-P04 與我的任務 MR-P05 的邏輯（T-118，logic/volunteer.ts）與設計 v2 畫面（T-135）。
// 資料層與 App bridge 都用 mock，不連網路；地圖（MR-C07）換成空元件（收合時本來就不建立）。

vi.mock('@/features/meal-relay/ui/MapView.vue', () => ({
  default: defineComponent({ props: ['markers'], render: () => h('div', { 'data-map': '' }) }),
}))

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
  v.forgetCheckin()
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

// ---------------------------------------------------------------- T-125 長者地址（只能是模擬資料，ADR-027）

describe('任務卡的長者地址', () => {
  const addr = '臺北市萬華區西園路一段 999 號（模擬）'

  it('addressLine：有地址回傳（去掉前後空白）；空字串、只有空白、舊快取沒有欄位都回 null（不顯示這一行）', () => {
    expect(v.addressLine(elder('e-1', { address: ` ${addr} ` }))).toBe(addr)
    expect(v.addressLine(elder('e-1', { address: '' }))).toBeNull()
    expect(v.addressLine(elder('e-1', { address: '   ' }))).toBeNull()
    expect(v.addressLine(elder('e-1'))).toBeNull()
    expect(v.addressLine({ address: null })).toBeNull()
  })

  it('copyAddress 成功：寫入剪貼簿、顯示「已複製地址」、回 true', async () => {
    const { toasts } = await import('@/features/meal-relay/logic/toast')
    toasts.value = []
    const writer = vi.fn(async () => {})
    expect(await v.copyAddress(` ${addr} `, writer)).toBe(true)
    expect(writer).toHaveBeenCalledWith(addr)
    expect(toasts.value.map((t) => t.message)).toContain('已複製地址')
  })

  it('copyAddress 失敗（被拒、沒有剪貼簿、空字串）：回 false、不顯示成功提示，畫面改成選取文字', async () => {
    const { toasts } = await import('@/features/meal-relay/logic/toast')
    toasts.value = []
    expect(await v.copyAddress(addr, vi.fn(async () => { throw new Error('denied') }))).toBe(false)
    expect(await v.copyAddress(addr, null)).toBe(false)
    const writer = vi.fn(async () => {})
    expect(await v.copyAddress('  ', writer)).toBe(false)
    expect(writer).not.toHaveBeenCalled()
    expect(toasts.value).toHaveLength(0)
  })
})

// ---------------------------------------------------------------- 設計 v2（T-135）：邏輯

describe('設計 v2 的畫面狀態（T-135）', () => {
  const claimed = () => claim('c-1', 'as-1')
  const delivering = () => claim('c-2', 'as-2', { status: 'delivering' })

  it('StepIndicator 的目前步驟：還沒報到 → 報到；有待取餐 → 取餐；都在配送中或純關懷 → 回報；沒有任務 → 全部完成', () => {
    expect(v.volunteerStepOf(false, [])).toBe(0)
    expect(v.volunteerStepOf(true, [assignment('as-1', { claim: claimed() }), assignment('as-2', { claim: delivering() })])).toBe(1)
    expect(v.volunteerStepOf(true, [assignment('as-2', { claim: delivering() }), assignment('as-3')])).toBe(2)
    // 取消後的申請（cancelled）不算待取餐
    expect(v.volunteerStepOf(true, [assignment('as-1', { claim: claim('c-1', 'as-1', { status: 'cancelled' }) })])).toBe(2)
    expect(v.volunteerStepOf(true, [assignment('as-9', { status: 'done', claim: claimed() })])).toBe(3)
    expect(v.volunteerStepOf(true, [])).toBe(3)
  })

  it('志工首頁的步驟跟著報到結果走（取餐 → 回報）', async () => {
    bridge.request.mockResolvedValue('meal-relay:checkin:code1:abcdef0123')
    d.checkIn.mockResolvedValue(checkinResult([assignment('as-1', { claim_id: 'c-1', claim: claimed() })]))
    const m = await mountComposable(v.useVolunteerPage)
    unmount = m.unmount
    expect(m.r.step.value).toBe(0)
    await m.r.scan()
    expect(m.r.step.value).toBe(1)
    expect(m.r.name.value).toBe('志工一')
  })

  it('任務卡三種狀態的晶片與主按鈕：待取餐、配送中、純關懷', () => {
    const [pickup, deliver, care] = v.taskViews(
      [assignment('as-1', { claim_id: 'c-1' }), assignment('as-2', { claim_id: 'c-2', needs_care: false }), assignment('as-3', { needs_meal: false })],
      [claimed(), delivering()],
    )
    expect(v.taskChipsOf(pickup!).map((c) => c.label)).toEqual(['送餐+關懷', '待取餐'])
    expect(v.taskActionOf(pickup!)).toEqual({ action: 'pickup', label: '確認已取餐' })
    expect(v.taskChipsOf(deliver!).map((c) => c.label)).toEqual(['送餐', '配送中'])
    expect(v.taskActionOf(deliver!)).toEqual({ action: 'report', label: '回報拜訪' })
    expect(v.taskChipsOf(care!).map((c) => c.label)).toEqual(['純關懷'])
    expect(v.taskActionOf(care!)).toEqual({ action: 'report', label: '回報拜訪' })
  })

  it('取餐地點是食物點名稱＋地址（T-133）；食物那一行是份數與最晚食用時間', () => {
    expect(v.pickupPlaceOf({ point_name: '仁愛食物點', point_address: ' 仁愛路示範廣場（模擬） ' })).toEqual({ name: '仁愛食物點', address: '仁愛路示範廣場（模擬）' })
    expect(v.pickupPlaceOf({ point_name: '仁愛食物點', point_address: '' }).address).toBeNull()
    expect(v.mealLineOf({ qty: 1, food: { expires_at: '2026-11-08T12:30:00+08:00' } })).toBe('1 份・最晚 12:30 食用')
    expect(v.mealLineOf({ qty: 2, food: { expires_at: '' } })).toBe('2 份')
  })

  it('任務卡群組：原本展開的還在就不變，離開了或沒有展開的 → 第一張', () => {
    expect(v.firstOpenTask(['a', 'b'], null)).toBe('a')
    expect(v.firstOpenTask(['a', 'b'], 'b')).toBe('b')
    expect(v.firstOpenTask(['b'], 'a')).toBe('b')
    expect(v.firstOpenTask([], 'a')).toBeNull()
  })

  it('V11 放門口不能選的原因：生鮮蔬果、純關懷', () => {
    expect(v.REPORT_OPTIONS.map((o) => o.label)).toEqual(['見到本人', '放門口，附照片', '未見到，帶回'])
    expect(v.leaveAtDoorBlockText('meal', 'meal_box')).toBe('')
    expect(v.leaveAtDoorBlockText('meal', 'produce')).toBe('生鮮蔬果不能放門口')
    expect(v.leaveAtDoorBlockText('care', undefined)).toContain('只做關懷')
  })

  it('取消要先確認：askCancel 只開確認視窗，confirmCancel 才呼叫 cancelClaim，卡片改成純關懷（V7）', async () => {
    d.listMyAssignments.mockResolvedValue([assignment('as-1', { claim_id: 'c-1' })])
    d.listMyClaims.mockResolvedValue([claimed()])
    d.cancelClaim.mockResolvedValue(claim('c-1', 'as-1', { status: 'cancelled' }))
    const m = await mountComposable(v.useMyTasks)
    unmount = m.unmount
    m.r.askCancel(m.r.tasks.value[0]!)
    expect(m.r.cancelOpen.value).toBe(true)
    expect(d.cancelClaim).not.toHaveBeenCalled()
    await m.r.confirmCancel()
    expect(d.cancelClaim).toHaveBeenCalledWith('c-1')
    expect(m.r.cancelOpen.value).toBe(false)
    expect(v.taskChipsOf(m.r.tasks.value[0]!).map((c) => c.label)).toEqual(['純關懷'])
  })

  it('最後一張回報後出現完成畫面，N = 這次頁面裡回報的件數，裝置上不留任務', async () => {
    const tasks = [assignment('as-1', { needs_meal: false }), assignment('as-2', { needs_meal: false })]
    localStorage.setItem('townpass.meal-relay.cache.u-vol-1:/assignments/mine', JSON.stringify({ data: tasks, saved_at: 'x' }))
    d.listMyAssignments.mockResolvedValueOnce(tasks).mockResolvedValueOnce([tasks[1]!]).mockResolvedValue([])
    d.reportVisit.mockResolvedValue({} as never)
    const m = await mountComposable(v.useMyTasks)
    unmount = m.unmount
    for (const expected of [false, true]) {
      m.r.openReport(m.r.tasks.value[0]!)
      m.r.form.value.result = 'seen'
      await m.r.submitReport()
      await flush()
      expect(m.r.allDone.value).toBe(expected)
    }
    expect(m.r.reportedCount.value).toBe(2)
    const cached = JSON.parse(localStorage.getItem('townpass.meal-relay.cache.u-vol-1:/assignments/mine')!)
    expect(cached.data).toEqual([])
  })

  it('一開始就沒有任務不是完成畫面（顯示沒有任務）', async () => {
    const m = await mountComposable(v.useMyTasks)
    unmount = m.unmount
    expect(m.r.tasks.value).toHaveLength(0)
    expect(m.r.allDone.value).toBe(false)
  })

  it('重新開啟志工頁：報到時間用進行中任務最早的 assigned_at', async () => {
    d.listMyAssignments.mockResolvedValue([
      assignment('as-2', { assigned_at: '2026-11-08T11:20:00+08:00' }),
      assignment('as-1', { assigned_at: '2026-11-08T11:20:00+08:00' }),
    ])
    const m = await mountComposable(v.useVolunteerPage)
    unmount = m.unmount
    expect(m.r.checkedIn.value).toBe(true)
    expect(v.clockText(m.r.checkedInAt.value)).toBe('11:20')
    expect(v.checkinTimeOf([assignment('as-3', { status: 'done', assigned_at: '2026-11-08T08:00:00+08:00' })])).toBeNull()
  })

  it('任務都完成後回到志工首頁，仍顯示今天已報到的據點（只在記憶體）', async () => {
    const result = checkinResult([assignment('as-1')])
    result.checkin.checked_in_at = new Date().toISOString()
    bridge.request.mockResolvedValue('meal-relay:checkin:code1:abcdef0123')
    d.checkIn.mockResolvedValue(result)
    const first = await mountComposable(v.useVolunteerPage)
    await first.r.scan()
    first.unmount()

    d.listMyAssignments.mockResolvedValue([])
    const again = await mountComposable(v.useVolunteerPage)
    unmount = again.unmount
    expect(again.r.checkedIn.value).toBe(true)
    expect(again.r.station.value?.name).toBe('大安關懷據點')
    expect(again.r.taskCount.value).toBe(0)
    expect(again.r.step.value).toBe(3)
    expect(localStorage.length).toBe(0)
  })
})

// ---------------------------------------------------------------- 設計 v2（T-135）：畫面

describe('設計 v2 畫面（T-135）', () => {
  const routes = ['volunteer', 'volunteer/tasks'].map((p, i) => ({
    path: `/f/meal-relay/${p}`,
    name: `meal-relay.${i ? 'tasks' : 'volunteer'}`,
    component: { render: () => null },
  }))

  async function render(page: Component, path: string) {
    const { setOpenInGroup } = await import('@/features/meal-relay/logic/brand')
    setOpenInGroup(v.TASK_GROUP, null)
    const router = createRouter({ history: createMemoryHistory(), routes })
    await router.push(path)
    const el = document.createElement('div')
    document.body.appendChild(el)
    const app = createApp(page).use(router)
    app.mount(el)
    await flush()
    unmount = () => {
      app.unmount()
      document.body.innerHTML = ''
    }
    return { el, router }
  }

  const card = (id: string) => document.querySelector(`[data-task="${id}"]`)!
  const chipsOf = (id: string) => [...card(id).querySelectorAll('[data-chip]')].map((c) => c.textContent?.trim())
  const mainOf = (id: string) => card(id).querySelector<HTMLButtonElement>('button[data-action]')!
  const expanded = () => [...document.querySelectorAll('[data-task] > button[aria-expanded]')].map((b) => b.getAttribute('aria-expanded'))
  const buttonByText = (text: string) => [...document.querySelectorAll<HTMLElement>('button, a')].find((b) => b.textContent?.trim() === text)

  function threeTasks() {
    d.listMyAssignments.mockResolvedValue([
      assignment('as-1', { claim_id: 'c-1', elder: elder('e-as-1', { alias: '陳阿公', address: '和平路示範巷口（模擬）', allergens: ['peanut'] }) }),
      assignment('as-2', { claim_id: 'c-2' }),
      assignment('as-3', { needs_meal: false }),
    ])
    d.listMyClaims.mockResolvedValue([
      claim('c-1', 'as-1', { food: food({ name: '素食便當', point_name: '仁愛食物點', point_address: '仁愛路示範廣場（模擬）' }) }),
      claim('c-2', 'as-2', { status: 'delivering' }),
    ])
  }

  it('我的任務：三種狀態的晶片與主按鈕，取餐地點與送達地點', async () => {
    threeTasks()
    const TaskPage = (await import('@/features/meal-relay/ui/TaskPage.vue')).default
    await render(TaskPage, '/f/meal-relay/volunteer/tasks')
    expect(document.querySelector('h1')?.textContent).toBe('我的任務')
    expect(document.body.textContent).toContain('還有 3 件需要你')
    expect(chipsOf('as-1')).toEqual(['送餐+關懷', '待取餐'])
    expect(chipsOf('as-2')).toEqual(['送餐+關懷', '配送中'])
    expect(chipsOf('as-3')).toEqual(['純關懷'])
    expect(mainOf('as-1').textContent?.trim()).toBe('確認已取餐')
    expect(mainOf('as-2').textContent?.trim()).toBe('回報拜訪')
    expect(mainOf('as-3').textContent?.trim()).toBe('回報拜訪')
    const first = card('as-1').textContent ?? ''
    expect(first).toContain('取餐地點：仁愛食物點')
    expect(first).toContain('仁愛路示範廣場（模擬）')
    expect(first).toContain('送達地點')
    expect(first).toContain('和平路示範巷口（模擬）')
    expect(first).toContain('過敏原：花生')
    expect(document.body.textContent).toContain('只顯示派給你的進行中任務')
    expect(d.listElders).not.toHaveBeenCalled()
  })

  it('任務卡群組一次只展開一張，第一張預設展開', async () => {
    threeTasks()
    const TaskPage = (await import('@/features/meal-relay/ui/TaskPage.vue')).default
    await render(TaskPage, '/f/meal-relay/volunteer/tasks')
    expect(expanded()).toEqual(['true', 'false', 'false'])
    card('as-2').querySelector<HTMLButtonElement>(':scope > button')!.click()
    await flush()
    expect(expanded()).toEqual(['false', 'true', 'false'])
    // 「查看位置」收合時不建立地圖；展開後才有
    expect(card('as-2').querySelector('[data-map]')).toBeNull()
    const location = [...card('as-2').querySelectorAll<HTMLButtonElement>('button[aria-expanded]')].find((b) => b.textContent?.includes('查看位置'))!
    location.click()
    await flush()
    expect(card('as-2').querySelector('[data-map]')).not.toBeNull()
    expect(expanded()).toEqual(['false', 'true', 'false'])
  })

  it('「取消這份餐」先開確認視窗（danger），按確認才取消，卡片變純關懷', async () => {
    threeTasks()
    d.cancelClaim.mockResolvedValue(claim('c-1', 'as-1', { status: 'cancelled' }))
    const TaskPage = (await import('@/features/meal-relay/ui/TaskPage.vue')).default
    await render(TaskPage, '/f/meal-relay/volunteer/tasks')
    const cancelLink = [...card('as-1').querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.trim() === '取消這份餐')!
    cancelLink.click()
    await flush()
    const dialog = document.querySelector('[role="alertdialog"]')!
    expect(dialog.textContent).toContain('取消這份餐？')
    expect(d.cancelClaim).not.toHaveBeenCalled()
    const confirm = dialog.querySelector<HTMLButtonElement>('button[data-danger="true"]')!
    confirm.click()
    await flush()
    expect(d.cancelClaim).toHaveBeenCalledWith('c-1')
    expect(chipsOf('as-1')).toEqual(['純關懷'])
    expect(mainOf('as-1').textContent?.trim()).toBe('回報拜訪')
  })

  it('確認已取餐 → 配送中，主按鈕換成回報拜訪', async () => {
    threeTasks()
    d.pickupClaim.mockResolvedValue(claim('c-1', 'as-1', { status: 'delivering' }))
    const TaskPage = (await import('@/features/meal-relay/ui/TaskPage.vue')).default
    await render(TaskPage, '/f/meal-relay/volunteer/tasks')
    mainOf('as-1').click()
    await flush()
    expect(d.pickupClaim).toHaveBeenCalledWith('c-1')
    expect(chipsOf('as-1')).toEqual(['送餐+關懷', '配送中'])
    expect(mainOf('as-1').textContent?.trim()).toBe('回報拜訪')
  })

  it('回報面板：三個選項，生鮮時放門口停用並說明（V11）', async () => {
    d.listMyAssignments.mockResolvedValue([assignment('as-1', { claim_id: 'c-1' })])
    d.listMyClaims.mockResolvedValue([claim('c-1', 'as-1', { status: 'delivering', food: food({ category: 'produce', name: '高麗菜' }) })])
    const TaskPage = (await import('@/features/meal-relay/ui/TaskPage.vue')).default
    await render(TaskPage, '/f/meal-relay/volunteer/tasks')
    mainOf('as-1').click()
    await flush()
    const sheet = document.querySelector('[role="dialog"]')!
    expect(sheet.textContent).toContain('回報：長者e-as-1')
    expect(sheet.textContent).toContain('高麗菜・1 份')
    expect([...sheet.querySelectorAll('[data-option]')].map((o) => o.getAttribute('data-option'))).toEqual(['seen', 'left_at_door', 'returned'])
    const door = sheet.querySelector('[data-option="left_at_door"]')!
    expect(door.querySelector('input')!.disabled).toBe(true)
    expect(door.textContent).toContain('生鮮蔬果不能放門口')
    expect(sheet.textContent).toContain('放門口需要拍照；生鮮蔬果不適用')
    const close = sheet.querySelector<HTMLButtonElement>('button')
    expect(close?.textContent?.trim()).toBe('關閉')
    expect(sheet.querySelector('h2')?.textContent?.trim()).toBe('回報：長者e-as-1')
    close!.click()
    await flush()
    expect(document.querySelector('[role="dialog"]')).toBeNull()
    expect(d.reportVisit).not.toHaveBeenCalled()
  })

  it('最後一張回報後顯示完成畫面，「回到志工首頁」→ volunteer', async () => {
    d.listMyAssignments.mockResolvedValueOnce([assignment('as-3', { needs_meal: false })]).mockResolvedValue([])
    d.reportVisit.mockResolvedValue({} as never)
    const TaskPage = (await import('@/features/meal-relay/ui/TaskPage.vue')).default
    const { router } = await render(TaskPage, '/f/meal-relay/volunteer/tasks')
    mainOf('as-3').click()
    await flush()
    const seen = document.querySelector<HTMLInputElement>('[data-option="seen"] input')!
    seen.click()
    await flush()
    document.querySelector('[role="dialog"] form')!.dispatchEvent(new Event('submit', { cancelable: true }))
    await flush()
    await new Promise((r) => setTimeout(r, 400)) // 清單淡出（out-in）後才換成完成畫面
    await flush()
    expect(d.reportVisit).toHaveBeenCalledWith(expect.objectContaining({ assignment_id: 'as-3', kind: 'care', result: 'seen' }))
    expect(document.body.textContent).toContain('今天的任務都完成了')
    expect(document.querySelector('[data-done-count]')?.textContent).toBe('1')
    expect(document.body.textContent).toContain('長者資料已從此頁移除')
    expect(document.body.textContent).not.toContain('長者e-as-3')
    buttonByText('回到志工首頁')!.click()
    await flush()
    await new Promise((r) => setTimeout(r, 0))
    expect(router.currentRoute.value.name).toBe('meal-relay.volunteer')
  })

  it('志工首頁：問候用 Me.name、已報到、N 件待完成、StepIndicator 目前步驟', async () => {
    d.getMe.mockResolvedValue({ id: 'u-vol-1', role: 'volunteer', name: '阿明', station_id: 'st-1', supplier: null })
    d.listStations.mockResolvedValue([station as never])
    d.listMyAssignments.mockResolvedValue([
      assignment('as-1', { claim_id: 'c-1', claim: claim('c-1', 'as-1'), assigned_at: '2026-11-08T11:20:00+08:00' }),
      assignment('as-2', { needs_meal: false, assigned_at: '2026-11-08T11:20:00+08:00' }),
    ])
    const VolunteerPage = (await import('@/features/meal-relay/ui/VolunteerPage.vue')).default
    await render(VolunteerPage, '/f/meal-relay/volunteer')
    const text = document.body.textContent ?? ''
    expect(document.querySelector('h1')?.textContent).toBe('今天的服務')
    expect(text).toContain('阿明，辛苦了！')
    expect(text).toContain('已報到')
    expect(text).toContain('大安關懷據點')
    expect(text).toContain('今天 11:20 報到')
    expect(text.replace(/\s+/g, '')).toContain('2件待完成')
    expect(buttonByText('重新掃碼報到')).toBeTruthy()
    expect(text).toContain('重複報到不會重複派送')
    expect(document.querySelector('[aria-current="step"]')?.textContent?.trim()).toBe('取餐')
    expect(text).not.toContain('長者e-as-1')
  })

  it('志工首頁還沒報到：還沒報到、掃描據點 QR 報到、目前步驟是報到', async () => {
    const VolunteerPage = (await import('@/features/meal-relay/ui/VolunteerPage.vue')).default
    await render(VolunteerPage, '/f/meal-relay/volunteer')
    expect(document.body.textContent).toContain('還沒報到')
    expect(buttonByText('掃描據點 QR 報到')).toBeTruthy()
    expect(document.querySelector('[aria-current="step"]')?.textContent?.trim()).toBe('報到')
  })
})
