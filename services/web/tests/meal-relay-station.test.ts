import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, effectScope, h, type Component } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import type { Checkin, MyStation } from '@/features/meal-relay/data'

// 鄰食轉運站據點頁（T-119，logic/station.ts）：QR 定時更新（M15）、倒數、斷網不顯示舊 QR（ADR-024）。
// 設計 v2 畫面（T-137）在最後一組。資料層用 mock，時間用 fake timers；模擬的後端照 M15 每 QR_ROTATE_SEC（Demo 30 秒）換一次 token。

const getMyStation = vi.fn()
vi.mock('@/features/meal-relay/data', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/meal-relay/data')>()
  return { ...actual, getMyStation: (...args: unknown[]) => getMyStation(...args) }
})

const {
  checkinsNewestFirst,
  checkinTimeText,
  isRetryable,
  nextFetchDelay,
  QR_REFRESH_LEAD_MS,
  QR_RETRY_MS,
  QR_SWAP_DELAY_MS,
  QR_SWAP_GRACE_MS,
  qrCountdownParts,
  qrSecondsLeft,
  qrSvg,
  STATION_POLL_MS,
  useStation,
} = await import('@/features/meal-relay/logic/station')
const { MealApiError } = await import('@/features/meal-relay/data')
const { default: StationPage } = await import('@/features/meal-relay/ui/StationPage.vue')
const { default: QrCountdown } = await import('@/features/meal-relay/ui/QrCountdown.vue')
const { default: CheckinList } = await import('@/features/meal-relay/ui/CheckinList.vue')

const ROTATE_MS = 30_000 // §5 Demo QR_ROTATE_SEC
const T0 = Date.parse('2026-11-07T10:00:05+08:00') // 時間窗 10:00:00～10:00:30 的第 5 秒

const station = { id: 'st-1', name: '大安關懷據點', location: { lat: 25.03, lng: 121.54 }, source: '臺北市銀髮族服務_社區照顧關懷據點' }
const checkin = (id: string, at: string, name = id): Checkin => ({
  id,
  volunteer_id: `u-${id}`,
  volunteer_name: name,
  station_id: 'st-1',
  checked_in_at: at,
})

/** 模擬後端 GET /stations/mine：依「現在」的時間窗給 token 與到期時間（M15） */
let online = true
let checkins: Checkin[] = []
function serverWindow(t = Date.now()) {
  return Math.floor(t / ROTATE_MS)
}
function serverResponse(): MyStation {
  const w = serverWindow()
  return {
    station,
    qr_text: `meal-relay:checkin:code-1:w${w}`,
    qr_expires_at: new Date((w + 1) * ROTATE_MS).toISOString(),
    checkins,
  }
}
function fakeServer() {
  getMyStation.mockImplementation(() =>
    online ? Promise.resolve(serverResponse()) : Promise.reject(new MealApiError('OFFLINE', '目前連不上伺服器，請稍後再試', 0)),
  )
}

function mount() {
  const scope = effectScope()
  const s = scope.run(() => useStation())!
  s.start()
  return { s, scope }
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(T0)
  online = true
  checkins = []
  getMyStation.mockReset()
  fakeServer()
})
afterEach(() => {
  vi.useRealTimers()
})

