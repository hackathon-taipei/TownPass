<script setup lang="ts">
/** @component MR-C04 ElderStatusTag — 長者警示標籤：需要送餐／需要關懷／從未見到（M10），只在需要處理時出現 */
/**
 * 志工任務、管理員名冊用。標籤順序與文字來自 shared.ts（elderTagsOf、ELDER_TAG_LABEL）。
 * 三個標籤都是「需要處理」，一律 warn 色（T-126 三色原則）。
 * 沒有任何標籤（長者狀況正常）時什麼都不顯示。
 *
 *   <ElderStatusTag :elder="elder" />
 */
import { computed } from 'vue'
import type { Elder } from '../logic/shared'
import { ELDER_TAG_LABEL, elderTagsOf } from '../logic/shared'

const props = defineProps<{ elder: Pick<Elder, 'meal_due' | 'care_due' | 'last_seen_at'> }>()
const tags = computed(() => elderTagsOf(props.elder))
</script>

<template>
  <div v-if="tags.length" class="flex flex-wrap items-center gap-1">
    <span
      v-for="tag in tags"
      :key="tag"
      class="rounded-full bg-warn-100/15 px-2 py-0.5 text-xs font-medium text-warn-200 transition-colors duration-200"
    >
      {{ ELDER_TAG_LABEL[tag] }}
    </span>
  </div>
</template>
