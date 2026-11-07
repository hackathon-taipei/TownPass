<script setup lang="ts">
/** @component MR-C04 ElderStatusTag — 長者警示標籤：需要送餐／需要關懷／從未見到（M10） */
/**
 * 志工任務、管理員名冊用。標籤順序與文字來自 shared.ts（elderTagsOf、ELDER_TAG_LABEL）。
 * 沒有任何標籤時顯示「狀況正常」。
 *
 *   <ElderStatusTag :elder="elder" />
 */
import type { Elder, ElderTag } from '../logic/shared'
import { ELDER_TAG_LABEL, elderTagsOf } from '../logic/shared'

const props = defineProps<{ elder: Pick<Elder, 'meal_due' | 'care_due' | 'last_seen_at'> }>()

const TAG_CLASS: Record<ElderTag, string> = {
  meal_due: 'bg-warn-100/15 text-warn-200',
  care_due: 'bg-secondary-100 text-secondary-800',
  never_seen: 'bg-grey-50 text-grey-600',
}
</script>

<template>
  <div class="flex flex-wrap items-center gap-1">
    <template v-if="elderTagsOf(props.elder).length">
      <span
        v-for="tag in elderTagsOf(props.elder)"
        :key="tag"
        class="rounded-full px-2 py-0.5 text-xs font-medium transition-colors duration-200"
        :class="TAG_CLASS[tag]"
      >
        {{ ELDER_TAG_LABEL[tag] }}
      </span>
    </template>
    <span v-else class="rounded-full bg-success/15 px-2 py-0.5 text-xs font-medium text-success transition-colors duration-200">狀況正常</span>
  </div>
</template>
