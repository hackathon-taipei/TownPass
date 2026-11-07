<script setup lang="ts">
/** @component MR-C13 StatCard — 統計卡：數字平滑變化並底色提示一次 */
/**
 * Board 統計卡（ARCHITECTURE §11.5）：數字平滑變化，數字改變時底色提示一次（ANIMATION §5.3）。
 * 選用 `icon`（lucide 元件，設計 v2 02 管理系統看板的統計卡）：有傳時圖示在左、文字在右；沒傳版面跟原本一樣。
 */
import './motion.css'
import { ref, watch, type Component } from 'vue'
import { replayClass, useMotionNumber } from '../logic/motion'

const props = defineProps<{ label: string; value: number; tone?: 'default' | 'alert'; icon?: Component }>()
const shown = useMotionNumber(() => props.value)
const card = ref<HTMLElement>()
watch(
  () => props.value,
  () => replayClass(card.value, 'flash'),
)
</script>

<template>
  <div ref="card" class="rounded-xl border border-grey-200 bg-white p-2.5 xl:p-3" :class="icon ? 'flex items-center gap-2.5' : ''">
    <component :is="icon" v-if="icon" class="size-7 shrink-0 text-primary-700 xl:size-9" :stroke-width="1.75" aria-hidden="true" />
    <div :class="icon ? 'min-w-0' : 'contents'">
      <p class="text-xs font-semibold text-grey-800 xl:text-sm">{{ label }}</p>
      <p class="text-2xl leading-none font-extrabold tabular-nums xl:text-3xl" :class="tone === 'alert' && value > 0 ? 'text-warn-200' : 'text-primary-900'">
        {{ shown }}
      </p>
    </div>
  </div>
</template>
