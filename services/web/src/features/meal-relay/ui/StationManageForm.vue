<script setup lang="ts">
/** @component MR-C111 StationManageForm — 據點名稱、地址、地圖選取座標與儲存／取消 */
import { BaseButton, BaseInput } from '@/ui'
import type { StationDraft } from '../logic/stationManager'
const draft = defineModel<StationDraft>({ required: true })
defineProps<{ creating: boolean; busy: boolean; disabled: boolean }>()
const emit = defineEmits<{ save: []; cancel: [] }>()
</script>

<template>
  <form class="space-y-4" @submit.prevent="emit('save')">
    <h3 class="text-lg font-bold text-primary-900">{{ creating ? '新增據點' : '修改據點' }}</h3>
    <BaseInput v-model="draft.name" label="據點名稱（必填）" :maxlength="100" :disabled="disabled || busy" />
    <BaseInput v-model="draft.address" label="據點地址（選填）" :maxlength="120" :disabled="disabled || busy" />
    <p class="text-sm text-grey-600" role="status">{{ draft.location ? `已選位置：${draft.location.lat.toFixed(6)}，${draft.location.lng.toFixed(6)}` : '尚未選位置，請點選左側或上方地圖。' }}</p>
    <p class="text-sm text-grey-600">請使用公開機構地址或模擬地址，不填真實個人住址。</p>
    <div class="flex flex-wrap gap-2">
      <BaseButton type="submit" :loading="busy" :disabled="disabled || busy">儲存據點</BaseButton>
      <BaseButton variant="outline" :disabled="busy" @click="emit('cancel')">取消</BaseButton>
    </div>
  </form>
</template>
