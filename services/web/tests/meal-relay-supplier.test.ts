import { createApp, defineComponent, h, nextTick, reactive, ref } from 'vue'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// 提供者頁 MR-P06 的邏輯（T-117）與設計 v2 畫面（T-136）：資料層全部 mock，不連網路。
// 合約 docs/system/11-meal-relay.md v2.5：M1、M5、M14、V4、V21、ADR-024、ADR-030。

// 地圖（Leaflet）在測試環境不畫，換成空的元件
vi.mock('@/features/meal-relay/ui/MapView.vue', async () => {
  const { defineComponent: dc, h: hh } = await import('vue')
  return { default: dc({ name: 'MapViewStub', props: ['markers', 'center', 'onPick', 'picked'], setup: () => () => hh('div', { 'data-map': '' }) }) }
})

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
  REJECTED_TEXT,
  emptyFoodForm,
  emptyApplyForm,
  emptyPointForm,
  buildPointCreate,
  supplierStageOf,
  splitInventory,
  isFoodEnded,
  hasWaitingFood,
  inventoryChipOf,
  expiresText,
  publishStepOf,
  isMoreCategory,
  CATEGORY_MAIN,
  CATEGORY_MORE,
  ORG_TYPE_ORDER,
  SUPPLIER_TABS,
  defaultPointId,
  withoutAllergen,
  type SupplierTab,
} from '@/features/meal-relay/logic/supplier'
import { toasts } from '@/features/meal-relay/logic/toast'
import CategoryPicker from '@/features/meal-relay/ui/CategoryPicker.vue'
import FoodEditSheet from '@/features/meal-relay/ui/FoodEditSheet.vue'
import SupplierPage from '@/features/meal-relay/ui/SupplierPage.vue'

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

/* ================================================================ 設計 v2（T-136） */

