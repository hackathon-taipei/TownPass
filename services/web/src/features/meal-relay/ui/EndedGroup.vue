<script setup lang="ts">
/** @component MR-C56 EndedGroup — 已結束的項目收合成一行「已結束 N 批」，點了才展開 */
/**
 * T-126「結束的東西預設不出現」：已過期、已下架、已取消的項目不再以淡色佔位。
 * 哪些算結束由 logic/shared.ts 的 isEnded／splitEnded 決定；本元件只管收合與展開，內容放預設 slot。
 * count 為 0 時整個不顯示。
 *
 *   <EndedGroup :count="ended.length"><FoodCard v-for="f in ended" ... /></EndedGroup>
 */
import './motion.css'
import { ref, useId } from 'vue'

withDefaults(defineProps<{ count: number; unit?: string }>(), { unit: '批' })
const open = ref(false)
const panelId = useId()
</script>

<template>
  <div v-if="count > 0" class="flex flex-col gap-3">
    <button
      type="button"
      class="press flex h-11 w-full items-center justify-between rounded-xl bg-grey-50 px-4 text-sm font-medium text-grey-600"
      :aria-expanded="open"
      :aria-controls="panelId"
      @click="open = !open"
    >
      <span>已結束 {{ count }} {{ unit }}</span>
      <span class="text-grey-500">{{ open ? '收起' : '展開' }}</span>
    </button>
    <Transition name="fade-up">
      <div v-if="open" :id="panelId" class="flex flex-col gap-3">
        <slot />
      </div>
    </Transition>
  </div>
</template>
