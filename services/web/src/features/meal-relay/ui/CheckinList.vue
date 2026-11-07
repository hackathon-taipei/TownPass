<script setup lang="ts">
/** @component MR-C47 CheckinList — 今天報到的志工清單：「今天報到・N 位」，新的在上 */
/**
 * 設計 v2 §3.5 第 6 項：人群圖示＋「今天報到・N 位」，每位一列淺灰圓角（MR-C48）。
 * checkins 已由 logic/station.ts 依報到時間排好（新的在上）。新報到的志工從上方進場（kit B4）。
 *
 *   <CheckinList :checkins="checkins" />
 */
import './motion.css'
import { Users } from 'lucide-vue-next'
import type { Checkin } from '../logic/station'
import CheckinRow from './CheckinRow.vue'

defineProps<{ checkins: Checkin[] }>()
</script>

<template>
  <section>
    <h2 class="flex items-center gap-2 text-xl font-bold text-grey-900">
      <Users class="h-6 w-6 shrink-0 text-primary-600" :stroke-width="2.25" aria-hidden="true" />
      <span>今天報到・<span class="tabular-nums">{{ checkins.length }}</span> 位</span>
    </h2>
    <p v-if="!checkins.length" class="py-4 text-base text-grey-500">今天還沒有志工報到</p>
    <TransitionGroup v-else name="list" tag="ul" class="mt-3 space-y-2">
      <li v-for="c in checkins" :key="c.id">
        <CheckinRow :checkin="c" />
      </li>
    </TransitionGroup>
  </section>
</template>
