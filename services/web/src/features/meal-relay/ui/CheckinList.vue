<script setup lang="ts">
/** @component MR-C47 CheckinList — 今天報到的志工清單，新的在上 */
/**
 * checkins 已由 logic/station.ts 依報到時間排好（新的在上）。新報到的志工從上方進場（kit B4）。
 *
 *   <CheckinList :checkins="checkins" />
 */
import './motion.css'
import { SectionTitle } from '@/ui'
import type { Checkin } from '../logic/station'
import CheckinRow from './CheckinRow.vue'

defineProps<{ checkins: Checkin[] }>()
</script>

<template>
  <section>
    <SectionTitle :title="`今天報到（${checkins.length} 位）`" />
    <p v-if="!checkins.length" class="py-4 text-base text-grey-500">今天還沒有志工報到</p>
    <TransitionGroup v-else name="list" tag="ul" class="divide-y divide-grey-100">
      <li v-for="c in checkins" :key="c.id">
        <CheckinRow :checkin="c" />
      </li>
    </TransitionGroup>
  </section>
</template>
