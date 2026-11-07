<script setup lang="ts">
/** @component MR-C85 InventoryRow — 庫存的一批食物：照片、名稱、最晚食用時間、剩餘／派出中／已送達、修改與下架 */
/**
 * 設計 v2（docs/meal-relay/design-v2/README.md §3.4，03 中）的食物列，只用在提供者頁 MR-P06。
 * 照片沿用 MR-C55 FoodThumb（T-127：沒照片就不畫）；三個數字照 M1，用 useMotionNumber 平滑變化（B2）。
 * 狀態晶片照 T-126 三色（inventoryChipOf）：可派送的不放晶片、還沒被派出 warn、其他 grey。
 * `actions` 時顯示「修改」「下架」（只發 emit，由頁面打開 MR-C39 面板或 MR-C67 確認視窗）；離線時停用（ADR-024）。
 * `fresh` 時加框並底色提示一次（剛上架，D5）。
 *
 *   <InventoryRow :food="f" :now="now" actions :fresh="f.id === freshId" @edit="..." @close="..." />
 */
import './motion.css'
import { computed } from 'vue'
import { Pencil, Trash2 } from 'lucide-vue-next'
import { FOOD_QTY_FIELDS, foodQtyCounts } from '../logic/foodQty'
import { useMotionNumber } from '../logic/motion'
import { expiresText, inventoryChipOf, type Food } from '../logic/supplier'
import FoodThumb from './FoodThumb.vue'

const props = withDefaults(defineProps<{ food: Food; now: number; actions?: boolean; fresh?: boolean; offline?: boolean }>(), {
  actions: false,
  fresh: false,
  offline: false,
})
const emit = defineEmits<{ edit: [id: string]; close: [id: string] }>()

const counts = computed(() => foodQtyCounts(props.food))
const shown = {
  remaining: useMotionNumber(() => counts.value.remaining),
  dispatched_qty: useMotionNumber(() => counts.value.dispatched_qty),
  delivered_qty: useMotionNumber(() => counts.value.delivered_qty),
}
const chip = computed(() => inventoryChipOf(props.food))
const CHIP_TONE = { primary: 'bg-primary-50 text-primary-700', warn: 'bg-warn-100/15 text-warn-200', grey: 'bg-grey-50 text-grey-500' } as const
</script>

<template>
  <article
    class="flex gap-3 rounded-xl bg-white p-3 shadow-card ring-1 transition-shadow duration-200"
    :class="fresh ? 'flash ring-2 ring-primary-500' : 'ring-grey-100'"
    :data-fresh="fresh || undefined"
    :aria-label="food.name"
  >
    <FoodThumb :food="food" size="lg" />
    <div class="flex min-w-0 flex-1 flex-col gap-1">
      <div class="flex items-start gap-2">
        <h3 class="min-w-0 flex-1 text-base font-bold break-words text-grey-900">{{ food.name }}</h3>
        <span v-if="chip" class="shrink-0 rounded-full px-2 py-0.5 text-xs font-medium" :class="CHIP_TONE[chip.tone]">{{ chip.text }}</span>
      </div>
      <p class="text-sm text-grey-600">{{ expiresText(food.expires_at, now) }}</p>
      <p class="text-sm text-grey-700">
        <template v-for="(f, i) in FOOD_QTY_FIELDS" :key="f.key">
          <span v-if="i" class="text-grey-400" aria-hidden="true">・</span>{{ f.label }}
          <span class="font-bold text-grey-900 tabular-nums">{{ shown[f.key].value }}</span>
        </template>
      </p>
      <div v-if="actions" class="mt-1 grid grid-cols-2 gap-2">
        <button
          type="button"
          class="press flex min-h-12 items-center justify-center gap-1.5 rounded-xl bg-white text-base font-semibold text-grey-800 ring-1 ring-grey-200 disabled:text-grey-400"
          :disabled="offline"
          :aria-label="`修改「${food.name}」`"
          @click="emit('edit', food.id)"
        >
          <Pencil class="h-4 w-4" aria-hidden="true" />修改
        </button>
        <button
          type="button"
          class="press flex min-h-12 items-center justify-center gap-1.5 rounded-xl bg-white text-base font-semibold text-warn-200 ring-1 ring-grey-200 disabled:text-grey-400"
          :disabled="offline"
          :aria-label="`下架「${food.name}」`"
          @click="emit('close', food.id)"
        >
          <Trash2 class="h-4 w-4" aria-hidden="true" />下架
        </button>
      </div>
    </div>
  </article>
</template>
