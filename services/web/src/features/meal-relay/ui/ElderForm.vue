<script setup lang="ts">
/** @component MR-C53 ElderForm — 登記或修改長者：代號、位置（MR-C02）、據點（必填）、過敏原（MR-C01）、下次關懷／送餐時間，附隱私提示 */
/**
 * 管理系統「長者名冊」用（ADR-026：名冊只有管理員維護）。v-model 是 logic/admin.ts 的 ElderDraft，
 * 驗證與送出（createElder／updateElder）都在 logic；本元件只發 submit、cancel。
 * ADR-024：只填代號、不要填真實姓名、電話、地址；Demo 只用模擬資料。
 */
import { BaseButton, BaseCard, BaseChip, BaseInput, SectionTitle } from '@/ui'
import type { ElderDraft, ElderDraftErrors, Station } from '../logic/admin'
import { PRIVACY_NOTE } from '../logic/admin'
import type { Marker } from '../logic/mapMarker'
import AllergenChecklist from './AllergenChecklist.vue'
import LocationPicker from './LocationPicker.vue'
import SubmitButton from './SubmitButton.vue'

const draft = defineModel<ElderDraft>({ required: true })
defineProps<{
  stations: Station[]
  markers: Marker[]
  errors: ElderDraftErrors
  editingAlias?: string | null
  saving?: boolean
  disabled?: boolean
}>()
const emit = defineEmits<{ submit: []; cancel: [] }>()
</script>

<template>
  <BaseCard>
    <SectionTitle :title="editingAlias ? `修改長者：${editingAlias}` : '登記長者'" />
    <p class="mb-4 rounded-lg bg-secondary-50 px-3 py-2 text-sm text-secondary-800" role="note">{{ PRIVACY_NOTE }}</p>

    <form class="flex flex-col gap-4" novalidate @submit.prevent="emit('submit')">
      <BaseInput v-model="draft.alias" label="代號（必填）" placeholder="例：萬華-A01" :error="errors.alias" hint="不要填真實姓名、電話、地址" />

      <div>
        <p class="mb-1.5 text-sm font-medium text-grey-700">位置（必填）</p>
        <LocationPicker v-model="draft.location" :markers="markers" label="在地圖上點一下長者住處附近的路口或公共空間" :disabled="disabled" />
        <p v-if="errors.location" class="text-sm text-warn-200">{{ errors.location }}</p>
      </div>

      <fieldset>
        <legend class="mb-1.5 text-sm font-medium text-grey-700">據點（必填）</legend>
        <div class="flex flex-wrap gap-2">
          <BaseChip v-for="s in stations" :key="s.id" :active="draft.station_id === s.id" @click="draft.station_id = s.id">{{ s.name }}</BaseChip>
        </div>
        <p v-if="!stations.length" class="text-sm text-grey-500">還沒有據點資料</p>
        <p v-if="errors.station_id" class="mt-1 text-sm text-warn-200">{{ errors.station_id }}</p>
      </fieldset>

      <AllergenChecklist v-model="draft.allergens" hint="派送時會排除有這些過敏原的食物（M4）；沒有就不用選" />

      <div class="grid gap-3 sm:grid-cols-2">
        <BaseInput v-model="draft.next_care_at" type="datetime-local" label="下次關懷時間" :error="errors.next_care_at" hint="沒設定時依最近見到的日期判斷" />
        <BaseInput v-model="draft.next_meal_at" type="datetime-local" label="下次送餐時間" :error="errors.next_meal_at" hint="沒設定時依最近送餐的日期判斷" />
      </div>

      <SubmitButton :loading="saving" :disabled="disabled">{{ editingAlias ? '儲存修改' : '登記長者' }}</SubmitButton>
      <BaseButton v-if="editingAlias" variant="ghost" block @click="emit('cancel')">取消修改</BaseButton>
    </form>
  </BaseCard>
</template>