describe('純函數', () => {
  it('qrSecondsLeft：無條件進位，已過或格式錯誤是 0', () => {
    const exp = new Date(T0 + 25_000).toISOString()
    expect(qrSecondsLeft(exp, T0)).toBe(25)
    expect(qrSecondsLeft(exp, T0 + 24_100)).toBe(1)
    expect(qrSecondsLeft(exp, T0 + 25_000)).toBe(0)
    expect(qrSecondsLeft(exp, T0 + 99_000)).toBe(0)
    expect(qrSecondsLeft('不是時間', T0)).toBe(0)
  })

  it('qrCountdownParts：60 秒內只顯示秒數，更久顯示分:秒（正式版 1800 秒）', () => {
    expect(qrCountdownParts(28)).toEqual({ value: '28', unit: '秒後更新' })
    expect(qrCountdownParts(0)).toEqual({ value: '0', unit: '秒後更新' })
    expect(qrCountdownParts(1799)).toEqual({ value: '29:59', unit: '後更新' })
  })

  it('nextFetchDelay：到期前約 3 秒取一次、到期後再取新的 QR，平常每 10 秒', () => {
    const exp = T0 + 25_000
    expect(nextFetchDelay(exp, T0)).toBe(STATION_POLL_MS)
    expect(nextFetchDelay(exp, exp - 8_000)).toBe(5_000) // 到 exp - 3 秒
    expect(nextFetchDelay(exp, exp - QR_REFRESH_LEAD_MS)).toBe(QR_REFRESH_LEAD_MS + QR_SWAP_DELAY_MS)
    expect(nextFetchDelay(exp, exp + 5_000)).toBe(1_000) // 裝置時鐘快：最少隔 1 秒
    expect(nextFetchDelay(Number.NaN, T0)).toBe(QR_RETRY_MS)
  })

  it('checkinsNewestFirst：今天報到新的在上，不改原陣列', () => {
    const list = [checkin('a', '2026-11-07T09:00:00+08:00'), checkin('c', '2026-11-07T11:00:00+08:00'), checkin('b', '2026-11-07T10:00:00+08:00')]
    expect(checkinsNewestFirst(list).map((c) => c.id)).toEqual(['c', 'b', 'a'])
    expect(list.map((c) => c.id)).toEqual(['a', 'c', 'b'])
  })

  it('checkinTimeText：臺北時間 HH:mm', () => {
    expect(checkinTimeText('2026-11-07T01:05:00Z')).toBe('09:05')
    expect(checkinTimeText('2026-11-07T23:30:00+08:00')).toBe('23:30')
    expect(checkinTimeText('壞掉')).toBe('')
  })

  it('qrSvg：用 qrcode 產生 QR 模組，同樣文字結果相同、不同文字不同', () => {
    const a = qrSvg('meal-relay:checkin:code-1:abc1234567')
    expect(a.size).toBeGreaterThanOrEqual(21)
    expect(a.viewBox).toBe(`-4 -4 ${a.size + 8} ${a.size + 8}`)
    expect(a.path).toMatch(/^M\d+ \d+h\d+v1h-\d+z/)
    expect(qrSvg('meal-relay:checkin:code-1:abc1234567')).toEqual(a)
    expect(qrSvg('meal-relay:checkin:code-1:ffff000000').path).not.toBe(a.path)
  })

  it('isRetryable：斷網與伺服器錯誤會重試，權限錯誤不重試', () => {
    expect(isRetryable(new MealApiError('OFFLINE', 'x', 0))).toBe(true)
    expect(isRetryable(new MealApiError('HTTP_ERROR', 'x', 502))).toBe(true)
    expect(isRetryable(new MealApiError('FORBIDDEN_ROLE', 'x', 403))).toBe(false)
    expect(isRetryable(new Error('x'))).toBe(true)
  })
})

