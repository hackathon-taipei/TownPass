<script setup lang="ts">
/** @component MR-C113 PreferredVolunteerField — 長者表單的「指定志工」下拉選單：只列所屬據點的志工，預設「不指定（由系統依最常照顧的志工派送）」；下方顯示目前最常照顧的志工 */
/**
 * v2.7（ADR-032、M16）：指定志工優先派送；沒指定時派給最常照顧的志工（M9：見到本人／放門口回報次數最多）。
 * 選項由 logic/admin.ts 的 formVolunteers 給（已依所選據點篩過）；改據點時 logic 會清掉別據點的志工。
 * 停用：沒選據點、志工清單讀取失敗（loadError）、離線（disabled）。志工手機上沒有這個欄位（M13）。
 */
import { useId } from 'vue'
import type { Volunteer } from '../logic/admin'
import { PREFERRED_NONE_TEXT } from '../logic/admin'

const model = defineModel<string>({ required: true })
defineProps<{
  volunteers: Volunteer[]
  stationSelected: boolean
  /** 修改中的長者目前最常照顧的志工名稱；沒有 → '' */
  caretaker?: string
  error?: string
  loadError?: string
  disabled?: boolean
}>()

const uid = useId()
</script>

<template>
  <div class="space-y-1.5">
    <label :for="`${uid}-preferred`" class="block text-sm font-medium text-grey-700">指定志工（選填）</label>
    <select
      :id="`${uid}-preferred`"
      v-model="model"
      class="block h-11 w-full rounded-lg border bg-white px-3 text-base outline-none focus:border-primary-500 disabled:bg-grey-50 disabled:text-grey-500"
      :class="error ? 'border-warn-200' : 'border-grey-200'"
      :disabled="disabled || !stationSelected || !!loadError"
      :aria-describedby="`${uid}-preferred-hint`"
    >
      <option value="">{{ PREFERRED_NONE_TEXT }}</option>
      <option v-for="v in volunteers" :key="v.id" :value="v.id">{{ v.name || v.id }}</option>
    </select>
    <p v-if="error" class="text-sm text-warn-200">{{ error }}</p>
    <p :id="`${uid}-preferred-hint`" class="text-sm" :class="loadError ? 'text-warn-200' : 'text-grey-500'">
      <template v-if="loadError">{{ loadError }}</template>
      <template v-else-if="!stationSelected">先選所屬據點，才能指定這個據點的志工</template>
      <template v-else-if="!volunteers.length">這個據點還沒有志工</template>
      <template v-else>報到時優先派給指定志工；他今天已報到就留給他</template>
      <template v-if="caretaker">。目前最常照顧：{{ caretaker }}</template>
    </p>
  </div>
</template>
