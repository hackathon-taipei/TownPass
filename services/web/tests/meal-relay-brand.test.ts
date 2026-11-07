import { createApp, defineComponent, h, nextTick, reactive, type Component } from 'vue'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'
import { afterEach, describe, expect, it } from 'vitest'
import {
  BRAND_FILES,
  brandSrc,
  clampInt,
  openedInGroup,
  parseIntInput,
  setOpenInGroup,
  stepStateOf,
  useTabQuery,
} from '@/features/meal-relay/logic/brand'
import Accordion from '@/features/meal-relay/ui/Accordion.vue'
import BrandHeader from '@/features/meal-relay/ui/BrandHeader.vue'
import BrandHero from '@/features/meal-relay/ui/BrandHero.vue'
import ConfirmDialog from '@/features/meal-relay/ui/ConfirmDialog.vue'
import InfoNote from '@/features/meal-relay/ui/InfoNote.vue'
import MascotBadge from '@/features/meal-relay/ui/MascotBadge.vue'
import NumberStepper from '@/features/meal-relay/ui/NumberStepper.vue'
import SegmentedTabs from '@/features/meal-relay/ui/SegmentedTabs.vue'
import StepIndicator from '@/features/meal-relay/ui/StepIndicator.vue'

// 鄰食蜂 設計 v2 共用元件 MR-C60～C68 與 logic/brand.ts（T-132，docs/meal-relay/ui-kit.md「設計 v2 共用元件」）

const cleanups: (() => void)[] = []
afterEach(() => {
  while (cleanups.length) cleanups.pop()!()
  document.body.innerHTML = ''
})

/** 把元件掛到 document.body，回傳容器；測試結束自動卸載 */
function mount(render: () => ReturnType<typeof h>, plugins: Parameters<ReturnType<typeof createApp>['use']>[0][] = []) {
  const el = document.createElement('div')
  document.body.appendChild(el)
  const app = createApp({ render })
  for (const p of plugins) app.use(p)
  app.mount(el)
  cleanups.push(() => app.unmount())
  return el
}

const press = (el: Element | null | undefined) => (el as HTMLElement).click()
const key = (k: string, init: KeyboardEventInit = {}) => window.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, ...init }))

describe('logic/brand 小函數', () => {
  it('brandSrc 接上 base 與素材路徑', () => {
    expect(brandSrc('logo')).toBe('/meal-relay/brand/logo.webp')
    expect(brandSrc('mascot', '/TownPass/')).toBe('/TownPass/meal-relay/brand/mascot.webp')
    expect(Object.keys(BRAND_FILES).sort()).toEqual(['logo', 'mascot', 'wordmark'])
  })
  it('stepStateOf：已完成、目前、還沒到', () => {
    expect([0, 1, 2].map((i) => stepStateOf(i, 1))).toEqual(['done', 'current', 'todo'])
  })
  it('clampInt 與 parseIntInput', () => {
    expect(clampInt(15, 1, 10)).toBe(10)
    expect(clampInt(-3, 1, 10)).toBe(1)
    expect(clampInt(4.9, 1, 10)).toBe(4)
    expect(parseIntInput('12a')).toBe(12)
    expect(parseIntInput('１２')).toBe(12)
    expect(parseIntInput('')).toBeNull()
    expect(parseIntInput('abc')).toBeNull()
  })
})

describe('Accordion（MR-C65）', () => {
  function three(group?: string) {
    return mount(() =>
      h('div', ['a', 'b', 'c'].map((n) => h(Accordion, { key: n, title: `標題${n}`, name: n, group }, { default: () => `內容${n}` }))),
    )
  }
  const openState = (el: Element) => [...el.querySelectorAll('button[aria-expanded]')].map((b) => b.getAttribute('aria-expanded'))

  it('group 模式一次只展開一個', async () => {
    const el = three('t-accordion')
    expect(openState(el)).toEqual(['false', 'false', 'false'])
    const btns = el.querySelectorAll('button[aria-expanded]')
    press(btns[0])
    await nextTick()
    expect(openState(el)).toEqual(['true', 'false', 'false'])
    press(btns[2])
    await nextTick()
    expect(openState(el)).toEqual(['false', 'false', 'true'])
    expect(openedInGroup('t-accordion')).toBe('c')
    press(btns[2])
    await nextTick()
    expect(openState(el)).toEqual(['false', 'false', 'false'])
  })
  it('沒有 group 時各列自己開關', async () => {
    const el = three()
    const btns = el.querySelectorAll('button[aria-expanded]')
    press(btns[0])
    press(btns[1])
    await nextTick()
    expect(openState(el)).toEqual(['true', 'true', 'false'])
  })
  it('收合時內容 inert，展開後可操作；右側晶片 slot 在標題列', async () => {
    const el = mount(() =>
      h(Accordion, { title: '任務', group: 't-accordion-chip' }, { default: () => '內容', chip: () => h('span', { class: 'chip' }, '待取餐') }),
    )
    const body = el.querySelector('[role="region"]') as HTMLElement
    expect(body.hasAttribute('inert')).toBe(true)
    expect(el.querySelector('button .chip')?.textContent).toBe('待取餐')
    press(el.querySelector('button'))
    await nextTick()
    expect(body.hasAttribute('inert')).toBe(false)
  })
  it('標題列至少 48px 高（min-h-12）', () => {
    const el = three()
    expect(el.querySelector('button')!.className).toContain('min-h-12')
  })
  it('群組外部改動（setOpenInGroup）也會同步畫面', async () => {
    const el = three('t-accordion-ext')
    setOpenInGroup('t-accordion-ext', 'b')
    await nextTick()
    expect([...el.querySelectorAll('button[aria-expanded]')].map((b) => b.getAttribute('aria-expanded'))).toEqual(['false', 'true', 'false'])
  })
})

