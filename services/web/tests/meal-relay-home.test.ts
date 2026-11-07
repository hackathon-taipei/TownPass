import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createApp, defineComponent, effectScope, nextTick } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// 鄰食轉運站首頁 MR-P01（T-116，logic/home.ts）。資料層 getMe／listStations 用 mock；
// 帳號 id 由真的 currentAccountId() 從網址 ?as= 讀出，對照種子帳號（seed/accounts.json）回傳角色。

const SEED_ROLES: Record<string, string> = {
  'u-cit-1': 'citizen',
  'u-vol-1': 'volunteer',
  'u-sup-1': 'supplier',
  'u-st-1': 'station',
  'u-admin-1': 'admin',
}
const SRC = '臺北市銀髮族服務_社區照顧關懷據點、臺北市門牌位置數值資料'
const STATIONS = [
  { id: 'st-1', name: '社團法人台北市艾馨公益慈善會', location: { lat: 25.03, lng: 121.5 }, source: SRC, image_url: null, address: '臺北市信義區示範路一段 1 號' },
  { id: 'st-2', name: '主愛社會關懷協會', location: { lat: 25.02, lng: 121.5 }, source: SRC, image_url: null, address: '' },
]

const bridge = vi.hoisted(() => ({ inApp: false, send: vi.fn() }))
vi.mock('@/platform/bridge', () => ({
  isInApp: () => bridge.inApp,
  send: bridge.send,
  request: () => Promise.reject(new Error('no app')),
}))

vi.mock('@/features/meal-relay/data', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/features/meal-relay/data')>()
  return {
    ...real,
    getMe: vi.fn(async () => {
      const id = await real.currentAccountId()
      return { id, role: SEED_ROLES[id] ?? 'citizen', name: `${id}（模擬）`, station_id: null, supplier: null }
    }),
    listStations: vi.fn(async () => STATIONS),
  }
})

// 地圖（Leaflet）在 happy-dom 裡畫不出來：換成把定位針列成清單的替身，檢查「只有這個據點」
vi.mock('@/features/meal-relay/ui/MapView.vue', async () => {
  const { defineComponent, h } = await import('vue')
  return {
    default: defineComponent({
      props: { markers: { type: Array, required: true }, center: Object },
      setup: (props) => () =>
        h('ul', { 'data-testid': 'map' }, (props.markers as { id: string; kind: string }[]).map((m) => h('li', { 'data-kind': m.kind }, m.id))),
    }),
  }
})

import * as data from '@/features/meal-relay/data'
import HomePage from '@/features/meal-relay/ui/HomePage.vue'
import {
  homeEntryOf,
  openLink,
  stationAddressText,
  stationMarkersOf,
  stationSourceText,
  STATION_SOURCE_DEFAULT,
  useHome,
  useStationSheet,
  VOLUNTEER_LINKS,
} from '@/features/meal-relay/logic/home'

function startHome(as: string) {
  window.location.hash = `#/f/meal-relay?as=${as}`
  const scope = effectScope()
  const home = scope.run(() => useHome())!
  return { home, stop: () => scope.stop() }
}

beforeEach(() => {
  localStorage.clear()
  bridge.inApp = false
  bridge.send.mockClear()
})
afterEach(() => {
  window.location.hash = ''
})

describe('依角色進入（§9、設計 v2 §2，用 ?as= 切換測試帳號）', () => {
  it.each([
    ['u-cit-1', 'citizen', '我要提供食物', 'supplier'],
    ['u-sup-1', 'supplier', '管理我的食物', 'supplier'],
    ['u-vol-1', 'volunteer', '進入志工頁', 'volunteer'],
    ['u-st-1', 'station', '打開報到 QR', 'station'],
  ])('%s（%s）「%s」→ %s', async (as, role, label, route) => {
    const { home, stop } = startHome(as)
    await home.ready
    expect(home.me.value?.id).toBe(as)
    expect(home.entry.value).toMatchObject({ role, route, label, to: { name: `meal-relay.${route}` } })
    stop()
  })

  it('沒匯入的帳號是 citizen，一樣顯示「我要提供食物」（V2）', async () => {
    const { home, stop } = startHome('someone-new')
    await home.ready
    expect(home.entry.value?.label).toBe('我要提供食物')
    stop()
  })

  it('admin 沒有任何按鈕（首頁不放管理系統連結）', async () => {
    const { home, stop } = startHome('u-admin-1')
    await home.ready
    expect(home.me.value?.role).toBe('admin')
    expect(home.entry.value).toBeNull()
    stop()
  })
})