describe('設計 v2 的邏輯（T-136）', () => {
  it('四種申請狀態對應四個畫面', () => {
    expect(supplierStageOf(null)).toBe('apply')
    expect(supplierStageOf(supplierOf('pending'))).toBe('pending')
    expect(supplierStageOf(supplierOf('rejected'))).toBe('rejected')
    expect(supplierStageOf(supplierOf('approved'))).toBe('approved')
  })

  it('分頁只有 inventory、publish，預設 inventory', () => {
    expect(SUPPLIER_TABS).toEqual(['inventory', 'publish'])
  })

  it('進行中與已結束：過期、下架、全部送達的算已結束；還有派出中的算進行中', () => {
    const open = foodOf({ id: 'open' })
    const dispatching = foodOf({ id: 'dispatching', status: 'claimed', remaining: 0, dispatched_qty: 2, delivered_qty: 4 })
    const allDone = foodOf({ id: 'done', status: 'claimed', remaining: 0, dispatched_qty: 0, delivered_qty: 6 })
    const closed = foodOf({ id: 'closed', status: 'closed', closed: true })
    const expired = foodOf({ id: 'expired', status: 'expired' })
    expect([open, dispatching, allDone, closed, expired].map(isFoodEnded)).toEqual([false, false, true, true, true])
    const { active, ended } = splitInventory([open, allDone, dispatching, closed, expired])
    expect(active.map((f) => f.id)).toEqual(['open', 'dispatching'])
    expect(ended.map((f) => f.id)).toEqual(['done', 'closed', 'expired'])
  })

  it('等待派送提醒：只有 open 而且還有剩餘時才出現', () => {
    expect(hasWaitingFood([foodOf()])).toBe(true)
    expect(hasWaitingFood([foodOf({ status: 'claimed', remaining: 0 }), foodOf({ status: 'expired' })])).toBe(false)
  })

  it('庫存列的晶片照 T-126 三色', () => {
    expect(inventoryChipOf(foodOf())).toBeNull()
    expect(inventoryChipOf(foodOf({ unclaimed: true }))).toEqual({ text: '還沒被派出', tone: 'warn' })
    expect(inventoryChipOf(foodOf({ status: 'claimed', remaining: 0 }))).toEqual({ text: '已全數派出', tone: 'grey' })
    expect(inventoryChipOf(foodOf({ status: 'claimed', remaining: 0, dispatched_qty: 0 }))).toEqual({ text: '全部送達', tone: 'grey' })
    expect(inventoryChipOf(foodOf({ status: 'closed' }))?.text).toBe('已下架')
    expect(inventoryChipOf(foodOf({ status: 'expired' }))?.text).toBe('已過期')
  })

  it('「最晚 HH:MM 食用」：同一天只寫時間，其他天加月／日（台北時間）', () => {
    expect(expiresText('2026-11-07T18:00:00+08:00', NOW)).toBe('最晚 18:00 食用')
    expect(expiresText('2026-11-08T09:30:00+08:00', NOW)).toBe('最晚 11/8 09:30 食用')
    expect(expiresText('2026-11-07T16:30:00Z', NOW)).toBe('最晚 11/8 00:30 食用')
  })

  it('上架步驟：還沒拍照 → 拍照；拍了或略過、必填沒填 → 填寫資訊；都填好 → 上架', () => {
    const form = emptyFoodForm(NOW, 'p-1')
    expect(publishStepOf(form, NOW, false)).toBe(0)
    expect(publishStepOf({ ...form, image_preview: 'data:image/jpeg;base64,AAAA' }, NOW, false)).toBe(1)
    expect(publishStepOf(form, NOW, true)).toBe(1)
    expect(publishStepOf({ ...form, name: '饅頭', category: 'bakery' }, NOW, true)).toBe(2)
    expect(publishStepOf({ ...form, name: '饅頭', category: 'bakery', point_id: null }, NOW, true)).toBe(1)
  })

  it('類別晶片：便當、麵包、蔬果＋「其他」裡的乾貨、飲料、其他，剛好對應合約 §4 的 6 個 FoodCategory', () => {
    expect(CATEGORY_MAIN.map((c) => [c.value, c.label])).toEqual([
      ['meal_box', '便當'],
      ['bakery', '麵包'],
      ['produce', '蔬果'],
    ])
    expect(CATEGORY_MORE.map((c) => [c.value, c.label])).toEqual([
      ['dry_goods', '乾貨'],
      ['drink', '飲料'],
      ['other', '其他'],
    ])
    expect(isMoreCategory('drink')).toBe(true)
    expect(isMoreCategory('meal_box')).toBe(false)
    expect(isMoreCategory(null)).toBe(false)
  })

  it('提供者類型 5 格的順序：店家、學校、機關、個人、其他', () => {
    expect(ORG_TYPE_ORDER).toEqual(['shop', 'school', 'agency', 'person', 'other'])
  })

  it('申請送地址（去空白）；沒填不送；個人提供者不送；超過 120 字擋下', () => {
    const base = { ...emptyApplyForm(), name: '店', org_type: 'shop' as const, location: { lat: 25, lng: 121.5 } }
    expect(buildSupplierApply({ ...base, address: '  臺北市萬華區西園路一段 999 號 ' })).toEqual({
      ok: true,
      body: { name: '店', org_type: 'shop', location: { lat: 25, lng: 121.5 }, address: '臺北市萬華區西園路一段 999 號' },
    })
    expect(buildSupplierApply({ ...base, address: '   ' })).toEqual({ ok: true, body: { name: '店', org_type: 'shop', location: { lat: 25, lng: 121.5 } } })
    expect(buildSupplierApply({ ...base, org_type: 'person', address: '我家' })).toEqual({
      ok: true,
      body: { name: '店', org_type: 'person', location: { lat: 25, lng: 121.5 } },
    })
    expect(buildSupplierApply({ ...base, address: '一'.repeat(121) })).toEqual({ ok: false, errors: { address: '地址最多 120 個字' } })
  })

  it('新增食物點可帶地址（選填）', () => {
    const form = { ...emptyPointForm(), name: '店門口', location: { lat: 25, lng: 121.5 }, address: ' 康定路 229 號 ' }
    expect(buildPointCreate(form)).toEqual({ ok: true, body: { name: '店門口', kind: 'custom', location: { lat: 25, lng: 121.5 }, address: '康定路 229 號' } })
  })

  it('上架預設的食物點：最近一次上架用的、還在清單上的食物點', () => {
    const foods = [foodOf({ point_id: 'p-1', created_at: '2026-11-07T08:00:00+08:00' }), foodOf({ point_id: 'p-gone', created_at: '2026-11-07T09:00:00+08:00' })]
    expect(defaultPointId(foods, [point])).toBe('p-1')
    expect(defaultPointId([], [point])).toBeNull()
  })

  it('過敏原晶片的 × 只移除那一個', () => {
    expect(withoutAllergen(['egg', 'soy', 'milk'], 'soy')).toEqual(['egg', 'milk'])
  })

  it('上架成功：分頁切回我的庫存、新的一批標成剛上架', async () => {
    m.getMe.mockResolvedValue(meOf('supplier', supplierOf('approved')))
    m.getMySupplier.mockResolvedValue(supplierOf('approved'))
    m.listPoints.mockResolvedValue([point])
    m.listFoods.mockResolvedValue([foodOf()])
    const tab = ref<SupplierTab>('publish')
    const page = useSupplierPage({ tab })
    await page.load()
    expect(page.foodForm.point_id).toBe('p-1') // 預設上次用的食物點
    Object.assign(page.foodForm, { name: '饅頭', category: 'bakery', qty: 4 })
    m.createFood.mockResolvedValue(foodOf({ id: 'f-9', name: '饅頭', qty: 4, remaining: 4, dispatched_qty: 0, delivered_qty: 0 }))
    expect(await page.publish()).toBe(true)
    expect(tab.value).toBe('inventory')
    expect(page.freshFoodId.value).toBe('f-9')
    expect(toasts.value.map((t) => t.message)).toContain('已上架「饅頭」4 份')
    page.stop()
  })

  it('下架確認視窗按取消：不送出', async () => {
    const page = await pageAs(meOf('supplier', supplierOf('approved')))
    page.openSheet('f-1', 'close')
    expect(page.closeDialogOpen.value).toBe(true)
    expect(page.sheetOpen.value).toBe(false) // 不是修改面板
    page.cancelClose()
    expect(page.closingFood.value).toBeNull()
    expect(await page.confirmClose()).toBe(false)
    expect(m.updateFood).not.toHaveBeenCalled()
  })
})

