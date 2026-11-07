<script setup lang="ts">
/** @component MR-C47 CheckinList — 今天報到的志工清單：標題「今天報到・N 位」，新的在上 */
/**
 * 設計 v2 §3.5 第 6 項（04 左）。checkins 已由 logic/station.ts 依報到時間排好（新的在上）。
 * 新報到的志工從上方進場（kit B4）。
 *
 *   <CheckinList :checkins="checkins" />
 */
import './motion.css'
import { computed } from 'vue'
import { UsersRound } from 'lucide-vue-next'
import type { Checkin } from '../logic/station'
import { checkinHeading } from '../logic/station'
import CheckinRow from './CheckinRow.vue'

const props = defineProps<{ checkins: Checkin[] }>()
const heading = computed(() => checkinHeading(props.checkins.length))
</script>

<template>
  <section class="border-t border-grey-200 pt-3">
    <h2 class="flex items-center gap-2.5 text-xl font-extrabold text-primary-900">
      <UsersRound class="size-6 shrink-0 text-primary-700" aria-hidden="true" />{{ heading }}
    </h2>
    <p v-if="!checkins.length" class="py-4 text-base text-grey-500">今天還沒有志工報到</p>
    <TransitionGroup v-else name="list" tag="ul" class="mt-2 space-y-1">
      <li v-for="c in checkins" :key="c.id">
        <CheckinRow :checkin="c" />
      </li>
    </TransitionGroup>
  </section>
</template>
