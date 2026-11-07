import { describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick, ref } from 'vue'
import MapView from '@/features/meal-relay/ui/MapView.vue'

const fake = vi.hoisted(() => ({ handlers: {} as Record<string, (...args: any[]) => void> }))
vi.mock('leaflet', () => ({ default: {
  map: (element: HTMLElement) => {
    // Leaflet 在 mount 時自行加上的狀態類別，Vue 不可在切換選點模式時移除。
    element.classList.add('leaflet-container', 'leaflet-touch', 'leaflet-grab')
    const map = {
      setView: vi.fn(() => map),
      on: vi.fn((event: string, callback: (...args: any[]) => void) => { fake.handlers[event] = callback }),
      remove: vi.fn(),
    }
    return map
  },
  control: { zoom: () => ({ addTo: vi.fn() }) },
} }))
vi.mock('protomaps-leaflet', () => ({ leafletLayer: () => ({ labelRules: [], clearLayout: vi.fn(), addTo: vi.fn() }) }))

describe('MapView 選點模式與 Leaflet DOM 共存', () => {
  it('切入／退出選點模式後保留 Leaflet 注入類別，點地圖仍依目前模式處理', async () => {
    const picking = ref(false)
    const pick = vi.fn()
    const host = document.createElement('div')
    document.body.append(host)
    const app = createApp({ render: () => h(MapView, { markers: [], picked: null, onPick: picking.value ? pick : undefined }) })
    app.mount(host)
    const mapElement = host.querySelector('.tp-map')!
    const assertLeaflet = () => {
      expect(mapElement.classList.contains('leaflet-container')).toBe(true)
      expect(mapElement.classList.contains('leaflet-touch')).toBe(true)
      expect(mapElement.classList.contains('leaflet-grab')).toBe(true)
    }
    assertLeaflet()
    const point = { latlng: { lat: 25.03123456, lng: 121.51123456 } }
    fake.handlers.click!(point)
    expect(pick).not.toHaveBeenCalled()
    picking.value = true
    await nextTick()
    assertLeaflet()
    expect(mapElement.parentElement!.classList.contains('tp-map--picking')).toBe(true)
    fake.handlers.click!(point)
    expect(pick).toHaveBeenCalledWith({ lat: 25.031235, lng: 121.511235 })
    picking.value = false
    await nextTick()
    assertLeaflet()
    expect(mapElement.parentElement!.classList.contains('tp-map--picking')).toBe(false)
    fake.handlers.click!(point)
    expect(pick).toHaveBeenCalledTimes(1)
    app.unmount()
    host.remove()
  })
})
