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

// 畫面測試（T-138）：Leaflet 在 happy-dom 跑不起來，MapView 換成一顆按鈕，按了就回傳一個位置（有 on-pick 時）
vi.mock('@/features/meal-relay/ui/MapView.vue', async () => {
  const { defineComponent, h } = await import('vue')
  return {
    default: defineComponent({
      props: { markers: Array, center: Object, onPick: Function, picked: Object },
      setup(props) {
        return () =>
          h('button', { type: 'button', 'data-test': 'map', onClick: () => props.onPick?.({ lat: 25.0412, lng: 121.5078 }) }, `地圖 ${props.markers?.length ?? 0}`)
      },
    }),
  }
})

import { createApp, h, nextTick } from 'vue'
import { createMemoryHistory, createRouter, RouterView, type Router } from 'vue-router'
import * as data from '@/features/meal-relay/data'
import {
  ADDRESS_MAX,
  ADMIN_TABS,
  ADMIN_TAB_VALUES,
  REVIEW_SETTLE_MS,
  STAT_FIELDS,
  accessOf,
  adminTabs,
  boardDateText,
  boardLegend,
  draftOfElder,
  elderStatusOf,
  elderSummary,
  emptyElderDraft,
  boardMarkers,
  foodFlowText,
  fromLocalInput,
  pointStatusOf,
  sourcesOf,
  supplierPlaceText,
  toElderCreate,
  toElderUpdate,
  toLocalInput,
  useAdmin,
  validateElderDraft,
} from '@/features/meal-relay/logic/admin'
import AdminPage from '@/features/meal-relay/ui/AdminPage.vue'

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
    address: '',
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
    const errors = validateElderDraft({ alias: '', location: null, allergens: [], station_id: '', next_care_at: '', next_meal_at: '', address: '' })
    expect(Object.keys(errors).sort()).toEqual(['alias', 'location', 'station_id'])
    const phone = validateElderDraft({ alias: '0912-345-678', location: { lat: 25, lng: 121 }, allergens: [], station_id: 'st-1', next_care_at: '', next_meal_at: '', address: '' })
    expect(phone.alias).toContain('電話')
  })

  it('填好 → createElder 收到合約欄位（時間 +08:00），名冊多一位、表單清空', async () => {
    api.createElder.mockImplementation(async (body) => elder('e-new', { ...body, allergens: body.allergens ?? [], next_care_at: body.next_care_at ?? null, next_meal_at: body.next_meal_at ?? null }))
    const admin = useAdmin()
    await admin.init()
    admin.draft.value = {
      alias: ' 測試-A02 ',
      address: ' 臺北市萬華區西園路一段 999 號（模擬） ',
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
      address: '臺北市萬華區西園路一段 999 號（模擬）',
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
    admin.draft.value = { alias: '測試-A03', location: { lat: 25, lng: 121 }, allergens: [], station_id: 'st-1', next_care_at: '', next_meal_at: '', address: '' }
    expect(await admin.saveElder()).toBe(false)
    expect(admin.elders.value).toHaveLength(1)
    expect(admin.saving.value).toBe(false)
  })

  it('toElderCreate 只送合約欄位', () => {
    const body = toElderCreate({ alias: 'A', location: { lat: 1, lng: 2 }, allergens: [], station_id: 'st-1', next_care_at: '', next_meal_at: '', address: '' })
    expect(Object.keys(body).sort()).toEqual(['address', 'alias', 'allergens', 'location', 'next_care_at', 'next_meal_at', 'station_id'])
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
    const draft = { alias: original.alias, location: { ...original.location }, allergens: ['milk', 'egg'] as Elder['allergens'], station_id: 'st-1', next_care_at: '', next_meal_at: '', address: '' }
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

    admin.draft.value = { alias: '測試-C01', location: { lat: 25, lng: 121 }, allergens: [], station_id: 'st-1', next_care_at: '', next_meal_at: '', address: '' }
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

/* ---------------------------------------------------------------- T-125 長者地址（只能是模擬資料，ADR-027） */

describe('長者地址（ElderDraft.address）', () => {
  const addr = '臺北市萬華區西園路一段 999 號（模擬）'

  it('空白表單的地址是空字串；修改時帶入長者的地址（舊資料沒有欄位也不會壞）', () => {
    expect(emptyElderDraft().address).toBe('')
    expect(draftOfElder(elder('e-1', { address: addr })).address).toBe(addr)
    const legacy = elder('e-2')
    delete (legacy as Partial<Elder>).address
    expect(draftOfElder(legacy).address).toBe('')
  })

  it('地址選填；超過 120 字擋下，剛好 120 字可以', () => {
    const base = { ...emptyElderDraft(), alias: '測試-D01', location: { lat: 25, lng: 121 }, station_id: 'st-1' }
    expect(ADDRESS_MAX).toBe(120)
    expect(validateElderDraft(base)).toEqual({})
    expect(validateElderDraft({ ...base, address: '臺'.repeat(120) })).toEqual({})
    expect(validateElderDraft({ ...base, address: '臺'.repeat(121) }).address).toBe('地址最多 120 個字')
    expect(validateElderDraft({ ...base, address: `  ${'臺'.repeat(120)}  ` })).toEqual({})
  })

  it('toElderCreate 送出去前會去掉前後空白；沒填送空字串', () => {
    const base = { ...emptyElderDraft(), alias: 'A', location: { lat: 1, lng: 2 }, station_id: 'st-1' }
    expect(toElderCreate({ ...base, address: `  ${addr} ` }).address).toBe(addr)
    expect(toElderCreate(base).address).toBe('')
  })

  it('toElderUpdate：只有地址改了才送；清空送空字串；只差空白不算改', () => {
    const original = elder('e-1', { address: addr })
    const draft = draftOfElder(original)
    expect(toElderUpdate(draft, original)).toEqual({})
    expect(toElderUpdate({ ...draft, address: ` ${addr}  ` }, original)).toEqual({})
    expect(toElderUpdate({ ...draft, address: '臺北市萬華區康定路 0 號（模擬）' }, original)).toEqual({ address: '臺北市萬華區康定路 0 號（模擬）' })
    expect(toElderUpdate({ ...draft, address: '' }, original)).toEqual({ address: '' })
  })

  it('修改地址 → updateElder 只收到 address', async () => {
    api.updateElder.mockImplementation(async (id, body) => elder(id, { address: body.address ?? '' }))
    const admin = useAdmin()
    await admin.init()
    admin.startEdit(admin.elders.value[0])
    admin.draft.value = { ...admin.draft.value, address: addr }
    expect(await admin.saveElder()).toBe(true)
    expect(api.updateElder).toHaveBeenCalledWith('e-1', { address: addr })
    expect(admin.elders.value[0].address).toBe(addr)
  })

  it('名冊的一列：有地址顯示地址，沒有顯示「未填地址」', () => {
    const stations = [station('st-1')]
    expect(elderSummary(elder('e-1', { address: addr }), stations).addressText).toBe(addr)
    expect(elderSummary(elder('e-2'), stations).addressText).toBe('未填地址')
  })
})

/* ---------------------------------------------------------------- T-138 設計 v2：邏輯 */

describe('設計 v2：分頁、統計卡、名冊狀態、圖例（T-138）', () => {
  it('分頁順序是 待審核｜服務看板｜長者名冊；?tab= 預設（第一個值）是服務看板', () => {
    expect(ADMIN_TABS.map((t) => [t.value, t.label])).toEqual([
      ['review', '待審核'],
      ['board', '服務看板'],
      ['elders', '長者名冊'],
      ['stations', '據點管理'],
    ])
    expect(ADMIN_TAB_VALUES[0]).toBe('board')
    expect([...ADMIN_TAB_VALUES].sort()).toEqual(['board', 'elders', 'review', 'stations'])
    expect(useAdmin().tab.value).toBe('board')
  })

  it('adminTabs：只有「待審核」帶徽章，數字 = pending 申請數', () => {
    expect(adminTabs(2).map((t) => t.badge)).toEqual([2, undefined, undefined, undefined])
    expect(adminTabs(0)[0].badge).toBe(0) // 0 時 SegmentedTabs 不顯示徽章
  })

  it('STAT_FIELDS：5 張統計卡的順序、名稱、圖示；「需關懷長者」用 stats.alerts', () => {
    expect(STAT_FIELDS.map((f) => [f.key, f.label])).toEqual([
      ['foods_open', '可派送食物'],
      ['delivered_today', '今日送達'],
      ['seen_today', '今日見到'],
      ['alerts', '需關懷長者'],
      ['checkins_today', '今日報到'],
    ])
    expect(STAT_FIELDS.every((f) => f.icon)).toBe(true)
    expect(STAT_FIELDS.find((f) => f.key === 'alerts')?.tone).toBe('alert')
  })

  it('elderStatusOf：需要送餐 > 需要關懷 > 近期已見到', () => {
    expect(elderStatusOf({ meal_due: true, care_due: true })).toBe('meal_due')
    expect(elderStatusOf({ meal_due: false, care_due: true })).toBe('care_due')
    expect(elderStatusOf({ meal_due: false, care_due: false })).toBe('seen')
  })

  it('boardLegend：一定有據點、食物點、長者（依這個順序），保留 T-126 的狀態色', () => {
    expect(boardLegend([]).map((i) => [i.kind, i.label])).toEqual([
      ['station', '據點'],
      ['point', '食物點'],
      ['elder', '長者'],
    ])
    const markers = boardMarkers(board({ foods: [food('f-1', 'p-1', { unclaimed: true })], elders: [elder('e-1'), elder('e-2', { alert: false })] }))
    expect(boardLegend(markers).map((i) => [i.kind, i.color, i.label])).toEqual([
      ['station', 'station', '據點'],
      ['point', 'warn', '食物點（還沒被派出）'],
      ['elder', 'warn', '長者（需要處理）'],
      ['elder', 'primary', '長者'],
    ])
  })

  it('supplierPlaceText：有地址用地址，沒有就顯示座標', () => {
    expect(supplierPlaceText({ address: ' 臺北市大安區仁愛路四段 999 號（模擬） ', location: { lat: 25.04, lng: 121.51 } })).toBe('臺北市大安區仁愛路四段 999 號（模擬）')
    expect(supplierPlaceText({ address: '', location: { lat: 25.04, lng: 121.51 } })).toBe('25.0400, 121.5100')
  })

  it('foodFlowText 與 boardDateText（台北時間）', () => {
    expect(foodFlowText({ remaining: 2, dispatched_qty: 4, delivered_qty: 3 })).toBe('剩餘 2｜已派送 4｜已送達 3')
    expect(boardDateText(Date.parse('2026-11-07T17:00:00Z'))).toBe('2026 / 11 / 08') // UTC 17 點 = 台北隔天 1 點
  })
})

describe('重置示範資料要先確認（T-138）', () => {
  it('askReset 只打開確認視窗、不呼叫 resetDemo；取消也不呼叫', async () => {
    const admin = useAdmin()
    await admin.init()
    admin.askReset()
    expect(admin.confirmingReset.value).toBe(true)
    expect(api.resetDemo).not.toHaveBeenCalled()
    admin.cancelReset()
    expect(admin.confirmingReset.value).toBe(false)
    expect(api.resetDemo).not.toHaveBeenCalled()
  })

  it('confirmReset 才呼叫 resetDemo，重新載入、version + 1（E3 淡入）', async () => {
    api.resetDemo.mockResolvedValue({ imported: 42 })
    const admin = useAdmin()
    await admin.init()
    admin.askReset()
    expect(await admin.confirmReset()).toBe(true)
    expect(api.resetDemo).toHaveBeenCalledTimes(1)
    expect(admin.confirmingReset.value).toBe(false)
    expect(admin.resetting.value).toBe(false)
    expect(admin.version.value).toBe(1)
  })

  it('重置失敗 → 回傳 false、version 不變', async () => {
    api.resetDemo.mockRejectedValue(new data.MealApiError('FORBIDDEN_ROLE', '這個角色不能使用這個功能', 403))
    const admin = useAdmin()
    await admin.init()
    expect(await admin.confirmReset()).toBe(false)
    expect(admin.version.value).toBe(0)
  })

  it('離線時按重置不會打開確認視窗', async () => {
    api.listElders.mockResolvedValue(stale([elder('e-1')]))
    const admin = useAdmin()
    await admin.init()
    admin.askReset()
    expect(admin.confirmingReset.value).toBe(false)
  })
})

describe('長者表單：新增、修改、底部面板開關（T-138）', () => {
  it('startNew → 空白表單並打開；startEdit → 帶入這位長者；儲存成功關閉', async () => {
    api.updateElder.mockImplementation(async (id, body) => elder(id, { ...body }) as Elder)
    const admin = useAdmin()
    await admin.init()
    admin.startEdit(admin.elders.value[0])
    expect(admin.formOpen.value).toBe(true)
    expect(admin.editing.value?.id).toBe('e-1')
    admin.startNew()
    expect(admin.editing.value).toBeNull()
    expect(admin.draft.value).toEqual(emptyElderDraft())
    expect(admin.formOpen.value).toBe(true)

    admin.startEdit(admin.elders.value[0])
    admin.draft.value.next_meal_at = '2026-11-07T08:00'
    expect(await admin.saveElder()).toBe(true)
    expect(api.updateElder).toHaveBeenCalledWith('e-1', { next_meal_at: '2026-11-07T08:00:00+08:00' })
    expect(admin.formOpen.value).toBe(false)
  })

  it('稱呼（alias）必填，錯誤訊息用「稱呼」', () => {
    expect(validateElderDraft({ ...emptyElderDraft(), location: { lat: 25, lng: 121 }, station_id: 'st-1' }).alias).toBe('請填稱呼')
  })
})

/* ---------------------------------------------------------------- T-138 設計 v2：畫面（掛上 AdminPage） */

const cleanups: (() => void)[] = []
const realMatchMedia = window.matchMedia

afterEach(() => {
  while (cleanups.length) cleanups.pop()!()
  document.body.innerHTML = ''
  window.matchMedia = realMatchMedia
})

/** 假的視窗寬度：wide = true 是 ≥ 1024px */
function setWide(wide: boolean) {
  window.matchMedia = ((query: string) =>
    ({ matches: wide, media: query, addEventListener() {}, removeEventListener() {} }) as unknown as MediaQueryList) as typeof window.matchMedia
}

/** 等讀取、Transition（mode="out-in"）與 nextTick 都跑完 */
async function settle() {
  for (let i = 0; i < 6; i++) {
    await new Promise((r) => setTimeout(r, 5))
    await nextTick()
  }
}

async function mountAdmin(url = '/admin?as=u-admin-1'): Promise<{ el: HTMLElement; router: Router }> {
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/admin', component: AdminPage }] })
  await router.push(url)
  const el = document.createElement('div')
  document.body.appendChild(el)
  const app = createApp({ render: () => h(RouterView) })
  app.use(router)
  app.mount(el)
  cleanups.push(() => app.unmount())
  await router.isReady()
  await settle()
  return { el, router }
}

const text = (el: Element) => el.textContent?.replace(/\s+/g, ' ').trim() ?? ''
const buttons = (root: ParentNode = document.body) => [...root.querySelectorAll('button')]
const buttonByText = (label: string, root: ParentNode = document.body) => buttons(root).find((b) => text(b) === label)
const tabEl = (label: string) => [...document.querySelectorAll('[role="tab"]')].find((t) => text(t).startsWith(label)) as HTMLElement
const dialog = () => document.querySelector('[role="alertdialog"]')

function fieldByLabel(label: string): HTMLInputElement | HTMLSelectElement {
  const l = [...document.querySelectorAll('label')].find((x) => text(x) === label)
  if (!l) throw new Error(`找不到欄位：${label}`)
  return document.getElementById(l.htmlFor) as HTMLInputElement | HTMLSelectElement
}

function type(el: HTMLInputElement | HTMLSelectElement, value: string) {
  el.value = value
  el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? 'change' : 'input'))
}

describe('AdminPage 畫面（T-138）', () => {
  beforeEach(() => setWide(true))

  it('?tab= 同步：預設服務看板；點分頁寫回網址並保留 ?as=；改網址換分頁', async () => {
    const { router } = await mountAdmin()
    expect(tabEl('服務看板').getAttribute('aria-selected')).toBe('true')
    expect(document.body.textContent).toContain('今天的服務概況')
    expect(document.body.textContent).toContain('位置示意・模擬資料')

    tabEl('長者名冊').click()
    await settle()
    expect(router.currentRoute.value.query).toMatchObject({ tab: 'elders', as: 'u-admin-1' })
    expect(document.body.textContent).toContain('僅使用模擬資料')

    await router.push({ query: { ...router.currentRoute.value.query, tab: 'review' } })
    await settle()
    expect(tabEl('待審核').getAttribute('aria-selected')).toBe('true')
    expect(document.body.textContent).toContain('待審核 2 件')

    router.back()
    await settle()
    expect(tabEl('長者名冊').getAttribute('aria-selected')).toBe('true')
  })

  it('不認得的 ?tab= → 服務看板', async () => {
    await mountAdmin('/admin?as=u-admin-1&tab=bogus')
    expect(tabEl('服務看板').getAttribute('aria-selected')).toBe('true')
  })

  it('「待審核」分頁的徽章 = pending 申請數；沒有待審核就不顯示', async () => {
    await mountAdmin()
    expect(tabEl('待審核').querySelector('[aria-label="2 件"]')?.textContent?.trim()).toBe('2')
    cleanups.pop()!()
    document.body.innerHTML = ''

    api.listSuppliers.mockResolvedValue([])
    await mountAdmin()
    expect(tabEl('待審核').querySelector('[aria-label]')).toBeNull()
  })

  it('服務看板：5 張統計卡的名稱與 stats 數字（需關懷長者 = alerts）', async () => {
    api.getBoard.mockResolvedValue(board({ stats: { foods_open: 6, delivered_today: 8, seen_today: 7, alerts: 4, checkins_today: 3 } }))
    await mountAdmin()
    const body = text(document.body)
    for (const label of ['可派送食物', '今日送達', '今日見到', '需關懷長者', '今日報到']) expect(body).toContain(label)
    expect(body).toContain('食物去向')
    expect(body).toContain('剩餘 3｜已派送 0｜已送達 0')
  })

  it('重置示範資料要先確認：按了只開確認視窗；取消不重置；確認才 resetDemo', async () => {
    api.resetDemo.mockResolvedValue({ imported: 42 })
    await mountAdmin()
    buttonByText('重置示範資料')!.click()
    await settle()
    expect(dialog()).not.toBeNull()
    expect(api.resetDemo).not.toHaveBeenCalled()

    buttonByText('取消', dialog()!)!.click()
    await settle()
    expect(dialog()).toBeNull()
    expect(api.resetDemo).not.toHaveBeenCalled()

    buttonByText('重置示範資料')!.click()
    await settle()
    const confirm = buttonByText('重置', dialog()!)!
    expect(confirm.dataset.danger).toBe('true')
    confirm.click()
    await settle()
    expect(api.resetDemo).toHaveBeenCalledTimes(1)
    expect(api.getBoard).toHaveBeenCalledTimes(2)
  })

  it('待審核表格：單位名稱、類型（中文）、位置（地址，沒有就座標）；「不通過」先確認才送出', async () => {
    api.listSuppliers.mockResolvedValue([
      supplier('s-1', { address: '臺北市大安區仁愛路四段 999 號（模擬）', image_url: null }),
      supplier('s-2', { org_type: 'school', address: '', image_url: null }),
    ])
    api.reviewSupplier.mockResolvedValue(supplier('s-2', { status: 'rejected' }))
    await mountAdmin('/admin?as=u-admin-1&tab=review')
    const headers = [...document.querySelectorAll('th')].map(text)
    expect(headers).toEqual(['單位名稱', '類型', '位置', '操作'])
    const rows = [...document.querySelectorAll('tbody tr')].map(text)
    expect(rows[0]).toContain('店家')
    expect(rows[0]).toContain('臺北市大安區仁愛路四段 999 號（模擬）')
    expect(rows[1]).toContain('學校')
    expect(rows[1]).toContain('25.0400, 121.5100')

    document.querySelector<HTMLButtonElement>('button[aria-label="不通過 測試單位s-2"]')!.click()
    await settle()
    expect(dialog()).not.toBeNull()
    expect(api.reviewSupplier).not.toHaveBeenCalled()
    buttonByText('不通過', dialog()!)!.click()
    await settle()
    expect(api.reviewSupplier).toHaveBeenCalledWith('s-2', 'reject')
  })

  it('長者表單：代號是長者 id、唯讀；改稱呼 →「儲存變更」只送改過的欄位', async () => {
    api.listElders.mockResolvedValue([elder('e-1', { alias: '測試阿公' })])
    api.updateElder.mockImplementation(async (id, body) => elder(id, { ...body }) as Elder)
    await mountAdmin('/admin?as=u-admin-1&tab=elders')

    expect((fieldByLabel('代號') as HTMLInputElement).value).toBe('儲存後自動產生')
    buttons().find((b) => text(b).includes('測試阿公'))!.click()
    await settle()
    const id = fieldByLabel('代號') as HTMLInputElement
    expect(id.value).toBe('e-1')
    expect(id.readOnly).toBe(true)
    expect((fieldByLabel('稱呼（必填）') as HTMLInputElement).value).toBe('測試阿公')
    expect(text(document.body)).toContain('需要送餐')

    type(fieldByLabel('稱呼（必填）'), '測試阿嬤')
    await nextTick()
    buttonByText('儲存變更')!.click()
    await settle()
    expect(api.updateElder).toHaveBeenCalledWith('e-1', { alias: '測試阿嬤' })
  })

  it('長者表單：「新增長者」開空白表單，填好稱呼、據點、位置 → createElder', async () => {
    api.createElder.mockImplementation(async (body) => elder('e-new', { ...body, allergens: body.allergens ?? [], next_care_at: null, next_meal_at: null }))
    await mountAdmin('/admin?as=u-admin-1&tab=elders')
    buttons().find((b) => text(b).includes('測試-e-1'))!.click()
    await settle()
    buttonByText('新增長者')!.click()
    await settle()
    expect((fieldByLabel('代號') as HTMLInputElement).value).toBe('儲存後自動產生')
    expect((fieldByLabel('稱呼（必填）') as HTMLInputElement).value).toBe('')

    buttonByText('儲存變更')!.click()
    await settle()
    expect(api.createElder).not.toHaveBeenCalled()
    expect(text(document.body)).toContain('請填稱呼')

    type(fieldByLabel('稱呼（必填）'), '測試阿伯')
    type(fieldByLabel('所屬據點（必填）'), 'st-2')
    const maps = [...document.querySelectorAll<HTMLButtonElement>('[data-test="map"]')]
    maps[maps.length - 1].click() // 表單「更多設定」裡的位置
    await nextTick()
    buttonByText('儲存變更')!.click()
    await settle()
    expect(api.createElder).toHaveBeenCalledTimes(1)
    expect(api.createElder.mock.calls[0][0]).toMatchObject({ alias: '測試阿伯', station_id: 'st-2', location: { lat: 25.0412, lng: 121.5078 } })
  })

  it('手機寬度（< 1024px）：表單不在頁面上，點一位長者改用底部面板', async () => {
    setWide(false)
    await mountAdmin('/admin?as=u-admin-1&tab=elders')
    expect(document.querySelector('label')).toBeNull() // 名冊頁上沒有表單
    buttons().find((b) => text(b).includes('測試-e-1'))!.click()
    await settle()
    const sheet = document.querySelector('[role="dialog"]')
    expect(sheet?.getAttribute('aria-label')).toBe('修改長者：測試-e-1')
    expect((fieldByLabel('代號') as HTMLInputElement).value).toBe('e-1')
  })

  it('非 admin 被擋：顯示沒有權限，沒有分頁與重置，不讀審核、看板、名冊', async () => {
    api.getMe.mockResolvedValue(me('volunteer'))
    await mountAdmin('/admin?as=u-vol-1&tab=elders')
    expect(text(document.body)).toContain('沒有權限')
    expect(document.querySelector('[role="tab"]')).toBeNull()
    expect(buttonByText('重置示範資料')).toBeUndefined()
    expect(api.listSuppliers).not.toHaveBeenCalled()
    expect(api.getBoard).not.toHaveBeenCalled()
    expect(api.listElders).not.toHaveBeenCalled()
  })

  it('斷網：重置與審核按鈕停用、顯示離線提示', async () => {
    api.listElders.mockResolvedValue(stale([elder('e-1')]))
    await mountAdmin('/admin?as=u-admin-1&tab=review')
    expect(buttonByText('重置示範資料')!.disabled).toBe(true)
    expect(text(document.body)).toContain('目前離線，暫時不能審核')
    expect(document.querySelector<HTMLButtonElement>('button[aria-label="通過 測試單位s-1"]')!.disabled).toBe(true)
  })

  it('後端錯誤顯示中文訊息', async () => {
    api.getBoard.mockRejectedValue(new data.MealApiError('INTERNAL', '伺服器忙碌中，請稍後再試', 500))
    await mountAdmin()
    expect(document.querySelector('[role="alert"]')?.textContent).toContain('伺服器忙碌中，請稍後再試')
  })
})
