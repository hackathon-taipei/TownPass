<script setup lang="ts">
/** @component MR-C65 Accordion — 收合列：標題、右側晶片、箭頭；群組模式一次只展開一個 */
/**
 * 設計 v2（docs/meal-relay/design-v2/）01 首頁「想成為志工？」、01 右任務卡、「查看位置」、03 中「已結束的食物（N）」。
 * 標題列高 48px 以上。展開與收合有高度動畫；系統設定「減少動態」時不做動畫。
 *
 *   <Accordion title="想成為志工？" :icon="User">…</Accordion>                 單獨一列：v-model 綁開關，不綁就自己管
 *   <Accordion v-for="t in tasks" :key="t.id" :name="t.id" group="tasks" :title="t.elder_code">
 *     <template #chip><span>待取餐</span></template>…
 *   </Accordion>                                                            同一個 `group` 一次只展開一個
 *
 * 群組模式下 `group` 相同的列互相收合；`name` 是這一列在群組裡的名字（沒傳就用自動編號）。
 * 插槽：預設＝展開內容、`chip`＝標題列右側晶片（箭頭左邊）、`icon`＝標題左側圖示（也可傳 `icon` prop）。
 */
import './motion.css'
import { computed, onBeforeUnmount, useId, watch, type Component } from 'vue'
import { ChevronDown } from 'lucide-vue-next'
import { closeInGroupIf, openedInGroup, setOpenInGroup } from '../logic/brand'

const props = defineProps<{ title: string; group?: string; name?: string; icon?: Component }>()
const open = defineModel<boolean>({ default: false })

const uid = useId()
const key = computed(() => props.name ?? uid)
const bodyId = `${uid}-body`

/** 群組模式以群組記錄的為準；單獨一列以 v-model 為準 */
const isOpen = computed(() => (props.group ? openedInGroup(props.group) === key.value : open.value))

if (props.group && open.value) setOpenInGroup(props.group, key.value)

function toggle() {
  const next = !isOpen.value
  if (props.group) setOpenInGroup(props.group, next ? key.value : null)
  open.value = next
}

// 群組內被別的列蓋掉時，v-model 也要跟著變 false；外部把 v-model 改成 true 時也要展開
watch(isOpen, (v) => {
  if (open.value !== v) open.value = v
})
watch(open, (v) => {
  if (!props.group) return
  if (v) setOpenInGroup(props.group, key.value)
  else closeInGroupIf(props.group, key.value)
})
onBeforeUnmount(() => {
  if (props.group) closeInGroupIf(props.group, key.value)
})
</script>

<template>
  <section class="overflow-hidden rounded-xl bg-white ring-1 ring-grey-200" :data-open="isOpen">
    <button
      type="button"
      class="press flex min-h-12 w-full items-center gap-2 px-3 py-2 text-left"
      :aria-expanded="isOpen"
      :aria-controls="bodyId"
      @click="toggle"
    >
      <slot name="icon">
        <component :is="icon" v-if="icon" class="h-5 w-5 shrink-0 text-primary-600" aria-hidden="true" />
      </slot>
      <span class="min-w-0 flex-1 truncate text-base font-bold text-grey-900">{{ title }}</span>
      <slot name="chip" />
      <ChevronDown class="tp-accordion__arrow h-5 w-5 shrink-0 text-grey-600" :class="{ 'tp-accordion__arrow--open': isOpen }" aria-hidden="true" />
    </button>
    <div :id="bodyId" class="tp-accordion__body" :class="{ 'tp-accordion__body--open': isOpen }" role="region" :aria-label="title" :inert="!isOpen">
      <div class="min-h-0 overflow-hidden">
        <div class="px-3 pt-1 pb-3">
          <slot />
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
/* 高度動畫用 grid-template-rows 0fr → 1fr，內容不用知道高度 */
.tp-accordion__body {
  display: grid;
  grid-template-rows: 0fr;
  visibility: hidden;
  transition:
    grid-template-rows var(--motion-slow, 320ms) var(--ease-in-out, ease-in-out),
    visibility 0s linear var(--motion-slow, 320ms);
}
.tp-accordion__body--open {
  grid-template-rows: 1fr;
  visibility: visible;
  transition:
    grid-template-rows var(--motion-slow, 320ms) var(--ease-in-out, ease-in-out),
    visibility 0s;
}
.tp-accordion__arrow {
  transition: transform var(--motion-base, 200ms) var(--ease-in-out, ease-in-out);
}
.tp-accordion__arrow--open {
  transform: rotate(180deg);
}
/* 減少動態：不做動畫，直接展開或收合 */
@media (prefers-reduced-motion: reduce) {
  .tp-accordion__body,
  .tp-accordion__body--open,
  .tp-accordion__arrow {
    transition: none;
  }
}
</style>
