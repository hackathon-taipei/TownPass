import { beforeEach, describe, expect, it, vi } from 'vitest'

// 提供者頁 MR-P06 的邏輯（T-117）：資料層全部 mock，不連網路。
// 合約 docs/system/11-meal-relay.md v2.2：M1、M5、M14、V4、V21、ADR-024。

vi.mock('@/features/meal-relay/data', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/meal-relay/data')>()
  return {
    MealApiError: actual.MealApiError,
    imageSrc: actual.imageSrc,
    getMe: vi.fn(),
    getMySupplier: vi.fn(),
    applySupplier: vi.fn(),
    listPoints: vi.fn(),
    createPoint: vi.fn(),
    listFoods: vi.fn(),
    createFood: vi.fn(),
    updateFood: vi.fn(),
    uploadImage: vi.fn(),
  }
})

import * as data from '@/features/meal-relay/data'
import type { Food, Me, Point, Supplier } from '@/features/meal-relay/data'
import {
  buildFoodCreate,
  buildFoodUpdate,
  buildSupplierApply,
  editErrorOf,
  editQtyMin,
  expiresError,
  inventoryTotals,
  pointSourceText,
  qtyFloorOf,
  sortInventory,
  toTaipeiIso,
  toTaipeiLocal,
  useSupplierPage,
  NOT_APPROVED_TEXT,
  emptyFoodForm,
} from '@/features/meal-relay/logic/supplier'

const m = vi.mocked(data)
const NOW = Date.parse('2026-11-07T10:00:00+08:00')
const HOUR = 3600_000

const supplierOf = (status: Supplier['status']): Supplier => ({
  id: 's-1',
  account_id: 'u-sup-1',
  name: '萬華好味便當（模擬）',
  org_type: 'shop',
  location: { lat: 25.0354, lng: 121.5013 },
  status,
  created_at: '2026-11-07T08:00:00+08:00',
  reviewed_at: status === 'pending' ? null : '2026-11-07T09:00:00+08:00',
})
const meOf = (role: Me['role'], supplier: Supplier | null): Me => ({ id: 'u-x', role, name: '測試', station_id: null, supplier })
const point: Point = {
  id: 'p-1',
  name: '社團法人台北市艾馨公益慈善會',
  kind: 'station',
  location: { lat: 25.035429, lng: 121.501369 },
  source: '臺北市銀髮族服務_社區照顧關懷據點、臺北市門牌位置數值資料',
  created_by: null,
  open_food_count: 1,
}
const foodOf = (over: Partial<Food> = {}): Food => ({
  id: 'f-1',
  point_id: 'p-1',
  supplier_id: 's-1',
  name: '雞腿便當',
  category: 'meal_box',
  allergens: [],
  qty: 6,
  expires_at: '2026-11-07T18:00:00+08:00',
  image_id: null,
  source_note: '',
  closed: false,
  created_at: '2026-11-07T09:00:00+08:00',
  location: point.location,
  point_name: point.name,
  supplier_name: '萬華好味便當（模擬）',
  remaining: 3,
  dispatched_qty: 2,
  delivered_qty: 1,
  status: 'open',
  unclaimed: false,
  image_url: null,
  ...over,
})

/** 以某個身分載入頁面 */
async function pageAs(me: Me, foods: Food[] = [foodOf()]) {
  m.getMe.mockResolvedValue(me)
  m.getMySupplier.mockResolvedValue(me.supplier)
  m.listPoints.mockResolvedValue([point])
  m.listFoods.mockResolvedValue(foods)
  const page = useSupplierPage()
  await page.load()
  page.now.value = NOW
  return page
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
})

describe('份數下限（M1、M14）', () => {
  it('下限是派出中＋已送達', () => {
    expect(qtyFloorOf({ dispatched_qty: 2, delivered_qty: 1 })).toBe(3)
    expect(editQtyMin({ dispatched_qty: 2, delivered_qty: 1 })).toBe(3)
  })
  it('還沒派出時輸入框下限是 1（改成 0 份請用下架）', () => {
    expect(qtyFloorOf({ dispatched_qty: 0, delivered_qty: 0 })).toBe(0)
    expect(editQtyMin({ dispatched_qty: 0, delivered_qty: 0 })).toBe(1)
  })
  it('改得比下限少：送出前就擋下，顯示 kit 的提示，不呼叫 API', () => {
    const r = buildFoodUpdate(foodOf(), { qty: 2, expires_local: toTaipeiLocal(foodOf().expires_at) }, NOW)
    expect(r).toEqual({ ok: false, errors: { qty: '不能少於已派出＋已送達的 3 份' } })
  })
  it('等於下限可以送出，只送有改的欄位', () => {
    const r = buildFoodUpdate(foodOf(), { qty: 3, expires_local: toTaipeiLocal(foodOf().expires_at) }, NOW)
    expect(r).toEqual({ ok: true, body: { qty: 3 } })
  })
})

