<script setup lang="ts">
/** @component MR-C92 OrgTypePicker — 提供者類型 5 格：店家、學校、機關、個人、其他（合約 §4 OrgType），圖示＋文字，選中時有勾 */
/**
 * 設計 v2（docs/meal-relay/design-v2/README.md §3.4，03 左）。順序 ORG_TYPE_ORDER，icon 讀 ORG_TYPE_ICON（T-130，不寫死）。
 * 單選（radiogroup），每格高 64px 以上。
 *
 *   <OrgTypePicker v-model="form.org_type" />
 */
import { Check } from 'lucide-vue-next'
import { ORG_TYPE_ICON } from '../logic/shared'
import { ORG_TYPE_LABEL, ORG_TYPE_ORDER, type OrgType } from '../logic/supplier'

const model = defineModel<OrgType | null>({ required: true })
</script>

<template>
  <fieldset>
    <legend class="mb-2 text-sm font-medium text-grey-700">提供者類型</legend>
    <div class="grid grid-cols-5 gap-1.5" role="radiogroup" aria-label="提供者類型">
      <button
        v-for="t in ORG_TYPE_ORDER"
        :key="t"
        type="button"
        role="radio"
        class="press relative flex min-h-16 flex-col items-center justify-center gap-1 rounded-xl px-1 text-sm font-semibold ring-1 transition-colors duration-200"
        :class="model === t ? 'bg-primary-50 text-primary-700 ring-2 ring-primary-600' : 'bg-white text-grey-700 ring-grey-200'"
        :aria-checked="model === t"
        :data-org-type="t"
        @click="model = t"
      >
        <component :is="ORG_TYPE_ICON[t]" class="h-7 w-7" :stroke-width="1.75" aria-hidden="true" />
        <span>{{ ORG_TYPE_LABEL[t] }}</span>
        <span v-if="model === t" class="absolute -top-1.5 -right-1.5 flex size-5 items-center justify-center rounded-full bg-primary-600 text-white" aria-hidden="true">
          <Check class="h-3.5 w-3.5" :stroke-width="3" />
        </span>
      </button>
    </div>
  </fieldset>
</template>
