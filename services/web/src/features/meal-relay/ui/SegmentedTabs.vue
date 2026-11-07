<script setup lang="ts" generic="T extends string">
/** @component MR-C66 SegmentedTabs — 兩到三格的分段切換：v-model，可與網址 ?tab= 同步，格子可帶數字徽章 */
/**
 * 設計 v2（docs/meal-relay/design-v2/）03 中「我的庫存｜上架食物」、02 管理系統分頁（待審核 ②｜服務看板｜長者名冊）。
 * 選中的格子是深青底白字，其他是白底；每格高 48px 以上。方向鍵左右可切換。
 * 與網址同步用 `logic/brand.ts` 的 `useTabQuery`，讓 App 返回鍵能退回上一個分頁：
 *
 *   const tab = useTabQuery('tab', ['inventory', 'publish'] as const)
 *   <SegmentedTabs v-model="tab" :tabs="[{ value: 'inventory', label: '我的庫存' }, { value: 'publish', label: '上架食物' }]" />
 *
 * `badge` 有值（大於 0）時在文字旁顯示黃色數字徽章。內容切換請搭配 TabBar 同款的 `<Transition name="tab-fade" mode="out-in">`。
 */
import { nextTick, ref } from 'vue'

const model = defineModel<T>({ required: true })
const props = defineProps<{ tabs: { value: T; label: string; badge?: number }[]; label?: string }>()

const buttons = ref<HTMLButtonElement[]>([])

function onKey(e: KeyboardEvent, i: number) {
  const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0
  if (!step) return
  e.preventDefault()
  const next = (i + step + props.tabs.length) % props.tabs.length
  model.value = props.tabs[next]!.value
  void nextTick(() => buttons.value[next]?.focus())
}
</script>

<template>
  <div class="flex overflow-hidden rounded-xl bg-white ring-1 ring-primary-600" role="tablist" :aria-label="label">
    <button
      v-for="(t, i) in tabs"
      :key="t.value"
      ref="buttons"
      type="button"
      role="tab"
      class="press flex min-h-12 min-w-0 flex-1 items-center justify-center gap-1.5 px-2 text-base font-bold transition-colors duration-200"
      :class="model === t.value ? 'bg-primary-600 text-white' : 'bg-white text-grey-700'"
      :aria-selected="model === t.value"
      :tabindex="model === t.value ? 0 : -1"
      @click="model = t.value"
      @keydown="onKey($event, i)"
    >
      <span class="truncate">{{ t.label }}</span>
      <span
        v-if="t.badge"
        class="inline-flex min-w-6 items-center justify-center rounded-full bg-secondary-500 px-1.5 text-sm leading-6 font-bold text-grey-900"
        :aria-label="`${t.badge} 件`"
      >
        {{ t.badge }}
      </span>
    </button>
  </div>
</template>
