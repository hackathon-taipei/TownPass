<script setup lang="ts">
/** @component MR-C53 ElderForm — 長者表單：代號（長者 id，唯讀）、稱呼、所屬據點、模擬地址、過敏原（MR-C01）、下次關懷時間；「更多設定」（MR-C65）裡是下次送餐時間與位置（MR-C02）；「儲存變更」 */
/**
 * 管理系統「長者名冊」右側（設計 v2 §3.6、02-admin.webp 右下；ADR-026：名冊只有管理員維護）。
 * v-model 是 logic/admin.ts 的 ElderDraft，驗證與送出（createElder／updateElder）都在 logic；本元件只發 submit、cancel。
 * - 代號：長者 id（elderId），唯讀；新增時還沒有 id，顯示「儲存後自動產生」
 * - 稱呼：Elder.alias（例：陳阿公），必填；ADR-024 只用代稱，不要填真實姓名、電話
 * - 模擬地址：ADR-027 只能是模擬地址（真實路名＋不存在的門牌，標「（模擬）」），選填，最多 ADDRESS_MAX 字
 * - 更多設定：下次送餐時間（Demo 劇本第 9 步）與位置（合約 ElderCreate.location 必填）。新增時、或這兩欄有錯誤時自動展開
 * plain = true 時不包卡片、不顯示標題（手機上放在 MR-C09 BottomSheet 裡，標題由面板顯示）。
 */
import { ref, useId, watch } from 'vue'
import { BaseButton, BaseCard, BaseInput } from '@/ui'
import type { ElderDraft, ElderDraftErrors, Station } from '../logic/admin'
import { ADDRESS_MAX, NEW_ELDER_ID_TEXT, PRIVACY_NOTE } from '../logic/admin'
import type { Marker } from '../logic/mapMarker'
import Accordion from './Accordion.vue'
import AllergenChecklist from './AllergenChecklist.vue'
import LocationPicker from './LocationPicker.vue'
import SubmitButton from './SubmitButton.vue'

const draft = defineModel<ElderDraft>({ required: true })
const props = defineProps<{
  stations: Station[]
  markers: Marker[]
  errors: ElderDraftErrors
  /** 修改中的長者 id；null／undefined = 新增 */
  elderId?: string | null
  saving?: boolean
  disabled?: boolean
  plain?: boolean
}>()
const emit = defineEmits<{ submit: []; cancel: [] }>()

const uid = useId()
const moreOpen = ref(!props.elderId)
watch(
  () => props.elderId,
  (id) => (moreOpen.value = !id),
)
watch(
  () => [props.errors.location, props.errors.next_meal_at],
  ([location, meal]) => {
    if (location || meal) moreOpen.value = true
  },
)

const fieldLabel = 'block text-sm font-medium text-grey-700'
const fieldBox = 'block h-11 w-full rounded-lg border bg-white px-3 text-base outline-none focus:border-primary-500'
</script>

<template>
  <component :is="plain ? 'div' : BaseCard">
    <h2 v-if="!plain" class="mb-3 text-lg font-bold text-grey-900">{{ elderId ? `修改長者：${draft.alias || elderId}` : '新增長者' }}</h2>

    <form class="flex flex-col gap-4" novalidate @submit.prevent="emit('submit')">
      <div class="space-y-1.5">
        <label :for="`${uid}-id`" :class="fieldLabel">代號</label>
        <input :id="`${uid}-id`" :value="elderId || NEW_ELDER_ID_TEXT" readonly :class="fieldBox" class="border-grey-200 bg-grey-50 text-grey-600" />
      </div>

      <BaseInput v-model="draft.alias" label="稱呼（必填）" placeholder="例：陳阿公" :error="errors.alias" hint="只用代稱，不要填真實姓名、電話" />

      <div class="space-y-1.5">
        <label :for="`${uid}-station`" :class="fieldLabel">所屬據點（必填）</label>
        <select :id="`${uid}-station`" v-model="draft.station_id" :class="[fieldBox, errors.station_id ? 'border-warn-200' : 'border-grey-200']">
          <option value="" disabled>請選據點</option>
          <option v-for="s in stations" :key="s.id" :value="s.id">{{ s.name }}</option>
        </select>
        <p v-if="errors.station_id" class="text-sm text-warn-200">{{ errors.station_id }}</p>
        <p v-else-if="!stations.length" class="text-sm text-grey-500">還沒有據點資料</p>
      </div>

      <BaseInput
        v-model="draft.address"
        label="模擬地址（選填）"
        placeholder="例：臺北市萬華區西園路一段 999 號（模擬）"
        :error="errors.address"
        :hint="`只能填模擬地址（門牌不存在、標「（模擬）」），最多 ${ADDRESS_MAX} 個字`"
      />

      <AllergenChecklist v-model="draft.allergens" label="過敏原" hint="派送時會排除有這些過敏原的食物（M4）；沒有就不用選" />

      <BaseInput v-model="draft.next_care_at" type="datetime-local" label="下次關懷時間" :error="errors.next_care_at" hint="沒設定時依最近見到的日期判斷" />

      <Accordion v-model="moreOpen" title="更多設定">
        <div class="flex flex-col gap-4">
          <BaseInput v-model="draft.next_meal_at" type="datetime-local" label="下次送餐時間" :error="errors.next_meal_at" hint="沒設定時依最近送餐的日期判斷" />
          <div>
            <p class="mb-1.5 text-sm font-medium text-grey-700">位置（必填）</p>
            <LocationPicker v-model="draft.location" :markers="markers" label="在地圖上點一下長者住處附近的路口或公共空間" :disabled="disabled" />
            <p v-if="errors.location" class="text-sm text-warn-200">{{ errors.location }}</p>
          </div>
        </div>
      </Accordion>

      <p class="rounded-lg bg-secondary-50 px-3 py-2 text-xs text-secondary-800" role="note">{{ PRIVACY_NOTE }}</p>

      <SubmitButton :loading="saving" :disabled="disabled">儲存變更</SubmitButton>
      <BaseButton v-if="elderId" variant="ghost" block @click="emit('cancel')">取消修改</BaseButton>
    </form>
  </component>
</template>
