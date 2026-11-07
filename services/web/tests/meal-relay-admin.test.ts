import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Board, Elder, Food, Me, Point, Role, Station, Supplier } from '@/features/meal-relay/data'

// 管理系統 MR-P08 的邏輯層（T-120，logic/admin.ts）。資料層全部 mock，只用假資料（ADR-024）。
vi.mock('@/features/meal-relay/data', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/meal-relay/data')>()
  return {
    ...actual, // 型別與 MealApiError 用真的
    currentAccountId: vi.fn(async () => 'u-admin-demo'),
    getMe: vi.fn(),
    listSuppliers: vi.fn(),
    reviewSupplier: vi.fn(),
    getBoard: vi.fn(),
    listElders: vi.fn(),
    listStations: vi.fn(),
    createElder: vi.fn(),
    updateElder: vi.fn(),
    resetDemo: vi.fn(),
  }
})

import * as data from '@/features/meal-relay/data'
import {
  REVIEW_SETTLE_MS,
  accessOf,
  boardMarkers,
  fromLocalInput,
  pointStatusOf,
  sourcesOf,
  toElderCreate,
  toElderUpdate,
  toLocalInput,
  useAdmin,
  validateElderDraft,
} from '@/features/meal-relay/logic/admin'

const api = vi.mocked(data)

/* ---------------------------------------------------------------- 假資料 */

const station = (id: string, source = '模擬'): Station => ({ id, name: `測試據點${id}`, location: { lat: 25.03, lng: 121.5 }, source })

function me(role: Role): Me {
  return { id: `u-${role}`, role, name: `測試${role}`, station_id: null, supplier: null }
}

function supplier(id: string, extra: Partial<Supplier> = {}): Supplier {
  return {
    id,
    account_id: `u-${id}`,
    name: `測試單位${id}`,
    org_type: 'shop',
    location: { lat: 25.04, lng: 121.51 },
    status: 'pending',
    created_at: '2026-11-07T09:00:00+08:00',
    reviewed_at: null,
    ...extra,
  }
}

function elder(id: string, extra: Partial<Elder> = {}): Elder {
  return {
    id,
    alias: `測試-${id}`,
    account_id: null,
    station_id: 'st-1',
    allergens: [],
    created_by: 'u-admin-demo',
    created_at: '2026-11-01T09:00:00+08:00',
    last_seen_at: null,
    last_meal_at: null,
    next_care_at: null,
    next_meal_at: null,
    primary_volunteer_id: null,
    merged_into: null,
    location: { lat: 25.035, lng: 121.505 },
    care_due: true,
    meal_due: true,
    alert: true,
    days_since_seen: null,
    days_since_meal: null,
    pending_request: false,
    ...extra,
  }
}

function food(id: string, point_id: string, extra: Partial<Food> = {}): Food {
  return {
    id,
    point_id,
    supplier_id: 's-1',
    name: `測試便當${id}`,
    category: 'meal_box',
    allergens: [],
    qty: 3,
    expires_at: '2026-11-07T20:00:00+08:00',
    image_id: null,
    source_note: '',
    closed: false,
    created_at: '2026-11-07T10:00:00+08:00',
    location: { lat: 25.04, lng: 121.52 },
    point_name: '測試食物點',
    supplier_name: '測試單位',
    remaining: 3,
    dispatched_qty: 0,
    delivered_qty: 0,
    status: 'open',
    unclaimed: false,
    image_url: null,
    ...extra,
  }
}

const point = (id: string, source = '模擬'): Point => ({
  id,
  name: `測試食物點${id}`,
  kind: 'custom',
  location: { lat: 25.04, lng: 121.52 },
  source,
  created_by: null,
  open_food_count: 0,
})

function board(extra: Partial<Board> = {}): Board {
  return {
    stations: [station('st-1')],
    points: [point('p-1')],
    foods: [food('f-1', 'p-1')],
    elders: [elder('e-1')],
    claims: [],
    stats: { foods_open: 1, delivered_today: 0, seen_today: 0, alerts: 1, checkins_today: 0 },
    ...extra,
  }
}