describe('useStation：QR 定時更新（M15）', () => {
  it('第一次取得後顯示 QR 與正確的倒數', async () => {
    const { s, scope } = mount()
    expect(s.loading.value).toBe(true)
    await vi.advanceTimersByTimeAsync(0)
    expect(s.loading.value).toBe(false)
    expect(s.station.value?.name).toBe('大安關懷據點')
    expect(s.qrText.value).toBe(`meal-relay:checkin:code-1:w${serverWindow(T0)}`)
    expect(s.secondsLeft.value).toBe(25)
    await vi.advanceTimersByTimeAsync(1_000)
    expect(s.secondsLeft.value).toBe(24)
    await vi.advanceTimersByTimeAsync(9_000)
    expect(s.secondsLeft.value).toBe(15)
    expect(s.offline.value).toBe(false)
    expect(s.staleAt.value).toBeNull()
    scope.stop()
  })

  it('到期前約 3 秒重新取得，到期後換成新的 QR，每 30 秒自動更新', async () => {
    const { s, scope } = mount()
    await vi.advanceTimersByTimeAsync(0)
    const first = s.qrText.value
    const expires = (serverWindow(T0) + 1) * ROTATE_MS

    // 到期前 3 秒前後：有重新取得，但後端還在同一個時間窗，QR 不變
    getMyStation.mockClear()
    await vi.advanceTimersByTimeAsync(expires - QR_REFRESH_LEAD_MS - Date.now() + 1)
    expect(getMyStation).toHaveBeenCalled()
    expect(s.qrText.value).toBe(first)

    // 到期後換成新的時間窗的 QR，倒數重新從 30 秒開始
    await vi.advanceTimersByTimeAsync(expires + QR_SWAP_DELAY_MS - Date.now() + 1)
    const second = s.qrText.value
    expect(second).not.toBe(first)
    expect(second).toBe(`meal-relay:checkin:code-1:w${serverWindow(expires)}`)
    expect(s.secondsLeft.value).toBe(30)
    expect(s.fraction.value).toBeGreaterThan(0.95)

    // 再過 30 秒又換一次：畫面上的 QR 一直是後端最新的時間窗（志工掃最新的 QR 能報到）
    await vi.advanceTimersByTimeAsync(ROTATE_MS)
    expect(s.qrText.value).toBe(serverResponse().qr_text)
    expect(s.qrText.value).not.toBe(second)
    scope.stop()
  })

  it('換 QR 中間不會出現空白（舊 QR 留到新的回來）', async () => {
    const { s, scope } = mount()
    await vi.advanceTimersByTimeAsync(0)
    const expires = (serverWindow(T0) + 1) * ROTATE_MS
    const seen: (string | null)[] = []
    while (Date.now() < expires + 2_000) {
      await vi.advanceTimersByTimeAsync(100)
      seen.push(s.qrText.value)
    }
    expect(seen).not.toContain(null)
    scope.stop()
  })

  it('今天報到依時間排序，新的在上；輪詢會更新清單', async () => {
    checkins = [checkin('a', '2026-11-07T09:00:00+08:00', '王小明')]
    const { s, scope } = mount()
    await vi.advanceTimersByTimeAsync(0)
    expect(s.checkins.value.map((c) => c.volunteer_name)).toEqual(['王小明'])
    checkins = [...checkins, checkin('b', '2026-11-07T10:00:03+08:00', '林小華')]
    await vi.advanceTimersByTimeAsync(STATION_POLL_MS)
    expect(s.checkins.value.map((c) => c.volunteer_name)).toEqual(['林小華', '王小明'])
    scope.stop()
  })
})

