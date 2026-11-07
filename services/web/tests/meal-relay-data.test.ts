import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// 鄰食轉運站資料層（T-107、T-123）：X-Demo-User、?as=、錯誤格式、斷網快取。全部用假的 fetch，不連網路。

async function freshData() {
  vi.resetModules()
  return import('@/features/meal-relay/data')
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

const headerOf = (init: RequestInit | undefined, name: string) => (init?.headers as Record<string, string>)[name]

describe('meal-relay data layer', () => {
  beforeEach(() => {
    localStorage.clear()
    window.history.replaceState(null, '', '/')
  })
  afterEach(() => vi.unstubAllGlobals())

  it('sends X-Demo-User from the TownPass userinfo id (browser mock)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(json({ id: 'mock-user', role: 'citizen', name: '', station_id: null, supplier: null }))
    vi.stubGlobal('fetch', fetchMock)
    const d = await freshData()
    const me = await d.getMe()
    expect(me.role).toBe('citizen') // ADR-026：沒匯入的帳號是一般市民
    expect(me).not.toHaveProperty('elder')
    const [url, init] = fetchMock.mock.calls[0]!
    expect(String(url)).toMatch(/\/meal-relay\/me$/)
    expect(headerOf(init, 'X-Demo-User')).toBe('mock-user')
  })

  it('uses ?as= from the hash route and keeps it on the device', async () => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(json([])))
    vi.stubGlobal('fetch', fetchMock)
    window.history.replaceState(null, '', '/#/f/meal-relay/admin?as=u-admin-1')
    const d = await freshData()
    await d.listSuppliers('pending')
    const [url, init] = fetchMock.mock.calls[0]!
    expect(String(url)).toMatch(/\/meal-relay\/suppliers\?status=pending$/)
    expect(headerOf(init, 'X-Demo-User')).toBe('u-admin-1')

    window.history.replaceState(null, '', '/#/f/meal-relay/admin') // 網址拿掉 ?as= 後仍沿用
    await d.listStations()
    expect(headerOf(fetchMock.mock.calls[1]![1], 'X-Demo-User')).toBe('u-admin-1')
    expect(await d.currentAccountId()).toBe('u-admin-1')
  })

  it('turns the backend error detail into MealApiError', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({ detail: { code: 'INVALID_STATE', message: '這筆申請已經取消' } }, 409)))
    const d = await freshData()
    const err = await d.pickupClaim('c-1').catch((e: unknown) => e)
    expect(err).toBeInstanceOf(d.MealApiError)
    expect(err).toMatchObject({ code: 'INVALID_STATE', message: '這筆申請已經取消', status: 409 })
  })

  it('exposes no elder-account or manual-claim functions; createElder returns the Elder (ADR-025, ADR-026)', async () => {
    const elder = { id: 'e-99', alias: '測試阿嬤', station_id: 'st-1' }
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(json(elder)))
    vi.stubGlobal('fetch', fetchMock)
    const d = (await freshData()) as Record<string, unknown>
    const removed = [
      'createClaim', 'listStationClaims', 'listPickupClaims', 'acceptClaim', 'confirmPickup',
      'getMyElder', 'listMyElderVisits', 'upsertMyElder', 'findNearbyElders', 'mergeElder',
    ]
    for (const name of removed) expect(d[name]).toBeUndefined()
    const create = d.createElder as (body: unknown) => Promise<unknown>
    const body = { alias: '測試阿嬤', location: { lat: 25.03, lng: 121.5 }, station_id: 'st-1' }
    expect(await create(body)).toEqual(elder)
    const [url, init] = fetchMock.mock.calls[0]!
    expect(String(url)).toMatch(/\/meal-relay\/elders$/)
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body)).toEqual(body)
  })

  it('HttpError carries the JSON detail (platform/http)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({ detail: { code: 'NOT_FOUND', message: 'x' } }, 404)))
    vi.resetModules()
    const { api, HttpError } = await import('@/platform/http')
    const err = await api('/x').catch((e: unknown) => e)
    expect(err).toBeInstanceOf(HttpError)
    expect((err as InstanceType<typeof HttpError>).detail).toEqual({ code: 'NOT_FOUND', message: 'x' })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('oops', { status: 500 })))
    const plain = await api('/x').catch((e: unknown) => e)
    expect((plain as InstanceType<typeof HttpError>).detail).toBeUndefined()
  })

  it('returns the last successful read with stale_at when offline', async () => {
    const foods = [{ id: 'f-1', name: '排骨便當（模擬）' }]
    const fetchMock = vi.fn().mockResolvedValueOnce(json(foods)).mockRejectedValue(new TypeError('Failed to fetch'))
    vi.stubGlobal('fetch', fetchMock)
    const d = await freshData()
    const online = await d.listFoods({ category: 'meal_box' })
    expect(online.stale_at).toBeUndefined()
    const offline = await d.listFoods({ category: 'meal_box' })
    expect(offline.map((f) => f.id)).toEqual(['f-1'])
    expect(typeof offline.stale_at).toBe('string')
    // 沒存過的讀取：斷網直接失敗
    await expect(d.getBoard()).rejects.toMatchObject({ code: 'OFFLINE', status: 0 })
  })

  it('never caches writes and fails them when offline', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))
    vi.stubGlobal('fetch', fetchMock)
    const d = await freshData()
    await expect(d.checkIn('meal-relay:checkin:ABC:0123456789')).rejects.toMatchObject({ code: 'OFFLINE' })
    const [, init] = fetchMock.mock.calls[0]!
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body)).toEqual({ qr_text: 'meal-relay:checkin:ABC:0123456789' })
    const cacheKeys = Object.keys(localStorage).filter((k) => k.includes('meal-relay.cache.'))
    expect(cacheKeys).toEqual([])
  })

  it('re-throws 403 even when an older copy is cached', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json({ stations: [], points: [], foods: [], elders: [], claims: [], stats: {} }))
      .mockResolvedValue(json({ detail: { code: 'FORBIDDEN_ROLE', message: '這個角色不能使用這個功能' } }, 403))
    vi.stubGlobal('fetch', fetchMock)
    const d = await freshData()
    await d.getBoard()
    await expect(d.getBoard()).rejects.toMatchObject({ code: 'FORBIDDEN_ROLE', status: 403 })
  })

  it('maps a bare 401 without detail to UNAUTHENTICATED', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 401 })))
    const d = await freshData()
    await expect(d.getMe()).rejects.toMatchObject({ code: 'UNAUTHENTICATED', status: 401 })
  })

  it('builds image URLs and upload bodies', async () => {
    const fetchMock = vi.fn().mockResolvedValue(json({ id: 'img-1', image_url: '/meal-relay/images/img-1', mime: 'image/png', size: 3 }))
    vi.stubGlobal('fetch', fetchMock)
    const d = await freshData()
    await d.uploadImage('data:image/png;base64,AAAA')
    expect(JSON.parse(fetchMock.mock.calls[0]![1].body)).toEqual({ data_url: 'data:image/png;base64,AAAA' })
    expect(await d.getImage('img-1')).toMatch(/^https?:\/\/.+\/meal-relay\/images\/img-1$/)
    expect(d.imageSrc(null)).toBeNull()
  })
})
