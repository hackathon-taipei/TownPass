import { createApp, defineComponent, h, nextTick, type Component } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Role } from '@/features/meal-relay/data'

vi.mock('@/features/meal-relay/ui/MapView.vue', () => ({
  default: defineComponent({ render: () => h('div') }),
}))
const api = vi.hoisted(() => ({
  getMe: vi.fn(), getMyStation: vi.fn(), listMyAssignments: vi.fn(), listMyClaims: vi.fn(),
  getMySupplier: vi.fn(), listFoods: vi.fn(), listPoints: vi.fn(),
}))
vi.mock('@/features/meal-relay/data', async (original) => ({
  ...await original<typeof import('@/features/meal-relay/data')>(), ...api,
}))

import VolunteerPage from '@/features/meal-relay/ui/VolunteerPage.vue'
import TaskPage from '@/features/meal-relay/ui/TaskPage.vue'
import StationPage from '@/features/meal-relay/ui/StationPage.vue'
import SupplierPage from '@/features/meal-relay/ui/SupplierPage.vue'

const roles: Role[] = ['citizen', 'volunteer', 'supplier', 'station', 'admin']
let unmount: (() => void) | undefined
afterEach(() => {
  unmount?.()
  document.body.innerHTML = ''
  vi.clearAllMocks()
})

async function mount(page: Component) {
  const router = createRouter({ history: createMemoryHistory(), routes: [
    { path: '/f/meal-relay', name: 'meal-relay.home', component: { render: () => null } },
    { path: '/test', component: page },
  ] })
  await router.push('/test')
  const el = document.createElement('div')
  document.body.append(el)
  const app = createApp(page).use(router)
  app.mount(el)
  unmount = () => app.unmount()
  for (let i = 0; i < 15; i++) {
    await Promise.resolve()
    await nextTick()
  }
  return { el, router }
}

describe('角色直連：不讀取專屬資料，並能回到作品首頁', () => {
  const pages = [
    { label: '志工首頁', page: VolunteerPage, allowed: ['volunteer'] },
    { label: '我的任務', page: TaskPage, allowed: ['volunteer'] },
    { label: '據點 QR', page: StationPage, allowed: ['station'] },
    { label: '提供者頁', page: SupplierPage, allowed: ['citizen', 'supplier'] },
  ]
  for (const { label, page, allowed } of pages) {
    for (const role of roles.filter((r) => !allowed.includes(r))) {
      it(`${role} 直接開啟${label}，顯示回首頁且不呼叫角色專屬 API`, async () => {
        api.getMe.mockResolvedValue({ id: `test-${role}`, role, name: '模擬帳號', supplier: null })
        const { el, router } = await mount(page)
        expect(api.getMe).toHaveBeenCalled()
        await vi.waitFor(() => {
          const home = [...el.querySelectorAll('a')].find((a) => a.textContent?.trim() === '回首頁')
          expect(home?.getAttribute('href')).toBe('/f/meal-relay')
        })
        for (const [name, call] of Object.entries(api)) {
          if (name !== 'getMe') expect(call, name).not.toHaveBeenCalled()
        }
        ;[...el.querySelectorAll('a')].find((a) => a.textContent?.trim() === '回首頁')!.click()
        await vi.waitFor(() => expect(router.currentRoute.value.name).toBe('meal-relay.home'))
      })
    }
  }

  for (const [label, page] of [['我的任務', TaskPage], ['據點 QR', StationPage]] as const) {
    it(`${label} 無法確認身分時不呼叫專屬 API`, async () => {
      api.getMe.mockRejectedValue(new Error('模擬斷線'))
      await mount(page)
      expect(api.getMe).toHaveBeenCalled()
      for (const [name, call] of Object.entries(api)) {
        if (name !== 'getMe') expect(call, name).not.toHaveBeenCalled()
      }
    })
  }
})
