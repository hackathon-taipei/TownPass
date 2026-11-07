import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { foodQtyCounts, FOOD_QTY_FIELDS, QTY_MAX_DEFAULT, qtyHint, qtyRangeText } from '@/features/meal-relay/logic/foodQty'
import { isEndedMarker, legendOf, MAP_STATUS_LABEL, MARKER_KIND_LABEL, pinColorOf, taskMarkers, visibleMarkers } from '@/features/meal-relay/logic/mapMarker'
import { idlePhaseOf, PENGUIN_COUNT, penguinOf, penguinSrc } from '@/features/meal-relay/logic/volunteerAvatar'
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

describe('pinColorOf（地圖顏色，T-126 三色＋據點深灰）', () => {
  it('進行中／正常 → primary', () => {
    for (const s of ['open', 'delivering', 'ok'] as const) expect(pinColorOf(s), s).toBe('primary')
  })
  it('需要處理 → warn', () => {
    for (const s of ['unclaimed', 'alert'] as const) expect(pinColorOf(s), s).toBe('warn')
  })
  it('結束 → grey', () => {
    for (const s of ['claimed', 'done', 'expired', 'closed', 'cancelled'] as const) expect(pinColorOf(s), s).toBe('grey')
  })
  it('沒有狀態（據點、提供者）→ 據點深灰', () => {
    expect(pinColorOf(undefined)).toBe('station')
  })
  it('每個狀態都只對到四種顏色之一（沒有黃、藍、綠、紅）', () => {
    const colors = new Set((Object.keys(MAP_STATUS_LABEL) as (keyof typeof MAP_STATUS_LABEL)[]).map((s) => pinColorOf(s)))
    for (const c of colors) expect(['primary', 'warn', 'grey', 'station']).toContain(c)
  })
})

describe('isEndedMarker／visibleMarkers（地圖不畫已結束的）', () => {
  const at = { lat: 25.03, lng: 121.5 }
  it('食物點已全數派出、已過期、已下架不畫；可派送、還沒被派出、沒有食物要畫', () => {
    for (const s of ['claimed', 'expired', 'closed'] as const) expect(isEndedMarker({ kind: 'point', status: s }), s).toBe(true)
    for (const s of ['open', 'unclaimed', undefined] as const) expect(isEndedMarker({ kind: 'point', status: s }), String(s)).toBe(false)
  })
  it('完成、取消一律不畫；據點、長者、我照畫', () => {
    expect(isEndedMarker({ kind: 'elder', status: 'done' })).toBe(true)
    expect(isEndedMarker({ kind: 'elder', status: 'cancelled' })).toBe(true)
    expect(isEndedMarker({ kind: 'station' })).toBe(false)
    expect(isEndedMarker({ kind: 'elder', status: 'alert' })).toBe(false)
    expect(isEndedMarker({ kind: 'me' })).toBe(false)
  })
  it('visibleMarkers 只留下還在進行的，順序不變', () => {
    const ms = [
      { id: 'a', kind: 'point', location: at, status: 'open' },
      { id: 'b', kind: 'point', location: at, status: 'expired' },
      { id: 'c', kind: 'station', location: at },
      { id: 'd', kind: 'point', location: at, status: 'claimed' },
    ] as const
    expect(visibleMarkers(ms).map((m) => m.id)).toEqual(['a', 'c'])
  })
})

