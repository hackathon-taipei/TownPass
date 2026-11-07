<script setup lang="ts">
/** @component MR-C14 FoodRow — 食物列：剩餘、派出中、已送達份數平滑變化、狀態晶片換色、到期倒數條、過期變淡 */
/**
 * 舊規格的「上架列」（B8、B9、B13）改成合約 v2.2 的 Food。
 * 三個數字照 M1：剩餘 remaining、派出中 dispatched_qty（claimed＋delivering）、已送達 delivered_qty（done）。
 * 倒數條：從 created_at 到 expires_at（最晚食用時間），剩不到 25% 變紅；只在 open 時顯示。
 * now 由父層每秒更新一次傳進來（一個頁面共用一個計時器，不要每列各開一個）。
 */
import './motion.css'
import { computed } from 'vue'
import type { Food } from '../logic/mealLabels'
import { FOOD_QTY_FIELDS, foodQtyCounts } from '../logic/foodQty'
import { FOOD_CATEGORY_LABEL, FOOD_STATUS_LABEL, timeLeftText } from '../logic/mealLabels'
import { useMotionNumber } from '../logic/motion'

const props = defineProps<{ food: Food; now: number }>()
const counts = computed(() => foodQtyCounts(props.food))
const shown = {
  remaining: useMotionNumber(() => counts.value.remaining),
  dispatched_qty: useMotionNumber(() => counts.value.dispatched_qty),
  delivered_qty: useMotionNumber(() => counts.value.delivered_qty),
}

const start = computed(() => Date.parse(props.food.created_at))
const end = computed(() => Date.parse(props.food.expires_at))
const left = computed(() => Math.max(0, Math.min(1, (end.value - props.now) / Math.max(1, end.value - start.value))))
const faded = computed(() => props.food.status === 'expired' || props.food.status === 'closed')

const CHIP: Record<Food['status'], string> = {
  open: 'bg-secondary-100 text-secondary-800',
  claimed: 'bg-primary-50 text-primary-700',
  expired: 'bg-grey-50 text-grey-500',
  closed: 'bg-grey-50 text-grey-500',
}
</script>

<template>
  <div class="rounded-xl bg-white p-3 shadow-card ring-1 ring-grey-100 transition-opacity duration-200" :class="{ 'opacity-60': faded }">
    <div class="flex items-center gap-2">
      <span class="min-w-0 truncate font-semibold text-grey-900">{{ food.name }}</span>
      <span class="shrink-0 text-sm text-grey-600">{{ FOOD_CATEGORY_LABEL[food.category] }}</span>
      <span class="ml-auto shrink-0 rounded-full px-2 py-0.5 text-xs font-medium transition-colors duration-200" :class="CHIP[food.status]">
        {{ FOOD_STATUS_LABEL[food.status] }}
      </span>
    </div>
    <p class="mt-0.5 truncate text-xs text-grey-500">{{ food.point_name }}・{{ food.supplier_name }}</p>
    <p class="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-grey-700">
      <span v-for="f in FOOD_QTY_FIELDS" :key="f.key">
        {{ f.label }} <span class="font-semibold tabular-nums text-grey-900">{{ shown[f.key].value }}</span>
      </span>
      <span class="text-grey-500">共 {{ food.qty }} 份</span>
      <Transition name="fade-up">
        <span v-if="food.unclaimed && food.status === 'open'" class="rounded-full bg-warn-100/15 px-2 py-0.5 text-xs font-medium text-warn-200">還沒被派出</span>
      </Transition>
    </p>
    <div v-if="food.status === 'open'" class="mt-2 flex items-center gap-2">
      <div class="h-1.5 flex-1 overflow-hidden rounded-full bg-grey-100" role="progressbar" :aria-valuenow="Math.round(left * 100)" aria-valuemin="0" aria-valuemax="100" aria-label="距離到期">
        <div
          class="h-full origin-left rounded-full transition-colors duration-200"
          :class="left < 0.25 ? 'bg-warn-200' : 'bg-primary-500'"
          :style="{ transform: `scaleX(${left})` }"
        />
      </div>
      <span class="shrink-0 text-right text-xs tabular-nums text-grey-600">{{ timeLeftText(end - now) }}</span>
    </div>
  </div>
</template>