describe('最晚食用時間（+08:00）', () => {
  it('datetime-local ↔ 含 +08:00 的 ISO', () => {
    expect(toTaipeiIso('2026-11-07T18:30')).toBe('2026-11-07T18:30:00+08:00')
    expect(toTaipeiLocal('2026-11-07T18:30:00+08:00')).toBe('2026-11-07T18:30')
    expect(toTaipeiLocal('2026-11-07T10:30:00Z')).toBe('2026-11-07T18:30')
    expect(toTaipeiIso('明天')).toBeNull()
  })
  it('不能早於現在（M14）', () => {
    expect(expiresError('2026-11-07T09:59', NOW)).toBe('最晚食用時間不能早於現在')
    expect(expiresError('2026-11-07T10:01', NOW)).toBe('')
    const r = buildFoodUpdate(foodOf(), { qty: 6, expires_local: '2026-11-07T09:00' }, NOW)
    expect(r).toEqual({ ok: false, errors: { expires_at: '最晚食用時間不能早於現在' } })
  })
})

describe('QTY_BELOW_USED 的訊息（V21）', () => {
  it('editErrorOf 把後端訊息標在份數欄', () => {
    const e = new data.MealApiError('QTY_BELOW_USED', '份數不能小於已派出加已送達的份數', 409)
    expect(editErrorOf(e)).toEqual({ field: 'qty', message: '份數不能小於已派出加已送達的份數' })
  })

  it('後端回 QTY_BELOW_USED：顯示後端訊息、重新讀取庫存，下限跟著更新', async () => {
    const page = await pageAs(meOf('supplier', supplierOf('approved')))
    page.openSheet('f-1', 'edit')
    page.editForm.qty = 3 // 畫面上的下限是 3，但這段時間又派出 1 份
    m.updateFood.mockRejectedValue(new data.MealApiError('QTY_BELOW_USED', '份數不能小於已派出加已送達的份數', 409))
    m.listFoods.mockResolvedValue([foodOf({ remaining: 2, dispatched_qty: 3 })])

    expect(await page.saveEdit()).toBe(false)
    expect(m.updateFood).toHaveBeenCalledWith('f-1', { qty: 3 })
    expect(page.editError.value).toEqual({ field: 'qty', message: '份數不能小於已派出加已送達的份數' })
    expect(page.sheetOpen.value).toBe(true) // 面板不關，讓提供者改
    expect(page.editingFood.value?.dispatched_qty).toBe(3)
    expect(editQtyMin(page.editingFood.value!)).toBe(4)
  })

  it('修改成功：更新那一批、關閉面板', async () => {
    const page = await pageAs(meOf('supplier', supplierOf('approved')))
    page.openSheet('f-1', 'edit')
    page.editForm.qty = 8
    page.editForm.expires_local = '2026-11-07T20:00'
    m.updateFood.mockResolvedValue(foodOf({ qty: 8, remaining: 5, expires_at: '2026-11-07T20:00:00+08:00' }))
    expect(await page.saveEdit()).toBe(true)
    expect(m.updateFood).toHaveBeenCalledWith('f-1', { qty: 8, expires_at: '2026-11-07T20:00:00+08:00' })
    expect(page.foods.value[0]!.remaining).toBe(5)
    expect(page.sheetOpen.value).toBe(false)
  })
})

describe('審核中不能上架（V4）', () => {
  it('審核中的一般市民：不讀食物點與庫存，上架與新增食物點都不送出', async () => {
    const page = await pageAs(meOf('citizen', supplierOf('pending')))
    expect(page.view.value).toBe('gate')
    expect(page.canPublish.value).toBe(false)
    expect(m.listPoints).not.toHaveBeenCalled() // citizen 呼叫會 FORBIDDEN_ROLE
    expect(m.listFoods).not.toHaveBeenCalled()

    expect(await page.publish()).toBe(false)
    expect(page.foodError.value).toBe(NOT_APPROVED_TEXT)
    expect(await page.addPoint()).toBe(false)
    expect(page.pointError.value).toBe(NOT_APPROVED_TEXT)
    expect(m.createFood).not.toHaveBeenCalled()
    expect(m.createPoint).not.toHaveBeenCalled()
  })

  it('後端回 SUPPLIER_NOT_APPROVED：顯示後端訊息並重新讀取狀態', async () => {
    const page = await pageAs(meOf('supplier', supplierOf('approved')))
    Object.assign(page.foodForm, { point_id: 'p-1', name: '麵包', category: 'bakery', qty: 2 })
    m.createFood.mockRejectedValue(new data.MealApiError('SUPPLIER_NOT_APPROVED', '提供者未通過審核', 403))
    expect(await page.publish()).toBe(false)
    expect(page.foodError.value).toBe('提供者未通過審核')
    expect(m.getMe).toHaveBeenCalledTimes(2)
  })

  it('審核中輪詢到「已通過」→ 重新讀取，變成提供者頁', async () => {
    const page = await pageAs(meOf('citizen', supplierOf('pending')))
    m.getMySupplier.mockResolvedValue(supplierOf('approved'))
    m.getMe.mockResolvedValue(meOf('supplier', supplierOf('approved')))
    await page.refresh()
    expect(page.canPublish.value).toBe(true)
    expect(m.listFoods).toHaveBeenCalledWith({ mine: true })
  })
})