describe('沒有選角色按鈕、沒有管理系統連結（§2、§9）', () => {
  const roles = ['citizen', 'volunteer', 'supplier', 'station', 'admin'] as const

  it('每個角色最多一個按鈕，而且只通往自己的頁面', () => {
    const own: Record<string, string | null> = { citizen: 'supplier', volunteer: 'volunteer', supplier: 'supplier', station: 'station', admin: null }
    for (const role of roles) expect(homeEntryOf(role)?.route ?? null).toBe(own[role])
  })

  it('任何角色的按鈕都不會通往 admin', () => {
    for (const role of roles) expect(JSON.stringify(homeEntryOf(role))).not.toContain('admin')
  })

  it('首頁與首頁元件沒有 admin 路由、沒有切換身分（setAccountId）', () => {
    const dir = resolve(__dirname, '../src/features/meal-relay')
    const files = ['ui/HomePage.vue', 'ui/HomeEntryCard.vue', 'ui/HomeIntro.vue', 'ui/HomeStationList.vue', 'ui/HomeStationSheet.vue', 'ui/HomeVolunteerInfo.vue', 'logic/home.ts']
    for (const f of files) {
      const src = readFileSync(resolve(dir, f), 'utf8')
      expect(src, f).not.toMatch(/featureRoute\([^)]*'admin'|meal-relay\.admin|\/admin['"`]/)
      expect(src, f).not.toMatch(/setAccountId|切換為/)
    }
  })
})

describe('據點清單與資料來源', () => {
  it('列出 listStations 的據點', async () => {
    const { home, stop } = startHome('u-cit-1')
    await home.ready
    expect(home.stations.value?.map((s) => s.name)).toEqual(['社團法人台北市艾馨公益慈善會', '主愛社會關懷協會'])
    stop()
  })

  it('SourceNote 文字是據點來源去重後串起來', () => {
    expect(stationSourceText(STATIONS)).toBe('臺北市銀髮族服務_社區照顧關懷據點、臺北市門牌位置數值資料')
  })

  it('沒有據點時用預設來源', () => {
    expect(stationSourceText([])).toBe(STATION_SOURCE_DEFAULT)
  })

  it('地址沒填（空字串）時顯示「地址未提供」', () => {
    expect(stationAddressText(STATIONS[0])).toBe('臺北市信義區示範路一段 1 號')
    expect(stationAddressText(STATIONS[1])).toBe('地址未提供')
  })

  it('面板地圖只有這個據點一根定位針', () => {
    expect(stationMarkersOf(STATIONS[0])).toEqual([{ id: 'st-1', kind: 'station', location: STATIONS[0].location, label: STATIONS[0].name }])
  })
})

describe('據點面板的開關與捲動位置（useStationSheet）', () => {
  it('打開記下捲動位置，關閉（v-model 設 false）後捲回原位', async () => {
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
    Object.defineProperty(window, 'scrollY', { value: 640, configurable: true })
    const scope = effectScope()
    const sheet = scope.run(() => useStationSheet())!
    sheet.openStation(STATIONS[0])
    expect(sheet.open.value).toBe(true)
    expect(sheet.station.value?.id).toBe('st-1')
    Object.defineProperty(window, 'scrollY', { value: 0, configurable: true })
    sheet.open.value = false
    await nextTick()
    expect(sheet.open.value).toBe(false)
    expect(sheet.station.value?.id).toBe('st-1') // 關閉動畫期間內容還在
    expect(scrollTo).toHaveBeenCalledWith({ top: 640 })
    scope.stop()
    scrollTo.mockRestore()
  })
})

describe('志工從哪裡來（§1）', () => {
  it('列出臺北市志工管理整合平臺、臺北 E 大與志願服務管理及運用原則', () => {
    expect(VOLUNTEER_LINKS.map((l) => l.url)).toEqual([
      'https://newcv101.gov.taipei/',
      'https://elearning.taipei/mpage/',
      'https://laws.gov.taipei/law/LawSearch/LawPrint/FL101070?type=0',
    ])
  })

  it('在 App 裡用 bridge open_link 開啟', () => {
    bridge.inApp = true
    openLink('https://newcv101.gov.taipei/')
    expect(bridge.send).toHaveBeenCalledWith('open_link', 'https://newcv101.gov.taipei/')
  })

  it('一般瀏覽器開新分頁', () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null)
    openLink('https://elearning.taipei/mpage/')
    expect(open).toHaveBeenCalledWith('https://elearning.taipei/mpage/', '_blank', 'noopener')
    expect(bridge.send).not.toHaveBeenCalled()
    open.mockRestore()
  })
})