describe('useStation：斷網不顯示過期的 QR（ADR-024）', () => {
  it('到期前的重新取得失敗：QR 馬上收起來、顯示斷線，並自動重試，恢復後顯示新的 QR', async () => {
    const { s, scope } = mount()
    await vi.advanceTimersByTimeAsync(0)
    const expires = (serverWindow(T0) + 1) * ROTATE_MS
    online = false
    await vi.advanceTimersByTimeAsync(expires - QR_REFRESH_LEAD_MS - Date.now() + 1)
    expect(Date.now()).toBeLessThan(expires) // 還沒到期就收起來
    expect(s.qrText.value).toBeNull()
    expect(s.offline.value).toBe(true)
    expect(s.staleAt.value).not.toBeNull() // StaleBanner 顯示上次成功的時間
    expect(s.secondsLeft.value).toBe(0)

    getMyStation.mockClear()
    await vi.advanceTimersByTimeAsync(QR_RETRY_MS)
    expect(getMyStation).toHaveBeenCalledTimes(1) // 自動重試
    expect(s.qrText.value).toBeNull()

    online = true
    await vi.advanceTimersByTimeAsync(QR_RETRY_MS)
    expect(s.qrText.value).toBe(serverResponse().qr_text)
    expect(s.offline.value).toBe(false)
    expect(s.staleAt.value).toBeNull()
    scope.stop()
  })

  it('只拿到裝置上的舊資料（stale_at）：不顯示裡面的 QR，但今天報到照樣顯示', async () => {
    checkins = [checkin('a', '2026-11-07T09:00:00+08:00', '王小明')]
    getMyStation.mockResolvedValue({ ...serverResponse(), stale_at: '2026-11-07T09:59:00+08:00' })
    const { s, scope } = mount()
    await vi.advanceTimersByTimeAsync(0)
    expect(s.qrText.value).toBeNull()
    expect(s.offline.value).toBe(true)
    expect(s.staleAt.value).toBe('2026-11-07T09:59:00+08:00')
    expect(s.checkins.value).toHaveLength(1)
    expect(s.station.value?.name).toBe('大安關懷據點')
    scope.stop()
  })

  it('一開始就斷網、裝置上也沒有資料：顯示斷線並自動重試', async () => {
    online = false
    const { s, scope } = mount()
    await vi.advanceTimersByTimeAsync(0)
    expect(s.loading.value).toBe(false)
    expect(s.qrText.value).toBeNull()
    expect(s.offline.value).toBe(true)
    expect(s.errorMessage.value).toBeNull()
    online = true
    await vi.advanceTimersByTimeAsync(QR_RETRY_MS)
    expect(s.qrText.value).not.toBeNull()
    scope.stop()
  })

  it('請求卡住沒有回應：QR 過期後就收起來，不繼續顯示', async () => {
    const { s, scope } = mount()
    await vi.advanceTimersByTimeAsync(0)
    const expires = (serverWindow(T0) + 1) * ROTATE_MS
    getMyStation.mockImplementation(() => new Promise(() => {}))
    await vi.advanceTimersByTimeAsync(expires - Date.now() - 1)
    expect(s.qrText.value).not.toBeNull() // 還沒到期
    await vi.advanceTimersByTimeAsync(QR_SWAP_GRACE_MS + 2)
    expect(s.qrText.value).toBeNull()
    scope.stop()
  })

  it('權限錯誤（不是據點帳號）：顯示後端的中文訊息、不自動重試，按重試才再取', async () => {
    getMyStation.mockRejectedValue(new MealApiError('FORBIDDEN_ROLE', '只有據點帳號可以使用', 403))
    const { s, scope } = mount()
    await vi.advanceTimersByTimeAsync(0)
    expect(s.errorMessage.value).toBe('只有據點帳號可以使用')
    expect(s.qrText.value).toBeNull()
    expect(s.offline.value).toBe(false)
    await vi.advanceTimersByTimeAsync(60_000)
    expect(getMyStation).toHaveBeenCalledTimes(1)

    fakeServer()
    s.retry()
    await vi.advanceTimersByTimeAsync(0)
    expect(s.errorMessage.value).toBeNull()
    expect(s.qrText.value).not.toBeNull()
    scope.stop()
  })

  it('離開頁面（scope 結束）後不再取得', async () => {
    const { scope } = mount()
    await vi.advanceTimersByTimeAsync(0)
    scope.stop()
    getMyStation.mockClear()
    await vi.advanceTimersByTimeAsync(120_000)
    expect(getMyStation).not.toHaveBeenCalled()
  })
})

