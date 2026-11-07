<script setup lang="ts">
/** @component MR-C54 ElderRow — 名冊的一位長者：代號、據點、警示標籤（MR-C04）、過敏原、最近見到與下次時間，加「修改」 */
/**
 * 管理系統「長者名冊」用（志工畫面不能出現長者清單，ADR-026）。文字由 logic/admin.ts 的 elderSummary 組出。
 */
import { BaseButton } from '@/ui'
import type { Elder, ElderSummary } from '../logic/admin'
import ElderStatusTag from './ElderStatusTag.vue'

defineProps<{ elder: Elder; summary: ElderSummary; active?: boolean; disabled?: boolean }>()
const emit = defineEmits<{ edit: [elder: Elder] }>()
</script>

<template>
  <div class="flex items-start gap-3 py-3" :class="active && 'rounded-lg bg-primary-50 px-2'">
    <div class="min-w-0 flex-1 space-y-1">
      <p class="font-medium text-grey-900">
        {{ elder.alias }}<span class="ml-2 text-sm font-normal text-grey-500">{{ summary.stationName }}</span>
      </p>
      <ElderStatusTag :elder="elder" />
      <p class="text-sm text-grey-600">過敏：{{ summary.allergensText }}・{{ summary.seenText }}</p>
      <p class="text-xs text-grey-500">{{ summary.nextText }}</p>
    </div>
    <BaseButton variant="outline" size="sm" :disabled="disabled" :aria-label="`修改 ${elder.alias}`" @click="emit('edit', elder)">修改</BaseButton>
  </div>
</template>
