<script setup lang="ts">
/** @component MR-C20 AllergenChips — 過敏原晶片勾選：11 類，點一下換色（D8） */
/**
 * 長者勾過敏、志工新增長者、提供者上架時用。顏色過渡 --motion-fast，按下縮小（press）。
 * 和 T-114 的 AllergenChecklist（MR-C01）用途相同：二選一，或讓 MR-C01 直接包這個元件。
 *
 *   <AllergenChips v-model="allergens" />
 */
import './motion.css'
import type { Allergen } from '../logic/mealLabels'
import { ALLERGEN_LABEL, ALLERGENS } from '../logic/mealLabels'

defineProps<{ label?: string }>()
const picked = defineModel<Allergen[]>({ required: true })

function toggle(a: Allergen) {
  picked.value = picked.value.includes(a) ? picked.value.filter((x) => x !== a) : [...picked.value, a]
}
</script>

<template>
  <fieldset>
    <legend class="mb-2 text-sm font-semibold text-grey-900">{{ label ?? '過敏原（可複選）' }}</legend>
    <div class="flex flex-wrap gap-2">
      <button
        v-for="a in ALLERGENS"
        :key="a"
        type="button"
        class="press h-10 rounded-full px-4 text-base font-medium ring-1 transition-colors duration-[120ms]"
        :class="picked.includes(a) ? 'bg-primary-500 text-white ring-primary-500' : 'bg-white text-grey-700 ring-grey-200'"
        :aria-pressed="picked.includes(a)"
        @click="toggle(a)"
      >
        {{ ALLERGEN_LABEL[a] }}
      </button>
    </div>
  </fieldset>
</template>