/* ---------------------------------------------------------------- 畫面（實際渲染） */

const cleanups: (() => void)[] = []
afterEach(() => {
  while (cleanups.length) cleanups.pop()!()
  document.body.innerHTML = ''
  toasts.value = []
})

const flush = () => new Promise((r) => setTimeout(r, 5)).then(() => nextTick())
async function until(cond: () => boolean, what = '條件') {
  for (let i = 0; i < 80 && !cond(); i++) await flush()
  expect(cond(), what).toBe(true)
}
const byText = (root: ParentNode, selector: string, text: string) =>
  [...root.querySelectorAll<HTMLElement>(selector)].find((e) => e.textContent?.replace(/\s+/g, '').includes(text.replace(/\s+/g, '')))

/** 用某個身分渲染提供者頁（hash router 換成 memory history，路徑與 query 一樣） */
async function renderPage(me: Me, opts: { foods?: Food[]; query?: string } = {}) {
  m.getMe.mockResolvedValue(me)
  m.getMySupplier.mockResolvedValue(me.supplier)
  m.listPoints.mockResolvedValue([point])
  m.listFoods.mockResolvedValue(opts.foods ?? [foodOf()])
  const Stub = defineComponent({ render: () => null })
  const router: Router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/f/meal-relay', name: 'meal-relay.home', component: Stub },
      { path: '/f/meal-relay/supplier', name: 'meal-relay.supplier', component: Stub },
    ],
  })
  await router.push(`/f/meal-relay/supplier${opts.query ?? ''}`)
  const el = document.createElement('div')
  document.body.appendChild(el)
  const app = createApp(SupplierPage).use(router)
  app.mount(el)
  cleanups.push(() => (app.unmount(), el.remove()))
  await until(() => !el.querySelector('[aria-label="載入中"]') && !!el.querySelector('h1') && m.getMe.mock.calls.length > 0, '載入完成')
  await flush()
  return { el, router, text: () => el.textContent?.replace(/\s+/g, '') ?? '' }
}

