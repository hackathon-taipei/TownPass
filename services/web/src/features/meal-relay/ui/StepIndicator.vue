<script setup lang="ts">
/** @component MR-C63 StepIndicator — 步驟列：圖示（或數字）＋文字＋箭頭，標示目前步驟 */
/**
 * 設計 v2（docs/meal-relay/design-v2/）01 中（報到 → 取餐 → 回報，圖示在文字上方）、03 右（① 拍照 → ② 填寫資訊 → ③ 上架，數字圓圈）。
 * `current` 從 0 起算：已完成的步驟打勾，目前步驟加粗並標 `aria-current="step"`，還沒到的變灰。
 * 每一步有 `icon`（lucide 元件）就用圖示版；全部都沒有 `icon` 就用數字圓圈版。
 *
 *   <StepIndicator :steps="[{ label: '報到', icon: ScanLine }, { label: '取餐', icon: Package }, { label: '回報', icon: CircleCheck }]" :current="1" />
 *   <StepIndicator :steps="[{ label: '拍照' }, { label: '填寫資訊' }, { label: '上架' }]" :current="0" />
 */
import { computed, type Component } from 'vue'
import { ArrowRight, Check } from 'lucide-vue-next'
import { stepStateOf } from '../logic/brand'

const props = defineProps<{ steps: { label: string; icon?: Component }[]; current: number }>()

const withIcons = computed(() => props.steps.length > 0 && props.steps.every((s) => s.icon))
const states = computed(() => props.steps.map((_, i) => stepStateOf(i, props.current)))
</script>

<template>
  <ol class="flex items-center justify-between gap-1 rounded-xl px-3 py-2" :class="withIcons ? 'bg-primary-50' : ''">
    <template v-for="(step, i) in steps" :key="step.label">
      <li
        class="flex min-h-11 items-center gap-1.5"
        :class="[withIcons ? 'flex-col justify-center' : '', states[i] === 'current' ? 'rounded-lg bg-primary-100 px-2 font-bold text-primary-700' : states[i] === 'done' ? 'font-semibold text-primary-600' : 'text-grey-500']"
        :data-state="states[i]"
        :aria-current="states[i] === 'current' ? 'step' : undefined"
      >
        <component :is="step.icon" v-if="withIcons" class="h-6 w-6" :stroke-width="states[i] === 'current' ? 2.5 : 2" aria-hidden="true" />
        <span
          v-else
          class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-sm font-bold"
          :class="states[i] === 'todo' ? 'bg-grey-100 text-grey-500' : 'bg-primary-600 text-white'"
          aria-hidden="true"
        >
          <Check v-if="states[i] === 'done'" class="h-4 w-4" :stroke-width="3" />
          <template v-else>{{ i + 1 }}</template>
        </span>
        <span class="text-sm whitespace-nowrap">{{ step.label }}</span>
      </li>
      <li v-if="i < steps.length - 1" class="shrink-0 text-grey-400" aria-hidden="true">
        <ArrowRight class="h-4 w-4" />
      </li>
    </template>
  </ol>
</template>
