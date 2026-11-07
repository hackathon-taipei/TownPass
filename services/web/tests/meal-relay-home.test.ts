import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { effectScope } from 'vue'
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
const STATIONS = [
  { id: 'st-1', name: '社團法人台北市艾馨公益慈善會', location: { lat: 25.03, lng: 121.5 }, source: '臺北市銀髮族服務_社區照顧關懷據點、臺北市門牌位置數值資料' },
  { id: 'st-2', name: '主愛社會關懷協會', location: { lat: 25.02, lng: 121.5 }, source: '臺北市銀髮族服務_社區照顧關懷據點、臺北市門牌位置數值資料' },
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

import * as data from '@/features/meal-relay/data'
import { homeEntryOf, openLink, stationSourceText, STATION_SOURCE_DEFAULT, useHome, VOLUNTEER_LINKS } from '@/features/meal-relay/logic/home'

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

describe('依角色進入（§9，用 ?as= 切換測試帳號）', () => {
  it.each([
    ['u-vol-1', 'volunteer', '進入志工頁'],
    ['u-sup-1', 'supplier', '進入提供者頁'],
    ['u-st-1', 'station', '進入據點頁'],
  ])('%s 導向 %s', async (as, route, label) => {
    const { home, stop } = startHome(as)
    await home.ready
    expect(home.me.value?.id).toBe(as)
    expect(home.entry.value).toMatchObject({ kind: 'enter', route, label, to: { name: `meal-relay.${route}` } })
    stop()
  })

  it('u-cit-1（citizen）留在首頁，顯示「我要提供食物」→ supplier', async () => {
    const { home, stop } = startHome('u-cit-1')
    await home.ready
    expect(home.me.value?.role).toBe('citizen')
    expect(home.entry.value).toMatchObject({ kind: 'offer_food', label: '我要提供食物', route: 'supplier', to: { name: 'meal-relay.supplier' } })
    stop()
  })

  it('沒匯入的帳號是 citizen，一樣顯示「我要提供食物」（V2）', async () => {
    const { home, stop } = startHome('someone-new')
    await home.ready
    expect(home.entry.value?.label).toBe('我要提供食物')
    stop()
  })

  it('admin 沒有任何進入按鈕（首頁不放管理系統連結）', async () => {
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
    const files = ['ui/HomePage.vue', 'ui/HomeEntryCard.vue', 'ui/HomeIntro.vue', 'ui/HomeStationList.vue', 'ui/HomeVolunteerInfo.vue', 'logic/home.ts']
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
})

describe('志工從哪裡來（§1）', () => {
  it('列出臺北市志工管理整合平臺、臺北 E 大與志願服務管理及運用原則', () => {
    expect(VOLUNTEER_LINKS.map((l) => l.url)).toEqual([
      'https://newcv101.gov.taipei/',
      'https://elearning.taipei/mpage/',
      'https://laws.gov.taipei/law/LawSearch/LawExport/FL101070?type=0',
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
