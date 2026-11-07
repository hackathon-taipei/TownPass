<script setup lang="ts">
/** @component MR-C75 VolunteerGreeting — 志工首頁問候：企鵝頭像＋「{名字}，辛苦了！」＋「已報到」或「還沒報到」晶片 */
/**
 * 設計 v2 01 中（design-v2/README.md §3.2）。名字用 Me.name；晶片是狀態，不能點。
 *
 *   <VolunteerGreeting :name="name" :checked-in="checkedIn" />
 */
import { CircleCheck, Clock } from 'lucide-vue-next'
import MascotBadge from './MascotBadge.vue'

defineProps<{ name: string; checkedIn: boolean }>()
</script>

<template>
  <div class="flex items-center gap-4">
    <MascotBadge :size="76" glow />
    <div class="min-w-0 flex-1">
      <p class="text-xl font-extrabold break-words text-grey-900">{{ name }}，辛苦了！</p>
      <span
        class="mt-2 inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-base font-bold"
        :class="checkedIn ? 'bg-primary-100 text-primary-700' : 'bg-grey-100 text-grey-600'"
        :data-checked-in="checkedIn"
      >
        <component :is="checkedIn ? CircleCheck : Clock" class="h-5 w-5" aria-hidden="true" />
        {{ checkedIn ? '已報到' : '還沒報到' }}
      </span>
    </div>
  </div>
</template>