describe('畫面 MR-P06：四種申請狀態（T-136）', () => {
  it('沒有申請：申請表（標語、5 種類型、單位位置、送出申請、查看審核狀態），沒有分頁', async () => {
    const { el, text } = await renderPage(meOf('citizen', null))
    await until(() => !!el.querySelector('form[aria-label="申請成為提供者"]'), '申請表')
    expect(text()).toContain('讓多出來的一份')
    expect(text()).toContain('審核通過後，就能上架食物')
    expect(text()).toContain('已申請？查看審核狀態')
    expect([...el.querySelectorAll('[role="radio"]')].map((b) => b.getAttribute('data-org-type'))).toEqual(['shop', 'school', 'agency', 'person', 'other'])
    expect(byText(el, 'button', '在地圖上選位置')).toBeTruthy()
    expect(el.querySelector('[role="tablist"]')).toBeNull()
    expect(el.querySelector('h1')!.textContent).toBe('提供食物')
  })

  it('審核中：企鵝、「審核中」、不能上架的提醒（V4）、重新整理；網址是 ?tab=publish 也不顯示上架表單', async () => {
    const { el, text } = await renderPage(meOf('citizen', supplierOf('pending')), { query: '?tab=publish' })
    await until(() => !!el.querySelector('[data-status="pending"]'), '審核中畫面')
    expect(text()).toContain('審核中')
    expect(text()).toContain(NOT_APPROVED_TEXT)
    expect(byText(el, 'button', '重新整理')).toBeTruthy()
    expect(el.querySelector('form[aria-label="上架食物"]')).toBeNull()
    expect(el.querySelector('[role="tablist"]')).toBeNull()
    expect(m.listFoods).not.toHaveBeenCalled()
    expect(el.querySelector('h1')!.textContent).toBe('提供食物')
  })

  it('未通過：「申請未通過」與原因', async () => {
    const { el, text } = await renderPage(meOf('citizen', supplierOf('rejected')))
    await until(() => !!el.querySelector('[data-status="rejected"]'), '未通過畫面')
    expect(text()).toContain('申請未通過')
    expect(text()).toContain('原因')
    expect(text()).toContain(REJECTED_TEXT.replace(/\s+/g, ''))
    expect(el.querySelector('[role="tablist"]')).toBeNull()
  })

  it('已通過：單位名稱・已通過、我的庫存（三欄總計、進行中、等待派送提醒、已結束收合）', async () => {
    const foods = [
      foodOf(),
      foodOf({ id: 'f-2', name: '全麥麵包', status: 'closed', closed: true, remaining: 2, dispatched_qty: 1, delivered_qty: 3 }),
      foodOf({ id: 'f-3', name: '豆漿', status: 'claimed', remaining: 0, dispatched_qty: 0, delivered_qty: 6 }),
    ]
    const { el, text } = await renderPage(meOf('supplier', supplierOf('approved')), { foods })
    await until(() => !!el.querySelector('section[aria-label="我的庫存"]'), '我的庫存')
    expect(text()).toContain('萬華好味便當（模擬）已通過')
    const tabs = [...el.querySelectorAll('[role="tab"]')]
    expect(tabs.map((t) => t.textContent?.trim())).toEqual(['我的庫存', '上架食物'])
    expect(tabs[0]!.getAttribute('aria-selected')).toBe('true')
    // 剩餘只算 open（3）；派出中、已送達算全部（2+1+0、1+3+6）
    expect([...el.querySelectorAll('dl[aria-label="庫存總計"] dd')].map((d) => d.textContent?.trim())).toEqual(['3', '3', '10'])
    expect(el.querySelector('article[aria-label="雞腿便當"]')).toBeTruthy()
    expect(byText(el, 'article[aria-label="雞腿便當"] button', '修改')).toBeTruthy()
    expect(text()).toContain('最晚18:00食用')
    expect(text()).toContain('還有食物等待派送')
    const ended = byText(el, 'section[data-open]', '已結束的食物（2）')!
    expect(ended.getAttribute('data-open')).toBe('false')
    expect(ended.querySelector('button')!.getAttribute('aria-expanded')).toBe('false')
    expect(byText(el, 'button', '上架新食物')).toBeTruthy()
  })
})

