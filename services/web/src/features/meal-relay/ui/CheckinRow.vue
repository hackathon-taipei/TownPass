<script setup lang="ts">
/** @component MR-C48 CheckinRow — 今天報到的一位志工：企鵝頭像、名字、報到時間 */
/**
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
  <div class="flex min-h-14 items-center gap-3 py-2">
    <VolunteerAvatar :id="checkin.volunteer_id" :size="48" />
    <span class="min-w-0 flex-1 truncate text-lg font-medium text-grey-900">{{ checkin.volunteer_name }}</span>
    <span class="shrink-0 text-base tabular-nums text-grey-500">{{ time }} 報到</span>
  </div>
</template>
