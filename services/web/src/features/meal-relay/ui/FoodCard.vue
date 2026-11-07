<script setup lang="ts">
/** @component MR-C03 FoodCard — 一批食物：包 MR-C14 FoodRow，加上提供者的修改與下架按鈕 */
/**
 * 提供者庫存（MR-P06）與管理系統（MR-P08）共用。列的內容全部交給 FoodRow（剩餘、派出中、已送達、倒數、狀態晶片、無人認領提醒）。
 * actions 為 true 且食物還能改（open、claimed）時，在列下方顯示「修改」「下架」；按下只發出 emit，由父層呼叫 API。
 * 預設 slot 放頁面自己要的額外內容。
 */
import './motion.css'
import { computed } from 'vue'
import type { Food } from '../logic/shared'
import FoodRow from './FoodRow.vue'

const props = withDefaults(defineProps<{ food: Food; now: number; actions?: boolean }>(), { actions: false })
const emit = defineEmits<{ edit: [id: Food['id']]; close: [id: Food['id']] }>()

const showActions = computed(() => props.actions && (props.food.status === 'open' || props.food.status === 'claimed'))
</script>

<template>
  <div class="flex flex-col gap-2">
    <FoodRow :food="food" :now="now" />
    <div v-if="showActions" class="flex gap-2">
      <button
        type="button"
        class="press h-10 flex-1 rounded-full bg-white px-4 text-sm font-semibold text-primary-700 ring-1 ring-primary-200"
        @click="emit('edit', food.id)"
      >
        修改
      </button>
      <button
        type="button"
        class="press h-10 flex-1 rounded-full bg-white px-4 text-sm font-semibold text-warn-200 ring-1 ring-grey-200"
        @click="emit('close', food.id)"
      >
        下架
      </button>
    </div>
    <slot />
  </div>
</template>