describe('SegmentedTabs（MR-C66）', () => {
  const tabs = [
    { value: 'inventory', label: '我的庫存' },
    { value: 'publish', label: '上架食物', badge: 2 },
  ]
  it('v-model 雙向：點另一格改值，外部改值畫面跟著變', async () => {
    const state = reactive({ tab: 'inventory' })
    const el = mount(() => h(SegmentedTabs, { modelValue: state.tab, 'onUpdate:modelValue': (v: string) => (state.tab = v), tabs }))
    const selected = () => [...el.querySelectorAll('[role="tab"]')].map((b) => b.getAttribute('aria-selected'))
    expect(selected()).toEqual(['true', 'false'])
    press(el.querySelectorAll('[role="tab"]')[1])
    await nextTick()
    expect(state.tab).toBe('publish')
    expect(selected()).toEqual(['false', 'true'])
    state.tab = 'inventory'
    await nextTick()
    expect(selected()).toEqual(['true', 'false'])
  })
  it('badge 顯示在文字旁，每格至少 48px', () => {
    const el = mount(() => h(SegmentedTabs, { modelValue: 'inventory', tabs }))
    expect(el.querySelectorAll('[role="tab"]')[1]!.textContent).toContain('2')
    expect(el.querySelector('[role="tab"]')!.className).toContain('min-h-12')
  })
  it('方向鍵切換', async () => {
    const state = reactive({ tab: 'inventory' })
    const el = mount(() => h(SegmentedTabs, { modelValue: state.tab, 'onUpdate:modelValue': (v: string) => (state.tab = v), tabs }))
    el.querySelector('[role="tab"]')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
    await nextTick()
    expect(state.tab).toBe('publish')
  })
  it('useTabQuery 與網址 ?tab= 同步，沒有或不合法時用第一個', async () => {
    const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/supplier', component: { render: () => null } }] })
    await router.push('/supplier')
    let tab!: ReturnType<typeof useTabQuery<'inventory' | 'publish'>>
    const Page = defineComponent({
      setup() {
        tab = useTabQuery('tab', ['inventory', 'publish'] as const)
        return () => h('span', tab.value)
      },
    })
    const el = mount(() => h('div', [h(RouterView), h(Page)]), [router])
    expect(tab.value).toBe('inventory')
    tab.value = 'publish'
    await router.isReady()
    await new Promise((r) => setTimeout(r, 0))
    expect(router.currentRoute.value.query.tab).toBe('publish')
    expect(tab.value).toBe('publish')
    await router.push({ query: { tab: 'bogus' } })
    expect(tab.value).toBe('inventory')
    router.back()
    await new Promise((r) => setTimeout(r, 0))
    expect(tab.value).toBe('publish')
    expect(el.textContent).toContain('publish')
  })
})

