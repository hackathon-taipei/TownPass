import { describe, expect, it } from 'vitest'
import { idlePhaseOf, PENGUIN_COUNT, penguinOf, pinColorOf } from '@/features/meal-relay/logic/mapMarker'
import { allergenConflicts, claimProgress, timeLeftText } from '@/features/meal-relay/logic/mealLabels'
import { diffById } from '@/features/meal-relay/logic/motion'

// 鄰食轉運站介面元件的邏輯（docs/meal-relay/ui-kit.md）

describe('allergenConflicts（M4）', () => {
  it('回傳兩邊都有的過敏原', () => {
    expect(allergenConflicts(['peanut', 'milk', 'egg'], ['egg', 'peanut'])).toEqual(['peanut', 'egg'])
  })
  it('沒有交集回傳空陣列', () => {
    expect(allergenConflicts(['soy'], ['milk'])).toEqual([])
  })
})

describe('claimProgress（M8）', () => {
  it('已派送 → 配送中 → 完成 是 1～3 步', () => {
    expect(claimProgress('claimed')).toEqual({ step: 1, total: 3 })
    expect(claimProgress('delivering')).toEqual({ step: 2, total: 3 })
    expect(claimProgress('done')).toEqual({ step: 3, total: 3 })
  })
  it('取消沒有進度', () => {
    expect(claimProgress('cancelled')).toBeNull()
  })
})

describe('timeLeftText', () => {
  it('依長度換單位', () => {
    expect(timeLeftText(40_000)).toBe('還有 40 秒')
    expect(timeLeftText(5 * 60_000)).toBe('還有 5 分')
    expect(timeLeftText(2 * 3_600_000)).toBe('還有 2 小時')
    expect(timeLeftText(125 * 60_000)).toBe('還有 2 小時 5 分')
  })
  it('到期或過期', () => {
    expect(timeLeftText(0)).toBe('已到期')
    expect(timeLeftText(-1)).toBe('已到期')
  })
})

describe('pinColorOf（地圖顏色）', () => {
  it('食物點與長者的狀態對應顏色', () => {
    expect(pinColorOf('open')).toBe('yellow')
    expect(pinColorOf('claimed')).toBe('blue')
    expect(pinColorOf('unclaimed')).toBe('red')
    expect(pinColorOf('alert')).toBe('red')
    expect(pinColorOf('ok')).toBe('green')
    expect(pinColorOf('closed')).toBe('grey')
    expect(pinColorOf(undefined)).toBe('default')
  })
})

describe('diffById（輪詢只對變化的項目做動畫）', () => {
  it('分出新增、改變、移除，沒變的不出現', () => {
    const prev = [{ id: 'a', s: 'open' }, { id: 'b', s: 'open' }, { id: 'c', s: 'open' }]
    const next = [{ id: 'a', s: 'open' }, { id: 'b', s: 'claimed' }, { id: 'd', s: 'open' }]
    const d = diffById(prev, next, (x) => x.s)
    expect(d.added.map((x) => x.id)).toEqual(['d'])
    expect(d.changed.map((x) => x.id)).toEqual(['b'])
    expect(d.removed.map((x) => x.id)).toEqual(['c'])
  })
})

describe('penguinOf（志工企鵝圖示）', () => {
  it('同一個志工永遠是同一隻，範圍 1～6', () => {
    for (const id of ['u-vol-1', 'u-vol-2', 'abc', '']) {
      const n = penguinOf(id)
      expect(n).toBe(penguinOf(id))
      expect(n).toBeGreaterThanOrEqual(1)
      expect(n).toBeLessThanOrEqual(PENGUIN_COUNT)
    }
  })
  it('不同志工會分到不同的企鵝', () => {
    const ids = Array.from({ length: 60 }, (_, i) => `u-vol-${i}`)
    expect(new Set(ids.map(penguinOf)).size).toBe(PENGUIN_COUNT)
  })
  it('待機動作起始點在 0～1 且彼此錯開', () => {
    const phases = ['u-vol-1', 'u-vol-2', 'u-vol-3'].map(idlePhaseOf)
    for (const p of phases) {
      expect(p).toBeGreaterThanOrEqual(0)
      expect(p).toBeLessThan(1)
    }
    expect(new Set(phases).size).toBe(3)
  })
})
