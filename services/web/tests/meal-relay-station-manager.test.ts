import { describe, expect, it, vi, beforeEach } from 'vitest'
import { createApp, effectScope, h, nextTick, ref } from 'vue'
import type { Elder, Station } from '@/features/meal-relay/data'
import * as data from '@/features/meal-relay/data'
import { stationDraftError, stationElders, useStationManager } from '@/features/meal-relay/logic/stationManager'
import StationManager from '@/features/meal-relay/ui/StationManager.vue'

vi.mock('@/features/meal-relay/ui/MapView.vue', async () => {
  const { defineComponent, h } = await import('vue')
  return { default: defineComponent({
    props: { markers: Array, onPick: Function, onMarkerSelect: Function },
    setup: (props) => () => h('div', [
      h('button', { 'data-test': 'pick', onClick: () => props.onPick?.({ lat: 25.05, lng: 121.53 }) }, '地圖選位置'),
      h('button', { 'data-test': 'pin', onClick: () => props.onMarkerSelect?.({ id: 's2' }) }, '據點定位針'),
    ]),
  }) }
})

vi.mock('@/features/meal-relay/data', async (original) => ({
  ...await original<typeof import('@/features/meal-relay/data')>(),
  createStation: vi.fn(), updateStation: vi.fn(), deleteStation: vi.fn(),
}))
const api = vi.mocked(data)
const location = { lat: 25.03, lng: 121.51 }
const station = (id: string): Station => ({ id, name: `據點${id}`, address: '', source: '模擬', location })
// 篩選只使用授權管理名冊的 station_id，不以座標或名字推斷歸屬。
const elders = [{ id: 'e1', station_id: 's1' }, { id: 'e2', station_id: 's2' }] as Elder[]