describe('ConfirmDialog（MR-C67）', () => {
  function open(extra: Record<string, unknown> = {}) {
    const state = reactive({ open: true, confirmed: 0, cancelled: 0 })
    mount(() =>
      h(ConfirmDialog, {
        modelValue: state.open,
        'onUpdate:modelValue': (v: boolean) => (state.open = v),
        title: '下架這份食物？',
        message: '下架後志工就看不到了。',
        onConfirm: () => state.confirmed++,
        onCancel: () => state.cancelled++,
        ...extra,
      }),
    )
    return state
  }
  const buttons = () => [...document.body.querySelectorAll('[role="alertdialog"] button')] as HTMLButtonElement[]

  it('開啟時焦點在「取消」', async () => {
    open()
    await nextTick()
    await nextTick()
    expect(document.activeElement).toBe(buttons()[0])
    expect(buttons()[0]!.textContent?.trim()).toBe('取消')
  })
  it('Esc 等於取消：發 cancel、關閉，不發 confirm', async () => {
    const s = open()
    await nextTick()
    key('Escape')
    await nextTick()
    expect(s.cancelled).toBe(1)
    expect(s.confirmed).toBe(0)
    expect(s.open).toBe(false)
  })
  it('按確認發 confirm 並關閉；按取消發 cancel 並關閉', async () => {
    const s = open()
    await nextTick()
    press(buttons()[1])
    await nextTick()
    expect(s.confirmed).toBe(1)
    expect(s.cancelled).toBe(0)
    expect(s.open).toBe(false)
    s.open = true
    await nextTick()
    press(buttons()[0])
    await nextTick()
    expect(s.cancelled).toBe(1)
    expect(s.confirmed).toBe(1)
  })
  it('danger 時確認鍵是紅色（warn token），一般時是主色；按鈕至少 48px', async () => {
    open({ danger: true, confirmText: '下架' })
    await nextTick()
    const [cancel, confirm] = buttons()
    expect(confirm!.className).toContain('bg-warn-200')
    expect(confirm!.textContent?.trim()).toBe('下架')
    expect(cancel!.className).not.toContain('bg-warn')
    expect(cancel!.className).toContain('min-h-12')
    expect(confirm!.className).toContain('min-h-12')
  })
  it('沒有 danger 時確認鍵不是紅色', async () => {
    open()
    await nextTick()
    expect(buttons()[1]!.className).toContain('bg-primary-600')
    expect(buttons()[1]!.className).not.toContain('bg-warn')
  })
  it('關閉時不畫出視窗', async () => {
    const s = open()
    await nextTick()
    s.open = false
    await nextTick()
    await new Promise((r) => setTimeout(r, 300))
    expect(document.body.querySelector('[role="alertdialog"]')).toBeNull()
  })
})

describe('NumberStepper（MR-C68）', () => {
  function stepper(start: number, min = 1, max = 5) {
    const state = reactive({ n: start })
    const el = mount(() => h(NumberStepper, { modelValue: state.n, 'onUpdate:modelValue': (v: number) => (state.n = v), min, max, label: '份數' }))
    const [minus, plus] = [...el.querySelectorAll('button')] as HTMLButtonElement[]
    const input = el.querySelector('input') as HTMLInputElement
    return { state, minus: minus!, plus: plus!, input }
  }
  it('−／+ 改變數字', async () => {
    const { state, minus, plus, input } = stepper(3)
    press(plus)
    await nextTick()
    expect(state.n).toBe(4)
    expect(input.value).toBe('4')
    press(minus)
    await nextTick()
    press(minus)
    await nextTick()
    expect(state.n).toBe(2)
  })
  it('到下限時 − 停用，到上限時 + 停用', async () => {
    const lo = stepper(1)
    expect(lo.minus.disabled).toBe(true)
    expect(lo.plus.disabled).toBe(false)
    const hi = stepper(5)
    expect(hi.plus.disabled).toBe(true)
    expect(hi.minus.disabled).toBe(false)
    press(hi.plus)
    await nextTick()
    expect(hi.state.n).toBe(5)
  })
  it('數字可以直接輸入；超出範圍離開欄位時收進上下限', async () => {
    const { state, input } = stepper(2)
    input.value = '4'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await nextTick()
    expect(state.n).toBe(4)
    input.value = '99'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.dispatchEvent(new Event('change', { bubbles: true }))
    await nextTick()
    expect(state.n).toBe(5)
    expect(input.value).toBe('5')
    input.value = '0'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.dispatchEvent(new Event('change', { bubbles: true }))
    await nextTick()
    expect(state.n).toBe(1)
  })
  it('輸入非數字或清空後離開欄位會還原；只收數字', async () => {
    const { state, input } = stepper(3)
    input.value = 'abc'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.dispatchEvent(new Event('change', { bubbles: true }))
    await nextTick()
    expect(state.n).toBe(3)
    expect(input.value).toBe('3')
    input.value = '2x'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await nextTick()
    expect(input.value).toBe('2')
    expect(state.n).toBe(2)
  })
  it('按鈕與輸入框至少 48px 高', () => {
    const { minus, plus, input } = stepper(3)
    for (const el of [minus, plus, input]) expect(el.className).toContain('h-12')
    expect(minus.className).toContain('w-12')
  })
})

