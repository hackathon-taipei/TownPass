import { describe, expect, it } from 'vitest'
import {
  base64Bytes,
  countdownText,
  ELDER_TAG_LABEL,
  elderTagsOf,
  fitSize,
  foodQtyText,
  homeRouteOf,
  IMAGE_MAX_BYTES,
  IMAGE_MAX_EDGE,
  IMAGE_QUALITY_STEPS,
  isImageMime,
  staleText,
} from '@/features/meal-relay/logic/shared'

// 鄰食轉運站共用邏輯（T-114，logic/shared.ts）

describe('foodQtyText（M1）', () => {
  it('依序列出剩餘、派出中、已送達', () => {
    expect(foodQtyText({ remaining: 2, dispatched_qty: 2, delivered_qty: 1 })).toBe('剩 2／派出中 2／已送達 1')
  })
  it('全部為 0 也照樣顯示三個數字', () => {
    expect(foodQtyText({ remaining: 0, dispatched_qty: 0, delivered_qty: 0 })).toBe('剩 0／派出中 0／已送達 0')
  })
})

describe('countdownText', () => {
  const now = Date.parse('2026-11-07T10:00:00.000Z')
  it('未來的時間回傳剩餘時間', () => {
    const iso = new Date(now + 65 * 60_000).toISOString()
    expect(countdownText(iso, now)).toBe('還有 1 小時 5 分')
  })
  it('剛好到期回傳已到期', () => {
    expect(countdownText(new Date(now).toISOString(), now)).toBe('已到期')
  })
  it('已經過去回傳已到期', () => {
    const iso = new Date(now - 10 * 60_000).toISOString()
    expect(countdownText(iso, now)).toBe('已到期')
  })
  it('格式錯誤的字串回傳已到期', () => {
    expect(countdownText('不是時間', now)).toBe('已到期')
  })
})

describe('homeRouteOf（§9）', () => {
  it('志工、提供者、轉運站回傳自己的路由名稱', () => {
    expect(homeRouteOf('volunteer')).toBe('volunteer')
    expect(homeRouteOf('supplier')).toBe('supplier')
    expect(homeRouteOf('station')).toBe('station')
  })
  it('市民與管理員留在首頁，回傳 null', () => {
    expect(homeRouteOf('citizen')).toBeNull()
    expect(homeRouteOf('admin')).toBeNull()
  })
})

describe('長者標籤 elderTagsOf 與 ELDER_TAG_LABEL（M10）', () => {
  it('全部為 false 且有最後見到時間，沒有標籤', () => {
    expect(elderTagsOf({ meal_due: false, care_due: false, last_seen_at: '2026-11-07T08:00:00.000Z' })).toEqual([])
  })
  it('三個都成立時順序為需要送餐、需要關懷、從未見到', () => {
    expect(elderTagsOf({ meal_due: true, care_due: true, last_seen_at: null })).toEqual([
      'meal_due',
      'care_due',
      'never_seen',
    ])
  })
  it('從未見到只看 last_seen_at 是否為空', () => {
    expect(elderTagsOf({ meal_due: false, care_due: false, last_seen_at: null })).toEqual(['never_seen'])
  })
  it('標籤使用中文', () => {
    expect(ELDER_TAG_LABEL).toEqual({
      meal_due: '需要送餐',
      care_due: '需要關懷',
      never_seen: '從未見到',
    })
  })
})

describe('staleText（ADR-024）', () => {
  const now = Date.parse('2026-11-07T10:00:00.000Z')
  it('null 或 undefined 回傳空字串（線上資料）', () => {
    expect(staleText(null, now)).toBe('')
    expect(staleText(undefined, now)).toBe('')
  })
  it('30 秒前顯示剛剛', () => {
    const t = new Date(now - 30_000).toISOString()
    expect(staleText(t, now)).toContain('剛剛')
  })
  it('5 分鐘前顯示 5 分鐘前', () => {
    const t = new Date(now - 5 * 60_000).toISOString()
    expect(staleText(t, now)).toContain('5 分鐘前')
  })
  it('2 小時前顯示 2 小時前', () => {
    const t = new Date(now - 2 * 3_600_000).toISOString()
    expect(staleText(t, now)).toContain('2 小時前')
  })
  it('格式錯誤仍提示離線、不能送出', () => {
    const text = staleText('不是時間', now)
    expect(text).toContain('目前離線')
    expect(text).toContain('暫時不能送出')
  })
})

describe('isImageMime（M19）', () => {
  it('jpeg、png、webp 為 true', () => {
    expect(isImageMime('image/jpeg')).toBe(true)
    expect(isImageMime('image/png')).toBe(true)
    expect(isImageMime('image/webp')).toBe(true)
  })
  it('gif 與純文字為 false', () => {
    expect(isImageMime('image/gif')).toBe(false)
    expect(isImageMime('text/plain')).toBe(false)
  })
})

describe('fitSize', () => {
  it('1600×1200 等比例縮到 800×600', () => {
    expect(fitSize(1600, 1200)).toEqual({ width: 800, height: 600 })
  })
  it('小圖不放大', () => {
    expect(fitSize(600, 400)).toEqual({ width: 600, height: 400 })
  })
  it('長條圖的長邊縮到 800', () => {
    const size = fitSize(1200, 4000)
    expect(Math.max(size.width, size.height)).toBe(800)
    expect(size).toEqual({ width: 240, height: 800 })
  })
  it('極窄圖不會變成 0', () => {
    const size = fitSize(1, 5000)
    expect(size.width).toBeGreaterThanOrEqual(1)
    expect(size.height).toBe(800)
  })
})

describe('base64Bytes', () => {
  it('ABC 的 base64 為 3 個位元組', () => {
    expect(base64Bytes('QUJD')).toBe(3)
  })
  it('一個等號扣 1 個位元組', () => {
    expect(base64Bytes('QUI=')).toBe(2)
  })
  it('兩個等號扣 2 個位元組', () => {
    expect(base64Bytes('QQ==')).toBe(1)
  })
  it('含 data: 前綴時仍正確', () => {
    expect(base64Bytes('data:image/png;base64,QUJD')).toBe(3)
    expect(base64Bytes('data:image/png;base64,QUI=')).toBe(2)
  })
})

describe('圖片常數（M19、§5）', () => {
  it('上限 200 KB', () => {
    expect(IMAGE_MAX_BYTES).toBe(200_000)
  })
  it('長邊上限 800 px', () => {
    expect(IMAGE_MAX_EDGE).toBe(800)
  })
  it('品質步驟由大到小', () => {
    const steps = [...IMAGE_QUALITY_STEPS]
    const sorted = [...steps].sort((a, b) => b - a)
    expect(steps).toEqual(sorted)
    expect(steps).toEqual([0.85, 0.7, 0.55, 0.4])
  })
})