/** Cached<T[]>：斷網時資料層會在陣列上標 stale_at */
const stale = <T extends object>(value: T, at = '2026-11-07T10:00:00+08:00') => Object.assign(value, { stale_at: at })

function mockAdminData() {
  api.getMe.mockResolvedValue(me('admin'))
  api.listSuppliers.mockResolvedValue([supplier('s-1'), supplier('s-2')])
  api.getBoard.mockResolvedValue(board())
  api.listElders.mockResolvedValue([elder('e-1')])
  api.listStations.mockResolvedValue([station('st-1'), station('st-2')])
}

beforeEach(() => {
  vi.clearAllMocks()
  mockAdminData()
})

afterEach(() => {
  vi.useRealTimers()
})

/* ---------------------------------------------------------------- 1. 身分 */

describe('身分檢查（§2：不是 admin 就沒有權限）', () => {
  it('accessOf 只有 admin 能進', () => {
    expect(accessOf(me('admin'))).toBe('admin')
    for (const role of ['citizen', 'volunteer', 'supplier', 'station'] as const) expect(accessOf(me(role))).toBe('denied')
    expect(accessOf(null)).toBe('denied')
  })

  it.each(['citizen', 'volunteer', 'supplier', 'station'] as const)('%s → 沒有權限，不讀審核、看板、名冊', async (role) => {
    api.getMe.mockResolvedValue(me(role))
    const admin = useAdmin()
    await admin.init()
    expect(admin.access.value).toBe('denied')
    expect(api.listSuppliers).not.toHaveBeenCalled()
    expect(api.getBoard).not.toHaveBeenCalled()
    expect(api.listElders).not.toHaveBeenCalled()
  })

  it('沒匯入的帳號（後端視為一般市民）→ 沒有權限', async () => {
    api.getMe.mockResolvedValue({ ...me('citizen'), id: 'u-not-imported', name: '' })
    const admin = useAdmin()
    await admin.init()
    expect(admin.access.value).toBe('denied')
    expect(api.getBoard).not.toHaveBeenCalled()
  })

  it('admin → 讀取待審核（pending）、看板、名冊與據點', async () => {
    const admin = useAdmin()
    await admin.init()
    expect(admin.access.value).toBe('admin')
    expect(admin.accountId.value).toBe('u-admin-demo')
    expect(api.listSuppliers).toHaveBeenCalledWith('pending')
    expect(admin.pending.value.map((s) => s.id)).toEqual(['s-1', 's-2'])
    expect(admin.board.value?.stats.alerts).toBe(1)
    expect(admin.elders.value).toHaveLength(1)
    expect(admin.stations.value).toHaveLength(2)
  })

  it('getMe 失敗 → error，顯示後端的中文訊息', async () => {
    api.getMe.mockRejectedValue(new data.MealApiError('OFFLINE', '連不上伺服器', 0))
    const admin = useAdmin()
    await admin.init()
    expect(admin.access.value).toBe('error')
    expect(admin.accessError.value).toBe('連不上伺服器')
  })

  it('讀取時後端回 FORBIDDEN_ROLE → 改成沒有權限，錯誤用 §7 的中文訊息', async () => {
    api.listElders.mockRejectedValue(new data.MealApiError('FORBIDDEN_ROLE', '這個角色不能使用這個功能', 403))
    const admin = useAdmin()
    await admin.init()
    expect(admin.access.value).toBe('denied')
    expect(admin.errors.elders).toBe('這個角色不能使用這個功能')
  })
})

/* ---------------------------------------------------------------- 2. 建立長者 */

