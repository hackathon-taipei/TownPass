<script setup lang="ts">
/** @component MR-C48 CheckinRow — 今天報到的一位志工：企鵝頭像、名字、報到時間（淺灰圓角列） */
/**
 * 設計 v2 §3.5 第 6 項（04 左）：一列一位，時間靠右（臺北時間 HH:mm）。
 *
 *   <CheckinRow :checkin="c" />
 */
import { computed } from 'vue'
import type { Checkin } from '../logic/station'
import { checkinTimeText } from '../logic/station'
import VolunteerAvatar from './VolunteerAvatar.vue'

const props = defineProps<{ checkin: Checkin }>()
const time = computed(() => checkinTimeText(props.checkin.checked_in_at))
</script>

<template>
  <div class="flex min-h-14 items-center gap-3 rounded-xl bg-grey-50 px-3 py-2">
    <VolunteerAvatar :id="checkin.volunteer_id" :size="40" />
    <span class="min-w-0 flex-1 truncate text-lg font-bold text-grey-900">{{ checkin.volunteer_name }}</span>
    <time class="shrink-0 text-lg tabular-nums text-grey-700" :datetime="checkin.checked_in_at">{{ time }}</time>
  </div>
</template>
