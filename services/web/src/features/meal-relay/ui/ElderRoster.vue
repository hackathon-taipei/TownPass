<script setup lang="ts">
/** @component MR-C54 ElderRoster — 長者名冊清單：「新增長者」、每位長者的人像圖示、稱呼、代號與據點、負責志工（指定志工／最常照顧）、狀態（需要送餐／需要關懷／近期已見到）、右箭頭；點一位發 edit */
/**
 * 管理系統「長者名冊」分頁左側（設計 v2 §3.6、02-admin.webp 右下；ADR-026：名冊只在管理系統，志工畫面不能出現長者清單）。
 * 狀態由 logic/admin.ts 的 elderStatusOf 決定（M10）：需要處理的用 warn 色，近期已見到用主色（T-126 三色）。
 * 點一位 → emit edit（父層把 MR-C53 ElderForm 切成修改模式；手機上打開底部面板）；「新增長者」→ emit add（空白表單）。
 * 只看名冊不是寫入，離線時也可以點開；送出由表單停用。
 */
import { computed } from 'vue'
import { ChevronRight, Plus, UserRound } from 'lucide-vue-next'
import { BaseButton } from '@/ui'
import type { Elder, Station, Volunteer } from '../logic/admin'
import { ELDER_STATUS_LABEL, caretakerText, elderStatusOf } from '../logic/admin'

const props = defineProps<{ elders: Elder[]; stations: Station[]; activeId?: string | null; error?: string; volunteers?: Volunteer[] }>()
const emit = defineEmits<{ edit: [elder: Elder]; add: [] }>()

const rows = computed(() =>
  props.elders.map((elder) => ({
    elder,
    status: elderStatusOf(elder),
    stationName: props.stations.find((s) => s.id === elder.station_id)?.name ?? elder.station_id,
    caretaker: caretakerText(elder, props.volunteers ?? []), // v2.7 ADR-032
  })),
)
</script>

<template>
  <section class="flex flex-col gap-3" aria-label="長者清單">
    <BaseButton variant="outline" block :icon="Plus" @click="emit('add')">新增長者</BaseButton>
    <p v-if="error" role="alert" class="text-sm text-warn-200">{{ error }}</p>

    <ul v-if="rows.length" class="flex flex-col gap-1 lg:max-h-96 lg:overflow-y-auto" tabindex="0" aria-label="名冊">
      <li v-for="{ elder, status, stationName, caretaker } in rows" :key="elder.id" class="border-b border-grey-200 last:border-none">
        <button
          type="button"
          class="press flex min-h-12 w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left transition-colors duration-200"
          :class="activeId === elder.id ? 'bg-primary-100' : 'bg-white hover:bg-grey-50'"
          :aria-current="activeId === elder.id ? 'true' : undefined"
          @click="emit('edit', elder)"
        >
          <UserRound class="h-6 w-6 shrink-0 text-primary-700" :stroke-width="1.75" aria-hidden="true" />
          <span class="min-w-0 flex-1">
            <span class="block truncate text-base font-bold text-grey-900">{{ elder.alias }}</span>
            <span class="block truncate text-xs text-grey-500">代號 {{ elder.id }}・{{ stationName }}</span>
            <span v-if="caretaker" class="block truncate text-xs text-grey-600">{{ caretaker }}</span>
          </span>
          <span class="shrink-0 border-l border-grey-300 pl-2.5 text-sm font-medium" :class="status === 'seen' ? 'text-primary-700' : 'text-warn-200'">
            {{ ELDER_STATUS_LABEL[status] }}
          </span>
          <ChevronRight class="h-5 w-5 shrink-0 text-grey-400" aria-hidden="true" />
        </button>
      </li>
    </ul>
    <p v-if="!elders.length" class="py-4 text-center text-sm text-grey-500">名冊還沒有長者</p>
    <p class="text-xs text-grey-500">名冊只在管理系統，志工手機上看不到（ADR-026）。</p>
  </section>
</template>