describe('設計 v2 畫面（T-137，design-v2 README §3.5）', () => {
  const cleanups: (() => void)[] = []
  afterEach(() => {
    while (cleanups.length) cleanups.pop()!()
    document.body.innerHTML = ''
  })

  function render(comp: Component, props: Record<string, unknown> = {}) {
    const el = document.createElement('div')
    document.body.appendChild(el)
    const app = createApp({ render: () => h(comp, props) })
    app.use(createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: { render: () => null } }] }))
    app.mount(el)
    cleanups.push(() => app.unmount())
    return el
  }
  const text = (el: Element) => (el.textContent ?? '').replace(/\s+/g, ' ')

  it('QrCountdown：「N 秒後更新」與進度條（剩下的比例）', async () => {
    const el = render(QrCountdown, { seconds: 28, fraction: 0.4 })
    expect(text(el)).toContain('28 秒後更新')
    const bar = el.querySelector('[role="progressbar"]')!
    expect(bar.getAttribute('aria-valuenow')).toBe('40')
    expect((bar.firstElementChild as HTMLElement).style.transform).toBe('scaleX(0.4)')
    const long = render(QrCountdown, { seconds: 1799, fraction: 2 })
    expect(text(long)).toContain('29:59 後更新')
    expect(long.querySelector('[role="progressbar"]')!.getAttribute('aria-valuenow')).toBe('100')
  })

  it('CheckinList：標題「今天報到・N 位」，每列有企鵝頭像、名字、時間', () => {
    const list = [checkin('b', '2026-11-07T11:25:00+08:00', '小雅'), checkin('a', '2026-11-07T11:20:00+08:00', '阿明')]
    const el = render(CheckinList, { checkins: list })
    expect(el.querySelector('h2')!.textContent!.replace(/\s+/g, '')).toBe('今天報到・2位')
    const rows = el.querySelectorAll('li')
    expect(rows).toHaveLength(2)
    expect(rows[0].querySelector('img')).not.toBeNull()
    expect(text(rows[0])).toContain('小雅')
    expect(rows[0].querySelector('time')!.textContent).toBe('11:25')
    const empty = render(CheckinList, { checkins: [] })
    expect(empty.querySelector('h2')!.textContent!.replace(/\s+/g, '')).toBe('今天報到・0位')
    expect(text(empty)).toContain('今天還沒有志工報到')
  })

  it('StationPage：由上而下是頁首、據點名稱、說明、QR、倒數、今天報到、頁尾小字；不顯示「示意」標籤', async () => {
    checkins = [checkin('a', '2026-11-07T09:00:00+08:00', '王小明')]
    const el = render(StationPage)
    await vi.advanceTimersByTimeAsync(1_000)
    const all = text(el)
    const order = ['據點報到', '大安關懷據點', '請志工掃描下方 QR code 報到', '秒後更新', '今天報到・1 位', '王小明', '每次更新後，請掃描最新 QR code']
    const at = order.map((s) => all.indexOf(s))
    expect(at.every((i) => i >= 0)).toBe(true)
    expect([...at].sort((a, b) => a - b)).toEqual(at)
    expect(el.querySelector('h1')!.textContent).toBe('據點報到')
    expect(el.querySelector('svg[role="img"] path')).not.toBeNull() // QR
    expect(el.querySelector('[role="progressbar"]')).not.toBeNull()
    expect(all).not.toMatch(/示意|不可掃描/)
    // 平板或電腦寬度 QR 放大置中，最大 360px
    expect(el.querySelector('[data-testid="station-qr"]')!.className).toMatch(/mx-auto.*sm:max-w-90/)
  })

  it('StationPage：斷網時收起 QR 與倒數，顯示斷線提示（T-119 行為不變）', async () => {
    online = false
    const el = render(StationPage)
    await vi.advanceTimersByTimeAsync(1_000)
    expect(el.querySelector('svg[role="img"]')).toBeNull()
    expect(el.querySelector('[role="progressbar"]')).toBeNull()
    expect(text(el)).toContain('連線中斷，QR 無法更新')
  })

  it('StationPage：權限錯誤顯示後端訊息與「重試」', async () => {
    getMyStation.mockRejectedValue(new MealApiError('FORBIDDEN_ROLE', '只有據點帳號可以使用', 403))
    const el = render(StationPage)
    await vi.advanceTimersByTimeAsync(1_000)
    expect(text(el)).toContain('只有據點帳號可以使用')
    expect([...el.querySelectorAll('button')].some((b) => b.textContent?.includes('重試'))).toBe(true)
  })
})