describe('建立長者（station_id 必填，ADR-024、ADR-026）', () => {
  it('沒選據點 → formErrors.station_id，不呼叫 createElder', async () => {
    const admin = useAdmin()
    await admin.init()
    admin.draft.value = { ...admin.draft.value, alias: '測試-A01', location: { lat: 25.03, lng: 121.5 } }
    expect(await admin.saveElder()).toBe(false)
    expect(admin.formErrors.value.station_id).toBe('請選據點')
    expect(api.createElder).not.toHaveBeenCalled()
  })

  it('代號、位置也必填；代號像電話號碼就擋下', () => {
    const errors = validateElderDraft({ alias: '', location: null, allergens: [], station_id: '', next_care_at: '', next_meal_at: '' })
    expect(Object.keys(errors).sort()).toEqual(['alias', 'location', 'station_id'])
    const phone = validateElderDraft({ alias: '0912-345-678', location: { lat: 25, lng: 121 }, allergens: [], station_id: 'st-1', next_care_at: '', next_meal_at: '' })
    expect(phone.alias).toContain('電話')
  })

  it('填好 → createElder 收到合約欄位（時間 +08:00），名冊多一位、表單清空', async () => {
    api.createElder.mockImplementation(async (body) => elder('e-new', { ...body, allergens: body.allergens ?? [], next_care_at: body.next_care_at ?? null, next_meal_at: body.next_meal_at ?? null }))
    const admin = useAdmin()
    await admin.init()
    admin.draft.value = {
      alias: ' 測試-A02 ',
      location: { lat: 25.0412, lng: 121.5078 },
      allergens: ['peanut', 'milk'],
      station_id: 'st-2',
      next_care_at: '2026-11-08T14:30',
      next_meal_at: '',
    }
    expect(await admin.saveElder()).toBe(true)
    expect(api.createElder).toHaveBeenCalledTimes(1)
    expect(api.createElder).toHaveBeenCalledWith({
      alias: '測試-A02',
      location: { lat: 25.0412, lng: 121.5078 },
      allergens: ['peanut', 'milk'],
      station_id: 'st-2',
      next_care_at: '2026-11-08T14:30:00+08:00',
      next_meal_at: null,
    })
    expect(admin.elders.value.map((e) => e.id)).toEqual(['e-1', 'e-new'])
    expect(admin.draft.value.alias).toBe('')
    expect(admin.formErrors.value).toEqual({})
  })

  it('後端錯誤 → 回傳 false、名冊不變', async () => {
    api.createElder.mockRejectedValue(new data.MealApiError('VALIDATION_ERROR', '欄位格式錯誤', 422))
    const admin = useAdmin()
    await admin.init()
    admin.draft.value = { alias: '測試-A03', location: { lat: 25, lng: 121 }, allergens: [], station_id: 'st-1', next_care_at: '', next_meal_at: '' }
    expect(await admin.saveElder()).toBe(false)
    expect(admin.elders.value).toHaveLength(1)
    expect(admin.saving.value).toBe(false)
  })

  it('toElderCreate 只送合約欄位', () => {
    const body = toElderCreate({ alias: 'A', location: { lat: 1, lng: 2 }, allergens: [], station_id: 'st-1', next_care_at: '', next_meal_at: '' })
    expect(Object.keys(body).sort()).toEqual(['alias', 'allergens', 'location', 'next_care_at', 'next_meal_at', 'station_id'])
  })
})

/* ---------------------------------------------------------------- 3. 審核 */

