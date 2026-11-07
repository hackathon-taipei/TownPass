<script setup lang="ts">
/** @component MR-C43 CheckinPanel — 志工報到：還沒報到是主按鈕「掃描據點 QR 報到」，已報到是次按鈕「重新掃碼報到」；沒有 App 時貼上 QR 文字 */
/**
 * 設計 v2 01 中（design-v2/README.md §2、§3.2）。合約 §9、M15：按鈕 → App 的 qr_code_scan（相機或相簿圖片）；
 * 瀏覽器沒有 App 時改成貼上 QR 文字。重複報到不會重複派送（V15）。
 * 斷網時（disabled）按鈕停用（ADR-024）。不呼叫 API，掃描與報到由頁面的 logic 處理。
 *
 *   <CheckinPanel v-model:pasted="pasted" :checked-in="checkedIn" :scannable="scannable" :submitting="submitting"
 *                 :disabled="offline" :error="checkinError" @scan="scan" @submit-pasted="submitPasted" />
 */
import './motion.css'
import { ScanLine } from 'lucide-vue-next'
import { BaseButton, BaseInput } from '@/ui'

defineProps<{ checkedIn?: boolean; scannable: boolean; submitting?: boolean; disabled?: boolean; error?: string }>()
const pasted = defineModel<string>('pasted', { required: true })
const emit = defineEmits<{ scan: []; submitPasted: [] }>()
</script>

<template>
  <div class="space-y-2">
    <p v-if="!checkedIn" class="text-base text-grey-700">到據點後，掃描據點畫面上的 QR code 報到，系統會把要送餐或關懷的長者派給你。</p>
    <BaseButton
      v-if="scannable"
      class="rounded-xl"
      block
      size="lg"
      :variant="checkedIn ? 'outline' : 'primary'"
      :icon="ScanLine"
      :loading="submitting"
      :disabled="disabled"
      @click="emit('scan')"
    >
      {{ checkedIn ? '重新掃碼報到' : '掃描據點 QR 報到' }}
    </BaseButton>
    <form v-else class="space-y-2" @submit.prevent="emit('submitPasted')">
      <BaseInput
        v-model="pasted"
        label="貼上據點的 QR 文字"
        placeholder="meal-relay:checkin:…"
        hint="在 App 裡可以直接掃描；這裡是沒有 App 時用的"
      />
      <BaseButton
        class="rounded-xl"
        type="submit"
        block
        size="lg"
        :variant="checkedIn ? 'outline' : 'primary'"
        :loading="submitting"
        :disabled="disabled || !pasted.trim()"
      >
        {{ checkedIn ? '重新報到' : '報到' }}
      </BaseButton>
    </form>
    <p v-if="checkedIn" class="text-center text-sm text-grey-500">重複報到不會重複派送</p>
    <Transition name="fade-up">
      <p v-if="error" class="text-sm text-warn-200" role="alert">{{ error }}</p>
    </Transition>
  </div>
</template>
