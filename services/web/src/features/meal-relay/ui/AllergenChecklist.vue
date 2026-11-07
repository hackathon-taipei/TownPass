<script setup lang="ts">
/** @component MR-C01 AllergenChecklist — 過敏原勾選：包 MR-C20 AllergenChips，加上說明與已選摘要 */
/**
 * 提供者上架、管理員登記長者時用。直接包 MR-C20，不另外重做晶片。
 * 下方摘要用 shared.ts 的 ALLERGEN_LABEL 轉中文；沒選時顯示「沒有過敏原」。
 *
 *   <AllergenChecklist v-model="allergens" hint="沒有就不用選" />
 */
import type { Allergen } from '../logic/shared'
import { ALLERGEN_LABEL } from '../logic/shared'
import AllergenChips from './AllergenChips.vue'

withDefaults(defineProps<{ label?: string; hint?: string }>(), {
  label: '過敏原（可複選）',
  hint: undefined,
})
const picked = defineModel<Allergen[]>({ required: true })
</script>

<template>
  <div>
    <AllergenChips v-model="picked" :label="label" />
    <p v-if="hint" class="mt-1 text-xs text-grey-500">{{ hint }}</p>
    <p class="mt-2 text-sm text-grey-700" aria-live="polite">
      <template v-if="picked.length">
        已選 {{ picked.length }} 項：{{ picked.map((a) => ALLERGEN_LABEL[a]).join('、') }}
      </template>
      <template v-else>沒有過敏原</template>
    </p>
  </div>
</template>