describe('taskMarkers（志工任務卡地圖：只有據點、長者、我）', () => {
  const station = { id: 's-1', name: '艾馨據點', location: { lat: 25.04, lng: 121.51 } }
  const ok = { id: 'e-1', alias: '萬華-A01', location: { lat: 25.03, lng: 121.5 }, meal_due: false, care_due: false, last_seen_at: '2026-11-07T10:00:00+08:00' }
  const me = { id: 'u-vol-1', location: { lat: 25.035, lng: 121.505 } }

  it('有定位：據點、長者、我，三根而已', () => {
    const ms = taskMarkers({ station, elder: ok, me, base: '/base/' })
    expect(ms.map((m) => m.kind)).toEqual(['station', 'elder', 'me'])
    expect(ms[0]).toMatchObject({ id: 'station:s-1', label: '艾馨據點', location: station.location })
    expect(ms[0].status).toBeUndefined()
    expect(pinColorOf(ms[0].status)).toBe('station')
    expect(ms[2]).toMatchObject({ id: 'me', location: me.location, avatar: penguinSrc('u-vol-1', '/base/') })
  })
  it('拒絕定位或取不到（me = null）：只有據點和長者', () => {
    expect(taskMarkers({ station, elder: ok, me: null }).map((m) => m.kind)).toEqual(['station', 'elder'])
    expect(taskMarkers({ station, elder: ok }).map((m) => m.kind)).toEqual(['station', 'elder'])
  })
  it('據點還沒讀到：只有長者（和我）', () => {
    expect(taskMarkers({ station: null, elder: ok, me }).map((m) => m.kind)).toEqual(['elder', 'me'])
  })
  it('長者正常 → primary；需要送餐、需要關懷、從未見到 → warn', () => {
    expect(pinColorOf(taskMarkers({ elder: ok })[0].status)).toBe('primary')
    for (const elder of [{ ...ok, meal_due: true }, { ...ok, care_due: true }, { ...ok, last_seen_at: null }]) {
      expect(pinColorOf(taskMarkers({ elder })[0].status)).toBe('warn')
    }
  })
  it('圖例跟著定位針：有我才有「我」', () => {
    expect(legendOf(taskMarkers({ station, elder: ok, me })).map((i) => i.label)).toEqual(['據點', '長者', '我'])
    expect(legendOf(taskMarkers({ station, elder: { ...ok, meal_due: true } })).map((i) => i.label)).toEqual(['據點', '長者（需要處理）'])
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

describe('penguinOf（志工企鵝頭像 MR-C23）', () => {
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
  it('圖片網址指到 public/meal-relay/penguins', () => {
    expect(penguinSrc('u-vol-1', '/base/')).toBe(`/base/meal-relay/penguins/penguin-${penguinOf('u-vol-1')}.png`)
  })
})

describe('mapMarker（合約 v2.2）', () => {
  it('地圖上沒有其他志工的位置（合約沒有志工位置的 API）；只有裝置上的「我」（T-126）', () => {
    expect(Object.keys(MARKER_KIND_LABEL).sort()).toEqual(['elder', 'me', 'point', 'station', 'supplier'])
    expect(Object.keys(MARKER_KIND_LABEL)).not.toContain('volunteer')
  })
  it('「我的位置」不離開裝置：mapMarker.ts 不匯入資料層的函式、不寫入儲存', () => {
    const src = readFileSync(resolve(__dirname, '../src/features/meal-relay/logic/mapMarker.ts'), 'utf8')
    expect(src).not.toMatch(/from '\.\.\/data'|from '\.\.\/data\/index'|@\/platform|localStorage|sessionStorage|fetch\(/)
  })
  it('食物點狀態的中文照 v2.2 §4', () => {
    expect(MAP_STATUS_LABEL.open).toBe('可派送')
    expect(MAP_STATUS_LABEL.claimed).toBe('已全數派出')
  })
})

describe('qtyHint（MR-C11 QtyInput 的 min／max，M14）', () => {
  it('上架：預設 1～999', () => {
    expect(qtyHint('')).toBe('請輸入份數')
    expect(qtyHint('1')).toBe('')
    expect(qtyHint(String(QTY_MAX_DEFAULT))).toBe('')
    expect(qtyHint('1000')).toBe(`最多 ${QTY_MAX_DEFAULT} 份`)
    expect(qtyRangeText()).toBe('請輸入 1 到 999 份')
  })
  it('改份數：低於已派出＋已送達就提示', () => {
    expect(qtyHint('2', 3)).toBe('不能少於已派出＋已送達的 3 份')
    expect(qtyHint('3', 3)).toBe('')
    expect(qtyHint('6', 3, 5)).toBe('最多 5 份')
    expect(qtyRangeText(3, 5)).toContain('最少 3 份')
  })
})

describe('foodQtyCounts（MR-C14 FoodRow 的三個數字，M1）', () => {
  it('依序是剩餘、派出中、已送達', () => {
    expect(FOOD_QTY_FIELDS.map((f) => f.label)).toEqual(['剩餘', '派出中', '已送達'])
    expect(foodQtyCounts({ remaining: 2, dispatched_qty: 3, delivered_qty: 5 })).toEqual({
      remaining: 2,
      dispatched_qty: 3,
      delivered_qty: 5,
    })
  })
})