describe('審核提供者（listSuppliers pending ＋ reviewSupplier）', () => {
  it('通過 → reviewSupplier(id, approve)、剛審核多一筆、等動畫結束才從待審核移除', async () => {
    vi.useFakeTimers()
    api.reviewSupplier.mockResolvedValue(supplier('s-1', { status: 'approved', reviewed_at: '2026-11-07T11:00:00+08:00' }))
    const admin = useAdmin()
    await admin.init()

    const updated = await admin.review('s-1', 'approved')
    expect(api.reviewSupplier).toHaveBeenCalledWith('s-1', 'approve')
    expect(updated.status).toBe('approved')
    expect(admin.reviewed.value.map((s) => [s.id, s.status])).toEqual([['s-1', 'approved']])
    expect(admin.pending.value.map((s) => s.id)).toEqual(['s-1', 's-2']) // MR-C19 的晶片還在播

    await vi.advanceTimersByTimeAsync(REVIEW_SETTLE_MS)
    expect(admin.pending.value.map((s) => s.id)).toEqual(['s-2'])
  })

  it('不通過 → reviewSupplier(id, reject)', async () => {
    vi.useFakeTimers()
    api.reviewSupplier.mockResolvedValue(supplier('s-2', { status: 'rejected' }))
    const admin = useAdmin()
    await admin.init()
    await admin.review('s-2', 'rejected')
    expect(api.reviewSupplier).toHaveBeenCalledWith('s-2', 'reject')
    await vi.advanceTimersByTimeAsync(REVIEW_SETTLE_MS)
    expect(admin.pending.value.map((s) => s.id)).toEqual(['s-1'])
  })

  it('失敗 → 丟出錯誤（ReviewList 按鈕恢復），清單不變', async () => {
    vi.useFakeTimers()
    api.reviewSupplier.mockRejectedValue(new data.MealApiError('INVALID_STATE', '這筆申請已審核過', 409))
    const admin = useAdmin()
    await admin.init()
    await expect(admin.review('s-1', 'approved')).rejects.toThrow('這筆申請已審核過')
    await vi.advanceTimersByTimeAsync(REVIEW_SETTLE_MS)
    expect(admin.pending.value).toHaveLength(2)
    expect(admin.reviewed.value).toHaveLength(0)
  })
})

/* ---------------------------------------------------------------- 4. 修改、重置、離線 */

describe('修改長者、重置、離線', () => {
  it('修改只送改過的欄位；清空下次時間送 null', async () => {
    const original = elder('e-1', { alias: '測試-B01', allergens: ['egg'], next_care_at: '2026-11-08T14:30:00+08:00' })
    api.listElders.mockResolvedValue([original])
    api.updateElder.mockImplementation(async (id, body) => ({ ...original, ...body, id, next_care_at: null }) as Elder)
    const admin = useAdmin()
    await admin.init()

    admin.startEdit(original)
    expect(admin.draft.value.next_care_at).toBe('2026-11-08T14:30')
    admin.draft.value.allergens = ['egg', 'fish']
    admin.draft.value.next_care_at = ''
    expect(await admin.saveElder()).toBe(true)
    expect(api.updateElder).toHaveBeenCalledWith('e-1', { allergens: ['egg', 'fish'], next_care_at: null })
    expect(admin.editing.value).toBeNull()
    expect(admin.elders.value[0].allergens).toEqual(['egg', 'fish'])
  })

  it('toElderUpdate：沒改任何欄位回傳空物件；過敏原只換順序不算改', () => {
    const original = elder('e-1', { allergens: ['egg', 'milk'] })
    const draft = { alias: original.alias, location: { ...original.location }, allergens: ['milk', 'egg'] as Elder['allergens'], station_id: 'st-1', next_care_at: '', next_meal_at: '' }
    expect(toElderUpdate(draft, original)).toEqual({})
    expect(toElderUpdate({ ...draft, station_id: 'st-2', alias: '新代號' }, original)).toEqual({ alias: '新代號', station_id: 'st-2' })
  })

  it('修改時什麼都沒改 → 不呼叫 updateElder，表單回到登記模式', async () => {
    const admin = useAdmin()
    await admin.init()
    admin.startEdit(admin.elders.value[0])
    expect(await admin.saveElder()).toBe(true)
    expect(api.updateElder).not.toHaveBeenCalled()
    expect(admin.editing.value).toBeNull()
  })

  it('重置 → resetDemo 後重新載入、version + 1', async () => {
    api.resetDemo.mockResolvedValue({ imported: 42 })
    const admin = useAdmin()
    await admin.init()
    api.listSuppliers.mockResolvedValue([supplier('s-9')])
    await admin.reset()
    expect(api.resetDemo).toHaveBeenCalledTimes(1)
    expect(api.listSuppliers).toHaveBeenCalledTimes(2)
    expect(api.getBoard).toHaveBeenCalledTimes(2)
    expect(admin.pending.value.map((s) => s.id)).toEqual(['s-9'])
    expect(admin.version.value).toBe(1)
  })

  it('離線（讀到 stale_at）→ offline，寫入都不送出', async () => {
    vi.useFakeTimers()
    api.listElders.mockResolvedValue(stale([elder('e-1')]))
    const admin = useAdmin()
    await admin.init()
    expect(admin.offline.value).toBe(true)
    expect(admin.staleAt.value).toBe('2026-11-07T10:00:00+08:00')

    admin.draft.value = { alias: '測試-C01', location: { lat: 25, lng: 121 }, allergens: [], station_id: 'st-1', next_care_at: '', next_meal_at: '' }
    expect(await admin.saveElder()).toBe(false)
    expect(api.createElder).not.toHaveBeenCalled()

    await expect(admin.review('s-1', 'approved')).rejects.toThrow('離線')
    expect(api.reviewSupplier).not.toHaveBeenCalled()

    await expect(admin.reset()).rejects.toThrow('離線')
    expect(api.resetDemo).not.toHaveBeenCalled()
  })

  it('重新讀取成功後 stale_at 清掉，恢復可寫入', async () => {
    api.listElders.mockResolvedValueOnce(stale([elder('e-1')]))
    const admin = useAdmin()
    await admin.init()
    expect(admin.offline.value).toBe(true)
    await admin.loadElders()
    expect(admin.offline.value).toBe(false)
  })
})