describe('上架送出的資料', () => {
  it('buildFoodCreate：只送合約欄位，名稱去空白，時間含 +08:00', () => {
    const form = { ...emptyFoodForm(NOW, 'p-1'), name: '  雞腿便當 ', category: 'meal_box' as const, allergens: ['egg' as const], qty: 5 }
    const r = buildFoodCreate(form, NOW)
    expect(r).toEqual({
      ok: true,
      body: { point_id: 'p-1', name: '雞腿便當', category: 'meal_box', allergens: ['egg'], qty: 5, expires_at: '2026-11-07T13:00:00+08:00' },
    })
  })

  it('必填沒填：不能送出', () => {
    const r = buildFoodCreate(emptyFoodForm(NOW), NOW)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(Object.keys(r.errors).sort()).toEqual(['category', 'name', 'point_id'])
  })

  it('publish：先上傳圖片（data URL），再用 image_id 上架；成功後放在庫存最上面', async () => {
    const page = await pageAs(meOf('supplier', supplierOf('approved')))
    page.selectPoint('p-1')
    Object.assign(page.foodForm, { name: '饅頭', category: 'bakery', qty: 10, expires_local: '2026-11-07T20:00' })
    page.setImage({ data: 'AAAA', mime: 'image/jpeg' })
    m.uploadImage.mockResolvedValue({ id: 'img-1', image_url: '/meal-relay/images/img-1', mime: 'image/jpeg', size: 3 })
    m.createFood.mockResolvedValue(foodOf({ id: 'f-9', name: '饅頭', qty: 10, remaining: 10, dispatched_qty: 0, delivered_qty: 0, created_at: '2026-11-07T10:00:00+08:00' }))

    expect(await page.publish()).toBe(true)
    expect(m.uploadImage).toHaveBeenCalledWith('data:image/jpeg;base64,AAAA')
    expect(m.createFood).toHaveBeenCalledWith({
      point_id: 'p-1',
      name: '饅頭',
      category: 'bakery',
      allergens: [],
      qty: 10,
      expires_at: '2026-11-07T20:00:00+08:00',
      image_id: 'img-1',
    })
    expect(page.inventory.value[0]!.id).toBe('f-9')
    expect(page.tab.value).toBe('inventory')
    expect(page.foodForm.name).toBe('') // 表單清空，食物點保留
    expect(page.foodForm.point_id).toBe('p-1')
  })

  it('圖片上傳失敗（IMAGE_TOO_LARGE）：顯示後端訊息、不上架', async () => {
    const page = await pageAs(meOf('supplier', supplierOf('approved')))
    Object.assign(page.foodForm, { point_id: 'p-1', name: '饅頭', category: 'bakery', qty: 1 })
    page.setImage({ data: 'AAAA', mime: 'image/jpeg' })
    m.uploadImage.mockRejectedValue(new data.MealApiError('IMAGE_TOO_LARGE', '圖片大小超過上限 200000 bytes', 413))
    expect(await page.publish()).toBe(false)
    expect(page.foodError.value).toBe('圖片大小超過上限 200000 bytes')
    expect(m.createFood).not.toHaveBeenCalled()
  })
})