describe('讀取失敗與離線（§7、ADR-024）', () => {
  it('getMe 失敗時顯示後端回傳的中文訊息，沒有進入按鈕', async () => {
    vi.mocked(data.getMe).mockRejectedValueOnce(new data.MealApiError('UNAUTHENTICATED', '請先登入', 401))
    const { home, stop } = startHome('u-vol-1')
    await home.ready
    expect(home.me.value).toBeNull()
    expect(home.meError.value).toBe('請先登入')
    expect(home.entry.value).toBeNull()
    stop()
  })

  it('連不上又沒有快取：顯示 OFFLINE 的中文訊息，據點清單另外顯示錯誤', async () => {
    vi.mocked(data.listStations).mockRejectedValueOnce(new data.MealApiError('OFFLINE', '目前連不上伺服器，請稍後再試', 0))
    const { home, stop } = startHome('u-cit-1')
    await home.ready
    expect(home.stations.value).toBeNull()
    expect(home.stationsError.value).toBe('目前連不上伺服器，請稍後再試')
    expect(home.entry.value?.label).toBe('我要提供食物')
    stop()
  })

  it('不是 MealApiError 的錯誤用預設文字', async () => {
    vi.mocked(data.getMe).mockRejectedValueOnce(new Error('boom'))
    const { home, stop } = startHome('u-vol-1')
    await home.ready
    expect(home.meError.value).toBe('讀不到你的身分，請稍後再試')
    stop()
  })

  it('快取資料（stale_at）會傳給 StaleBanner，角色導向照舊', async () => {
    const savedAt = '2026-11-07T09:00:00+08:00'
    vi.mocked(data.getMe).mockResolvedValueOnce({ id: 'u-vol-1', role: 'volunteer', name: '志工', station_id: 'st-1', supplier: null, stale_at: savedAt })
    const { home, stop } = startHome('u-vol-1')
    await home.ready
    expect(home.staleAt.value).toBe(savedAt)
    expect(home.entry.value?.route).toBe('volunteer')
    stop()
  })

  it('線上資料沒有 staleAt', async () => {
    const { home, stop } = startHome('u-vol-1')
    await home.ready
    expect(home.staleAt.value).toBeNull()
    stop()
  })

  it('重新讀取（load）會再呼叫 getMe', async () => {
    vi.mocked(data.getMe).mockRejectedValueOnce(new data.MealApiError('OFFLINE', '目前連不上伺服器，請稍後再試', 0))
    const { home, stop } = startHome('u-sup-1')
    await home.ready
    expect(home.entry.value).toBeNull()
    await home.load()
    expect(home.entry.value?.route).toBe('supplier')
    stop()
  })
})

