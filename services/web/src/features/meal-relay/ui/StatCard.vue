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
  <div ref="card" class="rounded-xl bg-white p-3 shadow-card ring-1 ring-grey-100" :class="icon ? 'flex items-center gap-2.5' : ''">
    <component :is="icon" v-if="icon" class="h-7 w-7 shrink-0 text-primary-600" :stroke-width="1.75" aria-hidden="true" />
    <div :class="icon ? 'min-w-0' : 'contents'">
      <p class="text-xs text-grey-600">{{ label }}</p>
      <p class="mt-1 text-2xl font-bold tabular-nums" :class="tone === 'alert' && value > 0 ? 'text-warn-200' : 'text-grey-900'">
        {{ shown }}
      </p>
    </div>
  </div>
</template>
