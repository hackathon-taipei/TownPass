<script setup lang="ts">
/** @component MR-C75 VolunteerGreeting — 志工首頁問候：企鵝頭像＋「{名字}，辛苦了！」＋「已報到」或「還沒報到」晶片 */
/**
 * 設計 v2 01 中（design-v2/README.md §3.2）。名字用 Me.name；晶片是狀態，不能點。
 *
 *   <VolunteerGreeting :name="name" :checked-in="checkedIn" />
 */
import { Check, Clock } from 'lucide-vue-next'
import MascotBadge from './MascotBadge.vue'

defineProps<{ name: string; checkedIn: boolean }>()
</script>

<template>
  <div class="flex min-h-32 items-center gap-6 px-3">
    <MascotBadge :size="92" glow />
    <div class="min-w-0 flex-1">
      <p class="text-[clamp(1.125rem,5.5vw,1.625rem)] leading-tight font-black break-words text-primary-800">{{ name }}，辛苦了！</p>
      <span
        class="mt-2.5 inline-flex h-10 items-center gap-1.5 rounded-2xl px-3 text-lg font-bold"
        :class="checkedIn ? 'bg-primary-200 text-primary-800' : 'bg-grey-100 text-grey-600'"
        :data-checked-in="checkedIn"
      >
        <Check v-if="checkedIn" class="size-5 rounded-full bg-primary-700 p-0.5 text-white" :stroke-width="3" aria-hidden="true" />
        <Clock v-else class="size-5" aria-hidden="true" />
        {{ checkedIn ? '已報到' : '還沒報到' }}
      </span>
    </div>
  </div>
</template>
