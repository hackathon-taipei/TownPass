<script setup lang="ts">
/** @component MR-C80 VisitResultOptions — 回報面板的三個單選：見到本人／放門口，附照片／未見到，帶回；不能放門口時停用並說明 */
/**
 * 設計 v2 04 中（design-v2/README.md §3.3 回報面板）。選項文字是 logic 的 REPORT_OPTIONS。
 * M11、V11：放門口只限送餐、生鮮蔬果不能放門口 → 選項停用，下面寫原因（leaveAtDoorBlockText）；
 * 已經選了放門口又變成不能選時清掉選擇。和 kit MR-C17 不同：MR-C17 直接隱藏這個選項，設計 v2 要停用並說明。
 *
 *   <VisitResultOptions v-model="result" :kind="task.kind" :category="task.claim?.food.category" />
 */
import { computed, useId, watch } from 'vue'
import { leaveAtDoorBlockText, REPORT_OPTIONS, type FoodCategory, type VisitKind, type VisitResult } from '../logic/volunteer'

const props = defineProps<{ kind: VisitKind; category?: FoodCategory }>()
const result = defineModel<VisitResult | null>({ required: true })

const name = useId()
const doorBlock = computed(() => leaveAtDoorBlockText(props.kind, props.category))
const disabledOf = (value: VisitResult) => value === 'left_at_door' && !!doorBlock.value
watch(doorBlock, (block) => block && result.value === 'left_at_door' && (result.value = null), { immediate: true })
</script>

<template>
  <fieldset class="space-y-2">
    <legend class="sr-only">拜訪結果</legend>
    <label
      v-for="opt in REPORT_OPTIONS"
      :key="opt.value"
      class="flex min-h-11 items-center gap-3 rounded-lg px-4 py-2 ring-1 transition-colors"
      :class="
        disabledOf(opt.value)
          ? 'cursor-not-allowed bg-grey-50 text-grey-400 ring-grey-100'
          : result === opt.value
            ? 'bg-linear-to-r from-primary-50 to-primary-100 text-grey-900 ring-primary-100'
            : 'bg-grey-50/40 text-grey-900 ring-grey-300'
      "
      :data-option="opt.value"
    >
      <input
        v-model="result"
        type="radio"
        class="size-6 shrink-0 accent-primary-600"
        :name="name"
        :value="opt.value"
        :disabled="disabledOf(opt.value)"
      />
      <span class="min-w-0 flex-1">
        <span class="block text-base font-bold">{{ opt.value === 'returned' && kind === 'care' ? '未見到本人' : opt.label }}</span>
        <span v-if="disabledOf(opt.value)" class="block text-sm text-grey-500">{{ doorBlock }}</span>
      </span>
    </label>
  </fieldset>
</template>