describe('申請與審核狀態', () => {
  it('還沒申請的一般市民：送出 applySupplier，變成審核中', async () => {
    const page = await pageAs(meOf('citizen', null))
    expect(page.supplier.value).toBeNull()
    Object.assign(page.applyForm, { name: ' 萬華好味便當 ', org_type: 'shop', location: { lat: 25.03, lng: 121.5 } })
    m.applySupplier.mockResolvedValue(supplierOf('pending'))
    expect(await page.apply()).toBe(true)
    expect(m.applySupplier).toHaveBeenCalledWith({ name: '萬華好味便當', org_type: 'shop', location: { lat: 25.03, lng: 121.5 } })
    expect(page.supplier.value?.status).toBe('pending')
  })

  it('ALREADY_APPLIED：顯示後端訊息', async () => {
    const page = await pageAs(meOf('citizen', null))
    Object.assign(page.applyForm, { name: '店', org_type: 'shop', location: { lat: 25, lng: 121.5 } })
    m.applySupplier.mockRejectedValue(new data.MealApiError('ALREADY_APPLIED', '已申請過提供者', 409))
    expect(await page.apply()).toBe(false)
    expect(page.applyError.value).toBe('已申請過提供者')
  })

  it('申請表必填', () => {
    expect(buildSupplierApply({ name: '', org_type: null, location: null })).toEqual({
      ok: false,
      errors: { name: '請輸入單位名稱', org_type: '請選擇類型', location: '請在地圖上選位置' },
    })
  })

  it('志工等其他角色：不呼叫 getMySupplier，顯示「這裡是提供者用的頁面」', async () => {
    m.getMe.mockResolvedValue(meOf('volunteer', null))
    const page = useSupplierPage()
    await page.load()
    expect(page.view.value).toBe('other_role')
    expect(m.getMySupplier).not.toHaveBeenCalled()
  })
})

describe('我的庫存與下架', () => {
  it('還能派送的在前、新的在前；總數照 M1、還沒被派出照 M5', () => {
    const a = foodOf({ id: 'a', created_at: '2026-11-07T08:00:00+08:00', unclaimed: true })
    const b = foodOf({ id: 'b', created_at: '2026-11-07T09:30:00+08:00' })
    const c = foodOf({ id: 'c', status: 'closed', closed: true, created_at: '2026-11-07T09:50:00+08:00' })
    expect(sortInventory([a, c, b]).map((f) => f.id)).toEqual(['b', 'a', 'c'])
    expect(inventoryTotals([a, b, c])).toEqual({ remaining: 6, dispatched: 6, delivered: 3, unclaimed: 1 })
  })

  it('下架：確認後送 { closed: true }', async () => {
    const page = await pageAs(meOf('supplier', supplierOf('approved')))
    page.openSheet('f-1', 'close')
    expect(page.sheetMode.value).toBe('close')
    m.updateFood.mockResolvedValue(foodOf({ closed: true, status: 'closed' }))
    expect(await page.confirmClose()).toBe(true)
    expect(m.updateFood).toHaveBeenCalledWith('f-1', { closed: true })
    expect(page.foods.value[0]!.status).toBe('closed')
  })

  it('食物點的開放資料來源（SourceNote）去重、去掉自訂點', () => {
    expect(pointSourceText([point, { source: 'custom' }, { source: '臺北市門牌位置數值資料' }])).toBe(
      '臺北市銀髮族服務_社區照顧關懷據點、臺北市門牌位置數值資料（政府資料開放授權條款 1.0）',
    )
  })
})

describe('斷網（ADR-024）', () => {
  it('讀到裝置上的舊資料：offline、寫入不送出', async () => {
    const stale = '2026-11-07T09:55:00+08:00'
    const page = await pageAs(meOf('supplier', supplierOf('approved')), Object.assign([foodOf()], { stale_at: stale }))
    expect(page.staleAt.value).toBe(stale)
    expect(page.offline.value).toBe(true)
    page.openSheet('f-1', 'close')
    expect(await page.confirmClose()).toBe(false)
    expect(m.updateFood).not.toHaveBeenCalled()
  })

  it('帳號是舊資料時，連線恢復後輪詢整個重讀、解除離線', async () => {
    const stale = '2026-11-07T09:55:00+08:00'
    const me = meOf('supplier', supplierOf('approved'))
    m.getMe.mockResolvedValue({ ...me, stale_at: stale })
    m.getMySupplier.mockResolvedValue({ ...supplierOf('approved'), stale_at: stale })
    m.listPoints.mockResolvedValue([point])
    m.listFoods.mockResolvedValue([foodOf()])
    const page = useSupplierPage()
    await page.load()
    expect(page.offline.value).toBe(true)

    m.getMe.mockResolvedValue(me)
    m.getMySupplier.mockResolvedValue(supplierOf('approved'))
    await page.refresh()
    expect(m.getMe).toHaveBeenCalledTimes(2)
    expect(page.staleAt.value).toBeNull()
    expect(page.offline.value).toBe(false)
  })

  it('連不上又沒有舊資料：顯示讀取失敗', async () => {
    m.getMe.mockRejectedValue(new data.MealApiError('OFFLINE', '目前連不上伺服器，請稍後再試', 0))
    const page = useSupplierPage()
    await page.load()
    expect(page.view.value).toBe('error')
    expect(page.loadError.value).toBe('目前連不上伺服器，請稍後再試')
  })
})