function setup() {
  const stations = ref([station('s1'), station('s2')])
  const offline = ref(false)
  const refresh = vi.fn(async () => {})
  const scope = effectScope()
  const manager = scope.run(() => useStationManager({ stations, elders: ref(elders), offline, refresh }))!
  return { manager, stations, offline, refresh, scope }
}
beforeEach(() => vi.resetAllMocks())
describe('管理員據點操作', () => {
  it('依據點ID精確篩長者；未選據點不列出任何長者', () => {
    expect(stationElders(elders, 's1').map(e => e.id)).toEqual(['e1'])
    expect(stationElders(elders, 'empty')).toEqual([])
    expect(stationElders(elders, null)).toEqual([])
  })
  it('檢視模式點地圖不改位置；修改時才允許選點，選其他據點不會覆蓋草稿', () => {
    const { manager: m, scope } = setup()
    m.pick(location)
    expect(m.draft.value.location).toBeNull()
    m.select('s2')
    expect(m.elders.value.map(e => e.id)).toEqual(['e2'])
    m.start(false)
    m.pick({ lat: 25.04, lng: 121.52 })
    m.select('s1')
    expect(m.selectedId.value).toBe('s2')
    expect(m.draft.value.location?.lat).toBe(25.04)
    m.cancel()
    expect(m.mode.value).toBe('view')
    scope.stop()
  })
  it('新增修剪文字，只送允許欄位；儲存後更新共用資料及選取', async () => {
    const { manager: m, stations, refresh, scope } = setup()
    const created = { ...station('s3'), name: '新據點' }
    api.createStation.mockResolvedValue(created)
    refresh.mockImplementation(async () => { stations.value = [...stations.value, created] })
    m.start(true)
    m.draft.value = { name: ' 新據點 ', address: ' 模擬地址 ', location }
    expect(await m.save()).toBe(true)
    expect(api.createStation).toHaveBeenCalledWith({ name: '新據點', address: '模擬地址', location })
    expect(refresh).toHaveBeenCalledOnce()
    expect(m.selectedId.value).toBe('s3')
    expect(m.mode.value).toBe('view')
    scope.stop()
  })
  it('修改只呼叫PATCH且離線時不會送出或變動位置', async () => {
    const { manager: m, offline, scope } = setup()
    api.updateStation.mockResolvedValue(station('s1'))
    m.start(false)
    expect(await m.save()).toBe(true)
    expect(api.updateStation).toHaveBeenCalledWith('s1', { name: '據點s1', address: '', location })
    offline.value = true
    m.start(true)
    expect(m.mode.value).toBe('view')
    m.askDelete()
    expect(m.confirmingDelete.value).toBe(false)
    expect(await m.remove()).toBe(false)
    expect(api.deleteStation).not.toHaveBeenCalled()
    scope.stop()
  })
  it('刪除先確認；409保留選取及清單，成功後重讀清除失效選取', async () => {
    const { manager: m, stations, refresh, scope } = setup()
    m.askDelete()
    expect(m.confirmingDelete.value).toBe(true)
    expect(api.deleteStation).not.toHaveBeenCalled()
    api.deleteStation.mockRejectedValueOnce(new data.MealApiError('STATION_IN_USE', '據點仍有長者', 409))
    expect(await m.remove()).toBe(false)
    expect(m.error.value).toBe('據點仍有長者')
    expect(stations.value).toHaveLength(2)
    api.deleteStation.mockResolvedValueOnce(undefined)
    refresh.mockImplementation(async () => { stations.value = [station('s2')] })
    expect(await m.remove()).toBe(true)
    await nextTick()
    expect(m.selectedId.value).toBe('s2')
    stations.value = []
    await nextTick()
    expect(m.selected.value).toBeNull()
    expect(m.elders.value).toEqual([])
    scope.stop()
  })
  it('名稱、位置、長度驗證；失敗保留草稿及顯示後端原因', async () => {
    expect(stationDraftError({ name: ' ', address: '', location })).toBeTruthy()
    expect(stationDraftError({ name: '有效', address: '', location: null })).toBeTruthy()
    expect(stationDraftError({ name: '有效', address: '', location: { lat: 91, lng: 121 } })).toBeTruthy()
    const { manager: m, scope } = setup()
    m.start(true)
    expect(await m.save()).toBe(false)
    expect(api.createStation).not.toHaveBeenCalled()
    m.draft.value = { name: '保留', address: '', location }
    api.createStation.mockRejectedValue(new data.MealApiError('OFFLINE', '目前連不上伺服器', 0))
    expect(await m.save()).toBe(false)
    expect(m.draft.value.name).toBe('保留')
    expect(m.error.value).toBe('目前連不上伺服器')
    expect(m.busy.value).toBe(false)
    scope.stop()
  })
  it('畫面pin能切換所屬長者；新增表單明確選點後才可儲存', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    const people = elders.map(e => ({ ...e, alias: e.id, allergens: [], meal_due: false, care_due: false })) as Elder[]
    const app = createApp({ render: () => h(StationManager, { stations: [station('s1'), station('s2')], elders: people, offline: false, onRefresh: async () => {} }) })
    app.mount(host)
    const click = async (selector: string) => { host.querySelector<HTMLButtonElement>(selector)!.click(); await nextTick() }
    expect(host.textContent).toContain('e1')
    await click('[data-test="pin"]')
    expect(host.textContent).toContain('e2')
    expect(host.textContent).not.toContain('e1')
    const add = [...host.querySelectorAll('button')].find(b => b.textContent === '新增據點')!
    add.click(); await nextTick()
    expect(host.textContent).toContain('尚未選位置')
    await click('[data-test="pick"]')
    expect(host.textContent).toContain('25.050000')
    expect(host.textContent).toContain('121.530000')
    app.unmount(); host.remove()
  })
  it('初次讀取失敗即使沒有stale快取也禁止寫入，名冊不冒充零位並可重試', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    const refresh = vi.fn(async () => {})
    const app = createApp({ render: () => h(StationManager, { stations: [station('s1')], elders: [], offline: false, loadError: '名冊讀取失敗', onRefresh: refresh }) })
    app.mount(host)
    expect(host.textContent).toContain('名冊讀取失敗')
    expect(host.textContent).not.toContain('所屬長者（0）')
    for (const text of ['新增據點', '修改據點', '刪除據點']) {
      expect([...host.querySelectorAll('button')].find(b => b.textContent === text)?.disabled).toBe(true)
    }
    ;[...host.querySelectorAll('button')].find(b => b.textContent === '重新讀取')!.click()
    await nextTick()
    expect(refresh).toHaveBeenCalledOnce()
    app.unmount(); host.remove()
  })
})
