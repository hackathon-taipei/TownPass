<script setup lang="ts">
/** @component MR-C15 ClaimRow — 申請列：狀態晶片換色、送餐進度條（已派送 → 配送中 → 完成） */
/**
 * 一筆申請＝自動派送給一位長者的一份餐（合約 v2.2，M7、M8）。志工只看得到自己的 claimed、delivering 申請（M13）。
 * 進度條顯示走到第幾步；取消時變淡、不顯示進度。
 */
import './motion.css'
import { computed } from 'vue'
import type { Claim } from '../logic/mealLabels'
import { CLAIM_STATUS_LABEL, claimProgress } from '../logic/mealLabels'
import { useMotionNumber } from '../logic/motion'

const props = defineProps<{ claim: Claim }>()
const progress = computed(() => claimProgress(props.claim.status))
const step = useMotionNumber(() => progress.value?.step ?? 0)

const CHIP: Record<Claim['status'], string> = {
  claimed: 'bg-primary-50 text-primary-700',
  delivering: 'bg-primary-500 text-white',
  done: 'bg-success/15 text-success',
  cancelled: 'bg-grey-50 text-grey-500',
}
</script>

<template>
  <div class="rounded-xl bg-white p-3 shadow-card ring-1 ring-grey-100 transition-opacity duration-200" :class="{ 'opacity-60': claim.status === 'cancelled' }">
    <div class="flex items-center gap-2">
      <span class="min-w-0 truncate font-semibold text-grey-900">{{ claim.elder.alias }}</span>
      <span class="shrink-0 text-sm text-grey-600">送餐 {{ claim.qty }} 份</span>
      <span class="ml-auto shrink-0 rounded-full px-2 py-0.5 text-xs font-medium transition-colors duration-200" :class="CHIP[claim.status]">
        {{ CLAIM_STATUS_LABEL[claim.status] }}
      </span>
    </div>
    <p class="mt-0.5 truncate text-xs text-grey-500">{{ claim.food.name }}・{{ claim.food.point_name }}</p>
    <Transition name="fade-up">
      <div v-if="progress" class="mt-2 flex items-center gap-2">
        <div class="h-1.5 flex-1 overflow-hidden rounded-full bg-grey-100" role="progressbar" :aria-valuenow="progress.step" aria-valuemin="0" :aria-valuemax="progress.total" aria-label="送餐進度">
          <div
            class="h-full origin-left rounded-full transition-transform duration-300"
            :class="claim.status === 'done' ? 'bg-success' : 'bg-primary-500'"
            :style="{ transform: `scaleX(${progress.step / progress.total})` }"
          />
        </div>
        <span class="shrink-0 text-xs tabular-nums text-grey-600">第 {{ step }} / {{ progress.total }} 步</span>
      </div>
    </Transition>
  </div>
</template>