describe('畫面 MR-P06：分頁與網址 ?tab= 同步（T-136）', () => {
  it('網址決定分頁；切換用 push 並保留 ?as=；App 返回鍵退回上一個分頁', async () => {
    const { el, router } = await renderPage(meOf('supplier', supplierOf('approved')), { query: '?as=u-sup-1&tab=publish' })
    await until(() => !!el.querySelector('form[aria-label="上架食物"]'), '上架分頁')
    expect(el.querySelector('h1')!.textContent).toBe('上架食物')
    expect(el.querySelector('[aria-current="step"]')?.textContent).toContain('拍照')

    byText(el, '[role="tab"]', '我的庫存')!.click()
    await until(() => router.currentRoute.value.query.tab === 'inventory', '網址變成 inventory')
    expect(router.currentRoute.value.query).toEqual({ as: 'u-sup-1', tab: 'inventory' })
    await until(() => !!el.querySelector('section[aria-label="我的庫存"]'), '庫存分頁')
    expect(el.querySelector('h1')!.textContent).toBe('提供食物')

    router.back()
    await until(() => router.currentRoute.value.query.tab === 'publish', '返回上架分頁')
    await until(() => !!el.querySelector('form[aria-label="上架食物"]'), '上架表單回來')
    expect(router.currentRoute.value.query.as).toBe('u-sup-1')
  })

  it('「＋ 上架新食物」切到上架分頁（push，返回鍵可回庫存）', async () => {
    const { el, router } = await renderPage(meOf('supplier', supplierOf('approved')), { query: '?as=u-sup-1' })
    await until(() => !!el.querySelector('section[aria-label="我的庫存"]'), '庫存分頁')
    byText(el, 'button', '上架新食物')!.click()
    await until(() => router.currentRoute.value.query.tab === 'publish', '網址變成 publish')
    router.back()
    await until(() => router.currentRoute.value.query.tab === undefined, '回到沒有 tab 的網址')
    await until(() => !!el.querySelector('section[aria-label="我的庫存"]'), '回到庫存')
  })

  it('「已申請？查看審核狀態」重新讀取申請狀態，變成審核中', async () => {
    const { el } = await renderPage(meOf('citizen', null))
    await until(() => !!byText(el, 'button', '已申請？查看審核狀態'), '查看審核狀態')
    m.getMe.mockResolvedValue(meOf('citizen', supplierOf('pending')))
    m.getMySupplier.mockResolvedValue(supplierOf('pending'))
    byText(el, 'button', '已申請？查看審核狀態')!.click()
    await until(() => !!el.querySelector('[data-status="pending"]'), '審核中畫面')
    expect(m.getMySupplier).toHaveBeenCalledTimes(2)
  })

  it('還是查不到申請：留在申請表並提示', async () => {
    const { el } = await renderPage(meOf('citizen', null))
    await until(() => !!byText(el, 'button', '已申請？查看審核狀態'), '查看審核狀態')
    byText(el, 'button', '已申請？查看審核狀態')!.click()
    await until(() => toasts.value.some((t) => t.message.includes('查不到申請紀錄')), '提示')
    expect(el.querySelector('form[aria-label="申請成為提供者"]')).toBeTruthy()
  })
})

describe('畫面 MR-P06：下架與上架（T-136）', () => {
  const dialog = () => document.body.querySelector('[role="alertdialog"]')

  it('下架要先確認：按「下架」只開確認視窗；取消不送出；確認才送 { closed: true }', async () => {
    const { el } = await renderPage(meOf('supplier', supplierOf('approved')))
    await until(() => !!el.querySelector('article[aria-label="雞腿便當"]'), '食物列')
    const closeBtn = () => el.querySelector<HTMLButtonElement>('button[aria-label="下架「雞腿便當」"]')!

    closeBtn().click()
    await until(() => !!dialog(), '確認視窗')
    expect(dialog()!.textContent).toContain('下架「雞腿便當」？')
    expect(dialog()!.querySelector('[data-danger="true"]')).toBeTruthy()
    expect(m.updateFood).not.toHaveBeenCalled()

    byText(dialog()!, 'button', '取消')!.click()
    await until(() => !dialog(), '視窗關閉')
    expect(m.updateFood).not.toHaveBeenCalled()

    closeBtn().click()
    await until(() => !!dialog(), '再開一次')
    m.updateFood.mockResolvedValue(foodOf({ status: 'closed', closed: true }))
    dialog()!.querySelector<HTMLButtonElement>('[data-danger="true"]')!.click()
    await until(() => m.updateFood.mock.calls.length === 1, '送出下架')
    expect(m.updateFood).toHaveBeenCalledWith('f-1', { closed: true })
    await until(() => toasts.value.some((t) => t.message === '已下架「雞腿便當」'), '提示已下架')
  })

  it('斷網時「修改」「下架」停用（ADR-024）', async () => {
    const { el } = await renderPage(meOf('supplier', supplierOf('approved')), {
      foods: Object.assign([foodOf()], { stale_at: '2026-11-07T09:55:00+08:00' }),
    })
    await until(() => !!el.querySelector('article[aria-label="雞腿便當"]'), '食物列')
    expect(el.querySelector<HTMLButtonElement>('button[aria-label="下架「雞腿便當」"]')!.disabled).toBe(true)
    expect(el.querySelector<HTMLButtonElement>('button[aria-label="修改「雞腿便當」"]')!.disabled).toBe(true)
  })

  it('確認上架成功：切到我的庫存、新的一列高亮、提示「已上架」', async () => {
    const { el, router } = await renderPage(meOf('supplier', supplierOf('approved')), { query: '?as=u-sup-1&tab=publish' })
    await until(() => !!el.querySelector('form[aria-label="上架食物"]'), '上架表單')
    byText(el, 'button', '略過，先填資料')!.click()
    await until(() => !!byText(el, 'label', '食物名稱'), '展開欄位')
    const nameInput = document.getElementById(byText(el, 'label', '食物名稱')!.getAttribute('for')!) as HTMLInputElement
    nameInput.value = '饅頭'
    nameInput.dispatchEvent(new Event('input'))
    el.querySelector<HTMLButtonElement>('[data-category="bakery"]')!.click()
    await flush()
    expect(el.textContent).toContain(point.name) // 預設上次用的食物點
    expect(el.querySelector('[aria-current="step"]')?.textContent).toContain('上架')
    const submit = byText(el, 'button', '確認上架') as HTMLButtonElement
    expect(submit.disabled).toBe(false)

    m.createFood.mockResolvedValue(foodOf({ id: 'f-9', name: '饅頭', category: 'bakery', qty: 1, remaining: 1, dispatched_qty: 0, delivered_qty: 0, created_at: '2026-11-07T10:00:00+08:00' }))
    submit.click()
    await until(() => m.createFood.mock.calls.length === 1, '送出上架')
    expect(m.createFood.mock.calls[0]![0]).toMatchObject({ point_id: 'p-1', name: '饅頭', category: 'bakery', qty: 1 })
    await until(() => router.currentRoute.value.query.tab === 'inventory', '切回我的庫存')
    expect(router.currentRoute.value.query.as).toBe('u-sup-1')
    await until(() => !!el.querySelector('article[aria-label="饅頭"]'), '新的一列')
    expect(el.querySelector('article[aria-label="饅頭"]')!.getAttribute('data-fresh')).toBe('true')
    expect(toasts.value.some((t) => t.message.startsWith('已上架'))).toBe(true)
  })
})

