import { beforeEach, describe, expect, it, vi } from 'vitest'

// 入口照片（T-128，ADR-028）：顯示判斷（logic/placePhoto.ts）與新增食物點附照片（logic/supplier.ts）。
// 資料層全部 mock，不連網路。

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
import type { Me, Point, Supplier } from '@/features/meal-relay/data'
import { ENTRANCE_PHOTO_RULE, pickupPhotoOf, placePhotoOf, pointPhotoOf, stationPhotoOf } from '@/features/meal-relay/logic/placePhoto'
import { buildPointCreate, emptyPointForm, setFormImage, useSupplierPage } from '@/features/meal-relay/logic/supplier'

const m = vi.mocked(data)

const supplier: Supplier = {
  id: 's-1',
  account_id: 'u-sup-1',
  name: '艋舺便當店（模擬）',
  org_type: 'shop',
  location: { lat: 25.0354, lng: 121.5013 },
  status: 'approved',
  created_at: '2026-11-07T08:00:00+08:00',
  reviewed_at: '2026-11-07T09:00:00+08:00',
}
const me: Me = { id: 'u-sup-1', role: 'supplier', name: '測試', station_id: null, supplier }
const pointOf = (over: Partial<Point> = {}): Point => ({
  id: 'p-9',
  name: '老松國小側門',
  kind: 'custom',
  location: { lat: 25.038, lng: 121.502 },
  source: 'custom',
  created_by: 'u-sup-1',
  open_food_count: 0,
  image_url: null,
  ...over,
})

beforeEach(() => vi.clearAllMocks())

describe('placePhotoOf：有照片才顯示', () => {
  it('沒有網址（null、undefined、空字串）回傳 null，畫面不放縮圖也不留空框', () => {
    expect(placePhotoOf(null, '老松國小')).toBeNull()
    expect(placePhotoOf(undefined, '老松國小')).toBeNull()
    expect(placePhotoOf('', '老松國小')).toBeNull()
  })
  it('相對網址接上後端位址，替代文字用地點名稱', () => {
    const photo = placePhotoOf('/meal-relay/images/img-1', '老松國小側門')
    expect(photo?.src).toMatch(/^https?:\/\/.+\/meal-relay\/images\/img-1$/)
    expect(photo?.alt).toBe('老松國小側門的入口照片')
    expect(photo?.title).toBe('老松國小側門・入口照片')
  })
  it('名稱空白時改用「這個地點」', () => {
    expect(placePhotoOf('/meal-relay/images/img-1', '  ')?.alt).toBe('這個地點的入口照片')
  })
  it('拍攝規定寫明不能有人臉、車牌、門牌', () => {
    expect(ENTRANCE_PHOTO_RULE).toContain('人臉')
    expect(ENTRANCE_PHOTO_RULE).toContain('車牌')
    expect(ENTRANCE_PHOTO_RULE).toContain('門牌')
  })
})

describe('任務卡、據點清單、食物點', () => {
  it('志工任務卡：取餐地點的入口照片來自 Food.point_image_url', () => {
    expect(pickupPhotoOf({ point_image_url: '/meal-relay/images/img-p', point_name: '艋舺據點' })?.alt).toBe('艋舺據點的入口照片')
    expect(pickupPhotoOf({ point_image_url: null, point_name: '艋舺據點' })).toBeNull()
  })
  it('首頁據點清單：Station.image_url 有值才顯示', () => {
    expect(stationPhotoOf({ image_url: '/meal-relay/images/img-st', name: '艾馨公益慈善會' })?.title).toBe('艾馨公益慈善會・入口照片')
    expect(stationPhotoOf({ image_url: null, name: '艾馨公益慈善會' })).toBeNull()
  })
  it('食物點：Point.image_url', () => {
    expect(pointPhotoOf(pointOf({ image_url: '/meal-relay/images/img-9' }))).not.toBeNull()
    expect(pointPhotoOf(pointOf())).toBeNull()
  })
})

describe('新增食物點附入口照片', () => {
  it('buildPointCreate：有 image_id 才送，沒有就不帶這個欄位（後端 extra="forbid"）', () => {
    const form = { ...emptyPointForm(), name: ' 側門 ', location: { lat: 25.03, lng: 121.5 } }
    expect(buildPointCreate(form)).toEqual({ ok: true, body: { name: '側門', kind: 'custom', location: { lat: 25.03, lng: 121.5 } } })
    expect(buildPointCreate(form, 'img-1')).toEqual({
      ok: true,
      body: { name: '側門', kind: 'custom', location: { lat: 25.03, lng: 121.5 }, image_id: 'img-1' },
    })
  })
  it('setFormImage：寫入圖片與預覽，傳 null 移除', () => {
    const form = emptyPointForm()
    setFormImage(form, { data: 'AAAA', mime: 'image/jpeg' })
    expect(form.image).toEqual({ data: 'AAAA', mime: 'image/jpeg' })
    expect(form.image_preview).toBe('data:image/jpeg;base64,AAAA')
    setFormImage(form, null)
    expect(form.image).toBeNull()
    expect(form.image_preview).toBeNull()
  })

  async function page() {
    m.getMe.mockResolvedValue(me)
    m.getMySupplier.mockResolvedValue(supplier)
    m.listPoints.mockResolvedValue([])
    m.listFoods.mockResolvedValue([])
    const p = useSupplierPage()
    await p.load()
    Object.assign(p.pointForm, { name: '老松國小側門', location: { lat: 25.038, lng: 121.502 } })
    return p
  }

  it('有照片：先 uploadImage，再 createPoint 帶 image_id；成功後清空表單', async () => {
    const p = await page()
    setFormImage(p.pointForm, { data: 'AAAA', mime: 'image/jpeg' })
    m.uploadImage.mockResolvedValue({ id: 'img-1', image_url: '/meal-relay/images/img-1', mime: 'image/jpeg', size: 3 })
    m.createPoint.mockResolvedValue(pointOf({ image_url: '/meal-relay/images/img-1' }))

    expect(await p.addPoint()).toBe(true)
    expect(m.uploadImage).toHaveBeenCalledWith('data:image/jpeg;base64,AAAA')
    expect(m.createPoint).toHaveBeenCalledWith({
      name: '老松國小側門',
      kind: 'custom',
      location: { lat: 25.038, lng: 121.502 },
      image_id: 'img-1',
    })
    expect(p.pointForm.image).toBeNull()
    expect(p.pointForm.image_preview).toBeNull()
    expect(p.foodForm.point_id).toBe('p-9')
  })

  it('沒有照片：不上傳，createPoint 不帶 image_id', async () => {
    const p = await page()
    m.createPoint.mockResolvedValue(pointOf())
    expect(await p.addPoint()).toBe(true)
    expect(m.uploadImage).not.toHaveBeenCalled()
    expect(m.createPoint.mock.calls[0]![0]).not.toHaveProperty('image_id')
  })

  it('照片上傳失敗：不建立食物點，顯示後端訊息', async () => {
    const p = await page()
    setFormImage(p.pointForm, { data: 'AAAA', mime: 'image/jpeg' })
    m.uploadImage.mockRejectedValue(new data.MealApiError('IMAGE_TOO_LARGE', '圖片大小超過上限 200000 bytes', 413))
    expect(await p.addPoint()).toBe(false)
    expect(m.createPoint).not.toHaveBeenCalled()
    expect(p.pointError.value).toBe('圖片大小超過上限 200000 bytes')
  })
})
