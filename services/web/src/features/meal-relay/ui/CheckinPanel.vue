<script setup lang="ts">
/** @component MR-C43 CheckinPanel — 志工報到：App 掃描據點 QR，沒有 App 時貼上 QR 文字 */
/**
 * 合約 §9、M15：志工頁按「掃描報到」→ App 的 qr_code_scan（相機或相簿圖片）；瀏覽器沒有 App 時改成貼上 QR 文字。
 * 斷網時（disabled）送出鍵停用（ADR-024）。不呼叫 API，掃描與報到由頁面的 logic 處理。
 *
 *   <CheckinPanel v-model:pasted="pasted" :scannable="scannable" :submitting="submitting"
 *                 :disabled="offline" :error="checkinError" @scan="scan" @submit-pasted="submitPasted" />
 */
import './motion.css'
import { ScanLine } from 'lucide-vue-next'
import { BaseButton, BaseCard, BaseInput } from '@/ui'

defineProps<{ scannable: boolean; submitting?: boolean; disabled?: boolean; error?: string }>()
const pasted = defineModel<string>('pasted', { required: true })
const emit = defineEmits<{ scan: []; submitPasted: [] }>()
</script>

<template>
  <BaseCard>
    <p class="text-base text-grey-800">到據點後，掃描據點畫面上的 QR code 報到，系統會把要送餐或關懷的長者派給你。</p>
    <div class="mt-3 space-y-3">
      <BaseButton
        v-if="scannable"
        block
        size="lg"
        :icon="ScanLine"
        :loading="submitting"
        :disabled="disabled"
        @click="emit('scan')"
      >
        掃描報到
      </BaseButton>
      <form v-else class="space-y-3" @submit.prevent="emit('submitPasted')">
        <BaseInput
          v-model="pasted"
          label="貼上據點的 QR 文字"
          placeholder="meal-relay:checkin:…"
          hint="在 App 裡可以直接掃描；這裡是沒有 App 時用的"
        />
        <BaseButton type="submit" block :loading="submitting" :disabled="disabled || !pasted.trim()">報到</BaseButton>
      </form>
      <Transition name="fade-up">
        <p v-if="error" class="text-sm text-warn-200" role="alert">{{ error }}</p>
      </Transition>
    </div>
  </BaseCard>
</template>