/* ---------------------------------------------------------------- 5. 純函數 */

describe('看板地圖、SourceNote、時間', () => {
  it('pointStatusOf：還沒被派出 > 可派送 > 已全數派出 > 已過期／已下架；沒有食物 → undefined', () => {
    const p = { id: 'p-1' }
    expect(pointStatusOf(p, [])).toBeUndefined()
    expect(pointStatusOf(p, [food('f-1', 'p-2')])).toBeUndefined()
    expect(pointStatusOf(p, [food('f-1', 'p-1', { status: 'claimed' }), food('f-2', 'p-1', { unclaimed: true })])).toBe('unclaimed')
    expect(pointStatusOf(p, [food('f-1', 'p-1', { status: 'claimed' }), food('f-2', 'p-1')])).toBe('open')
    expect(pointStatusOf(p, [food('f-1', 'p-1', { status: 'claimed' }), food('f-2', 'p-1', { status: 'expired' })])).toBe('claimed')
    expect(pointStatusOf(p, [food('f-1', 'p-1', { status: 'closed' }), food('f-2', 'p-1', { status: 'expired' })])).toBe('expired')
    expect(pointStatusOf(p, [food('f-1', 'p-1', { status: 'closed' })])).toBe('closed')
  })

  it('boardMarkers：據點、食物點、長者都有，長者依 alert 標紅綠', () => {
    const markers = boardMarkers(board({ elders: [elder('e-1'), elder('e-2', { alert: false })] }))
    expect(markers.map((m) => [m.id, m.kind, m.status])).toEqual([
      ['station:st-1', 'station', undefined],
      ['point:p-1', 'point', 'open'],
      ['elder:e-1', 'elder', 'alert'],
      ['elder:e-2', 'elder', 'ok'],
    ])
  })

  it('sourcesOf：以「、」拆開、去掉空白與重複', () => {
    expect(sourcesOf([{ source: '臺北市社區照顧關懷據點、模擬' }, { source: ' 模擬 ' }, { source: '' }])).toBe('臺北市社區照顧關懷據點、模擬')
  })

  it('toLocalInput／fromLocalInput：台北時間（+08:00）來回一致', () => {
    expect(toLocalInput('2026-11-08T06:30:00Z')).toBe('2026-11-08T14:30')
    expect(toLocalInput('2026-11-08T14:30:00+08:00')).toBe('2026-11-08T14:30')
    expect(toLocalInput(null)).toBe('')
    expect(toLocalInput('不是時間')).toBe('')
    expect(fromLocalInput('2026-11-08T14:30')).toBe('2026-11-08T14:30:00+08:00')
    expect(fromLocalInput('  ')).toBeNull()
    expect(fromLocalInput('2026/11/08')).toBeNull()
  })
})