describe('上架表單元件（T-136）', () => {
  function mount(render: () => ReturnType<typeof h>) {
    const el = document.createElement('div')
    document.body.appendChild(el)
    const app = createApp({ render })
    app.mount(el)
    cleanups.push(() => (app.unmount(), el.remove()))
    return el
  }

  it('類別「其他」展開成乾貨、飲料、其他；選了「其他」裡的類別，下次一開始就展開', async () => {
    const state = reactive<{ c: string | null }>({ c: null })
    const el = mount(() => h(CategoryPicker, { modelValue: state.c, 'onUpdate:modelValue': (v: string | null) => (state.c = v) }))
    expect([...el.querySelectorAll('[data-category]')].map((b) => b.getAttribute('data-category'))).toEqual(['meal_box', 'bakery', 'produce', 'more'])
    const more = el.querySelector<HTMLButtonElement>('[data-category="more"]')!
    expect(more.getAttribute('aria-expanded')).toBe('false')
    more.click()
    await nextTick()
    expect(more.getAttribute('aria-expanded')).toBe('true')
    expect([...el.querySelectorAll('[role="group"] [data-category]')].map((b) => b.textContent?.trim())).toEqual(['乾貨', '飲料', '其他'])
    el.querySelector<HTMLButtonElement>('[data-category="drink"]')!.click()
    await nextTick()
    expect(state.c).toBe('drink')

    const el2 = mount(() => h(CategoryPicker, { modelValue: 'dry_goods', 'onUpdate:modelValue': () => undefined }))
    expect(el2.querySelector('[data-category="more"]')!.getAttribute('aria-expanded')).toBe('true')
  })

  it('修改份數（V21）：NumberStepper 下限＝派出中＋已送達，按「−」或輸入更小的數都停在下限', async () => {
    const food = foodOf({ qty: 6, dispatched_qty: 2, delivered_qty: 1 })
    const form = reactive({ qty: 4 as number | null, expires_local: '2026-11-07T18:00' })
    mount(() => h(FoodEditSheet, { modelValue: true, food, form, now: NOW, error: null }))
    await nextTick()
    const minus = () => document.body.querySelector<HTMLButtonElement>('button[aria-label="減少份數"]')!
    const input = document.body.querySelector<HTMLInputElement>('input[aria-label="份數"]')!
    expect(minus().disabled).toBe(false)
    minus().click()
    await nextTick()
    expect(form.qty).toBe(3)
    expect(minus().disabled).toBe(true)
    input.value = '1'
    input.dispatchEvent(new Event('input'))
    input.dispatchEvent(new Event('change'))
    await nextTick()
    expect(form.qty).toBe(3)
    expect(document.body.textContent).toContain('已派出＋已送達 3 份')
  })
})
