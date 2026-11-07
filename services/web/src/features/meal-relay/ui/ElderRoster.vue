<script setup lang="ts">
/** @component MR-C54 ElderRoster — 長者名冊：每位長者的代號、據點、地址、警示標籤（MR-C04）、過敏原、最近見到與下次時間，加「修改」 */
/**
 * 管理系統「長者名冊」分頁左側（ADR-026：名冊只在管理系統，志工畫面不能出現長者清單）。
 * 每一列的文字由 logic/admin.ts 的 elderSummary 組出；按「修改」發 edit，父層把 MR-C53 ElderForm 切成修改模式。
 */
import { computed } from 'vue'
import { BaseButton, BaseCard, SectionTitle } from '@/ui'
import type { Elder, Station } from '../logic/admin'
import { elderSummary } from '../logic/admin'
import ElderStatusTag from './ElderStatusTag.vue'

const props = defineProps<{ elders: Elder[]; stations: Station[]; activeId?: string | null; disabled?: boolean; error?: string }>()
const emit = defineEmits<{ edit: [elder: Elder] }>()
const rows = computed(() => props.elders.map((elder) => ({ elder, summary: elderSummary(elder, props.stations) })))
</script>

<template>
  <BaseCard>
    <SectionTitle :title="`長者名冊（${elders.length}）`" />
    <p v-if="error" role="alert" class="mb-2 text-sm text-warn-200">{{ error }}</p>
    <ul class="divide-y divide-grey-100">
      <li
        v-for="{ elder, summary } in rows"
        :key="elder.id"
        class="flex items-start gap-3 py-3"
        :class="activeId === elder.id && 'rounded-lg bg-primary-50 px-2'"
      >
        <div class="min-w-0 flex-1 space-y-1">
          <p class="font-medium text-grey-900">
            {{ elder.alias }}<span class="ml-2 text-sm font-normal text-grey-500">{{ summary.stationName }}</span>
          </p>
          <p class="text-sm break-words" :class="elder.address ? 'text-grey-700' : 'text-grey-500'">{{ summary.addressText }}</p>
          <ElderStatusTag :elder="elder" />
          <p class="text-sm text-grey-600">過敏：{{ summary.allergensText }}・{{ summary.seenText }}</p>
          <p class="text-xs text-grey-500">{{ summary.nextText }}</p>
        </div>
        <BaseButton variant="outline" size="sm" :disabled="disabled" :aria-label="`修改 ${elder.alias}`" @click="emit('edit', elder)">
          修改
        </BaseButton>
      </li>
    </ul>
    <p v-if="!elders.length" class="py-4 text-center text-sm text-grey-500">名冊還沒有長者</p>
    <p class="mt-3 text-xs text-grey-500">名冊只在管理系統，志工手機上看不到（ADR-026）。全部是模擬資料。</p>
  </BaseCard>
</template>