describe('StepIndicator（MR-C63）', () => {
  const steps = [{ label: '報到' }, { label: '取餐' }, { label: '回報' }]
  it('目前步驟標 aria-current 並加粗；前面是已完成，後面是還沒到', () => {
    const el = mount(() => h(StepIndicator, { steps, current: 1 }))
    const items = [...el.querySelectorAll('li[data-state]')] as HTMLElement[]
    expect(items.map((li) => li.dataset.state)).toEqual(['done', 'current', 'todo'])
    expect(items[1]!.getAttribute('aria-current')).toBe('step')
    expect(items[0]!.hasAttribute('aria-current')).toBe(false)
    expect(items[1]!.className).toContain('font-bold')
    expect(items[1]!.className).toContain('text-primary-700')
    expect(items[2]!.className).toContain('text-grey-500')
    expect(items[2]!.className).not.toContain('font-bold')
  })
  it('第一步是目前步驟時沒有已完成；最後一步完成時都是 done', () => {
    const first = mount(() => h(StepIndicator, { steps, current: 0 }))
    expect([...first.querySelectorAll('li[data-state]')].map((li) => (li as HTMLElement).dataset.state)).toEqual(['current', 'todo', 'todo'])
    const done = mount(() => h(StepIndicator, { steps, current: 3 }))
    expect([...done.querySelectorAll('li[data-state]')].map((li) => (li as HTMLElement).dataset.state)).toEqual(['done', 'done', 'done'])
  })
  it('沒有 icon 時畫數字圓圈，已完成的步驟是打勾', () => {
    const el = mount(() => h(StepIndicator, { steps, current: 1 }))
    const items = [...el.querySelectorAll('li[data-state]')]
    expect(items[1]!.textContent).toContain('2')
    expect(items[0]!.querySelector('svg')).not.toBeNull()
    expect(items[2]!.textContent).toContain('3')
  })
  it('每步都有 icon 時畫圖示版（沒有數字）', () => {
    const Icon: Component = { render: () => h('svg', { class: 'icon' }) }
    const el = mount(() => h(StepIndicator, { steps: steps.map((s) => ({ ...s, icon: Icon })), current: 0 }))
    expect(el.querySelectorAll('svg.icon').length).toBe(3)
    expect(el.textContent).not.toContain('1')
  })
})

describe('InfoNote、BrandHeader、BrandHero、MascotBadge', () => {
  it('InfoNote：文字、第二行小字、插槽、role=note', () => {
    const el = mount(() => h(InfoNote, { text: '長者不用操作 App', detail: '請洽里長' }))
    expect(el.querySelector('[role="note"]')).not.toBeNull()
    expect(el.textContent).toContain('長者不用操作 App')
    expect(el.textContent).toContain('請洽里長')
    const slot = mount(() => h(InfoNote, null, { default: () => '用插槽寫' }))
    expect(slot.textContent).toContain('用插槽寫')
    expect(slot.textContent).not.toContain('請洽里長')
  })
  it('BrandHeader 字標版：字標圖、副名、標題；banner 版：標題置中', () => {
    const wm = mount(() => h(BrandHeader, { title: '提供食物' }))
    expect(wm.querySelector('h1')!.textContent).toBe('提供食物')
    expect(wm.querySelector('img[alt="鄰食蜂"]')!.getAttribute('src')).toBe('/meal-relay/brand/wordmark.webp')
    expect(wm.textContent).toContain('鄰食轉運站')
    const banner = mount(() => h(BrandHeader, { title: '我的任務', variant: 'banner' }))
    expect(banner.querySelector('h1')!.textContent).toBe('我的任務')
    expect(banner.querySelector('h1')!.className).toContain('text-center')
    expect(banner.querySelector('header')!.className).toContain('bg-primary-100')
  })
  it('BrandHero 預設兩行標語與完整標誌', () => {
    const el = mount(() => h(BrandHero))
    expect(el.textContent).toContain('長者不必用手機，')
    expect(el.textContent).toContain('也能收到餐食與關懷')
    expect(el.querySelector('img')!.getAttribute('src')).toBe('/meal-relay/brand/logo.webp')
    const custom = mount(() => h(BrandHero, { lines: ['甲', '乙'] }))
    expect(custom.textContent).toContain('甲')
  })
  it('MascotBadge：預設是裝飾圖；done 帶打勾、glow 帶光芒', () => {
    const plain = mount(() => h(MascotBadge, { size: 40 }))
    expect(plain.querySelector('img')!.getAttribute('alt')).toBe('')
    expect(plain.querySelector('[aria-label="完成"]')).toBeNull()
    expect(plain.querySelector('svg')).toBeNull()
    const done = mount(() => h(MascotBadge, { size: 160, glow: true, done: true, alt: '企鵝' }))
    expect(done.querySelector('[aria-label="完成"]')).not.toBeNull()
    expect(done.querySelectorAll('svg').length).toBe(2)
    expect(done.querySelector('img')!.getAttribute('alt')).toBe('企鵝')
  })
})