describe('畫面 MR-P01（實際渲染 HomePage，設計 v2）', () => {
  const Stub = defineComponent({ render: () => null })
  const ROUTES = ['volunteer', 'supplier', 'station', 'admin'] as const

  async function settle(el: Element) {
    for (let i = 0; i < 20 && el.querySelector('[aria-label="載入中"]'); i++) {
      await new Promise((r) => setTimeout(r, 10))
      await nextTick()
    }
    await nextTick()
  }

  /** 用 ?as= 帳號渲染首頁，等 getMe／listStations 與轉場結束 */
  async function renderHome(as: string) {
    window.location.hash = `#/f/meal-relay?as=${as}`
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/f/meal-relay', name: 'meal-relay.home', component: Stub },
        ...ROUTES.map((r) => ({ path: `/f/meal-relay/${r}`, name: `meal-relay.${r}`, component: Stub })),
      ],
    })
    await router.push('/f/meal-relay')
    const el = document.createElement('div')
    document.body.appendChild(el)
    const app = createApp(HomePage).use(router)
    app.mount(el)
    await settle(el)
    const links = [...el.querySelectorAll('a')].map((a) => ({ text: a.textContent?.trim() ?? '', href: a.getAttribute('href') ?? '' }))
    const buttons = [...el.querySelectorAll('button')].map((b) => b.textContent?.trim() ?? '')
    return { el, router, links, buttons, unmount: () => (app.unmount(), el.remove()) }
  }

  const sheetEl = () => document.body.querySelector('[role="dialog"]')
  const buttonOf = (root: Element, text: string) => [...root.querySelectorAll('button')].find((b) => b.textContent?.includes(text))!
  const VOLUNTEER_LABELS = VOLUNTEER_LINKS.map((l) => l.label)
  const STATION_BUTTONS = STATIONS.map((s) => `${s.name}${stationAddressText(s)}`)

  it.each([
    ['u-cit-1', '我要提供食物', '/f/meal-relay/supplier'],
    ['u-sup-1', '管理我的食物', '/f/meal-relay/supplier'],
    ['u-vol-1', '進入志工頁', '/f/meal-relay/volunteer'],
    ['u-st-1', '打開報到 QR', '/f/meal-relay/station'],
  ])('%s 只有一個主按鈕「%s」→ %s，點下去就到那一頁', async (as, text, href) => {
    const { el, router, links, unmount } = await renderHome(as)
    expect(links).toEqual([{ text, href }])
    el.querySelector('a')!.click()
    await new Promise((r) => setTimeout(r, 0))
    expect(router.currentRoute.value.path).toBe(href)
    unmount()
  })

  it('u-admin-1：沒有主按鈕，也沒有管理系統連結', async () => {
    const { el, links, unmount } = await renderHome('u-admin-1')
    expect(el.textContent).toContain('附近關懷據點')
    expect(links).toEqual([])
    expect(el.innerHTML).not.toContain('/admin')
    expect(el.textContent).not.toMatch(/我要提供食物|管理我的食物|進入志工頁|打開報到 QR/)
    unmount()
  })

  it.each(['u-cit-1', 'u-vol-1', 'u-admin-1'])('%s：按鈕只有據點列、想成為志工？與志工管道，沒有選角色或切換身分', async (as) => {
    const { el, buttons, unmount } = await renderHome(as)
    expect(buttons).toEqual([...STATION_BUTTONS, '想成為志工？', ...VOLUNTEER_LABELS])
    expect(el.textContent).not.toMatch(/切換|選擇身分|選角色|管理系統/)
    unmount()
  })

  it('元素順序照 README §3.1：主視覺、主按鈕、提醒卡、附近關懷據點、想成為志工？、資料來源', async () => {
    const { el, unmount } = await renderHome('u-cit-1')
    const text = el.textContent ?? ''
    const order = ['把多出來的食物，', '我要提供食物', '長者不用操作 App', '附近關懷據點', '想成為志工？', '資料來源：']
    const at = order.map((t) => text.indexOf(t))
    expect(at.every((i) => i >= 0)).toBe(true)
    expect([...at].sort((a, b) => a - b)).toEqual(at)
    expect(text).toContain('需要送餐或關懷，請洽里長或社區關懷據點')
    expect(text).toContain(`資料來源：${SRC}`)
    unmount()
  })

  it('據點列顯示名稱與地址（沒填顯示「地址未提供」）', async () => {
    const { el, unmount } = await renderHome('u-cit-1')
    const rows = [...el.querySelectorAll('li')].map((li) => li.textContent ?? '')
    expect(rows.some((t) => t.includes(STATIONS[0].name) && t.includes(STATIONS[0].address))).toBe(true)
    expect(rows.some((t) => t.includes(STATIONS[1].name) && t.includes('地址未提供'))).toBe(true)
    unmount()
  })

  it('點據點開出底部面板：標題是據點名稱、地址正確、地圖只有這個據點；關閉後面板消失', async () => {
    const { el, unmount } = await renderHome('u-cit-1')
    expect(sheetEl()).toBeNull()
    buttonOf(el, STATIONS[0].name).click()
    await nextTick()
    const sheet = sheetEl()!
    expect(sheet).not.toBeNull()
    expect(sheet.getAttribute('aria-label')).toBe(STATIONS[0].name)
    expect(sheet.querySelector('[data-testid="station-address"]')?.textContent).toBe(STATIONS[0].address)
    const pins = [...sheet.querySelectorAll('[data-testid="map"] li')]
    expect(pins.map((p) => [p.textContent, p.getAttribute('data-kind')])).toEqual([['st-1', 'station']])
    buttonOf(sheet, '關閉').click()
    await new Promise((r) => setTimeout(r, 400))
    await nextTick()
    expect(sheetEl()).toBeNull()
    unmount()
  })

  it('點另一個據點，面板換成那個據點的地址', async () => {
    const { el, unmount } = await renderHome('u-cit-1')
    buttonOf(el, STATIONS[1].name).click()
    await nextTick()
    expect(sheetEl()?.querySelector('[data-testid="station-address"]')?.textContent).toBe('地址未提供')
    expect([...sheetEl()!.querySelectorAll('[data-testid="map"] li')].map((p) => p.textContent)).toEqual(['st-2'])
    unmount()
    await new Promise((r) => setTimeout(r, 0))
  })

  it('「想成為志工？」預設收合，展開後看得到 3 個連結', async () => {
    const { el, unmount } = await renderHome('u-cit-1')
    const header = buttonOf(el, '想成為志工？')
    const body = el.querySelector(`[id="${header.getAttribute('aria-controls')}"]`)!
    expect(header.getAttribute('aria-expanded')).toBe('false')
    expect(body.hasAttribute('inert')).toBe(true)
    header.click()
    await nextTick()
    expect(header.getAttribute('aria-expanded')).toBe('true')
    expect(body.hasAttribute('inert')).toBe(false)
    expect([...body.querySelectorAll('button')].map((b) => b.textContent?.trim())).toEqual(VOLUNTEER_LABELS)
    unmount()
  })

  it('志工管道按鈕在 App 裡用 bridge open_link 開啟', async () => {
    bridge.inApp = true
    const { el, unmount } = await renderHome('u-cit-1')
    buttonOf(el, '臺北 E 大').click()
    expect(bridge.send).toHaveBeenCalledWith('open_link', 'https://elearning.taipei/mpage/')
    unmount()
  })

  it('讀不到身分時顯示訊息與「重新讀取」，按下後出現主按鈕', async () => {
    vi.mocked(data.getMe).mockRejectedValueOnce(new data.MealApiError('OFFLINE', '目前連不上伺服器，請稍後再試', 0))
    const { el, unmount } = await renderHome('u-vol-1')
    expect(el.textContent).toContain('讀不到你的身分')
    buttonOf(el, '重新讀取').click()
    await new Promise((r) => setTimeout(r, 0))
    for (let i = 0; i < 50 && !el.querySelector('a'); i++) await new Promise((r) => setTimeout(r, 20))
    expect(el.querySelector('a')?.textContent?.trim()).toBe('進入志工頁')
    unmount()
  })

  it('讀不到據點清單時有「重新讀取」', async () => {
    vi.mocked(data.listStations).mockRejectedValueOnce(new data.MealApiError('OFFLINE', '目前連不上伺服器，請稍後再試', 0))
    const { el, unmount } = await renderHome('u-cit-1')
    expect(el.textContent).toContain('讀不到據點清單')
    buttonOf(el, '重新讀取').click()
    await new Promise((r) => setTimeout(r, 0))
    await settle(el)
    expect(el.textContent).toContain(STATIONS[0].name)
    unmount()
  })

  it('斷網用快取資料時顯示 StaleBanner', async () => {
    const staleAt = new Date(Date.now() - 5 * 60_000).toISOString()
    vi.mocked(data.getMe).mockResolvedValueOnce({ id: 'u-cit-1', role: 'citizen', name: '市民', station_id: null, supplier: null, stale_at: staleAt })
    const { el, unmount } = await renderHome('u-cit-1')
    expect(el.textContent).toContain('目前離線')
    unmount()
  })
})
