<script setup lang="ts">
/** @component MR-C89 CategoryPicker — 食物類別晶片：便當、麵包、蔬果、其他；「其他」展開成乾貨、飲料、其他（合約 §4 FoodCategory） */
/**
 * 設計 v2（docs/meal-relay/design-v2/README.md §3.4，03 右）。選項與值在 logic/supplier.ts 的 CATEGORY_MAIN、CATEGORY_MORE。
 * icon 用 MR-C56 CategoryIcon（T-130，只畫 icon，文字用設計的短名稱）。
 * 已選的是「其他」裡的類別時，「其他」一開始就展開。
 *
 *   <CategoryPicker v-model="form.category" />
 */
import './motion.css'
import { ref } from 'vue'
import { ChevronDown } from 'lucide-vue-next'
import { BaseChip } from '@/ui'
import { CATEGORY_MAIN, CATEGORY_MORE, isMoreCategory, type FoodCategory } from '../logic/supplier'
import CategoryIcon from './CategoryIcon.vue'

const model = defineModel<FoodCategory | null>({ required: true })
const moreOpen = ref(isMoreCategory(model.value))
</script>

<template>
  <fieldset>
    <legend class="mb-2 text-sm font-medium text-grey-700">類別</legend>
    <div class="flex flex-wrap gap-2">
      <BaseChip v-for="c in CATEGORY_MAIN" :key="c.value" :active="model === c.value" :data-category="c.value" @click="model = c.value">
        <CategoryIcon kind="food" :value="c.value" :label="false" />{{ c.label }}
      </BaseChip>
      <BaseChip :active="moreOpen || isMoreCategory(model)" :aria-expanded="moreOpen" data-category="more" @click="moreOpen = !moreOpen">
        其他
        <ChevronDown class="h-4 w-4 transition-transform duration-200" :class="{ 'rotate-180': moreOpen }" aria-hidden="true" />
      </BaseChip>
    </div>
    <Transition name="fade-up">
      <div v-if="moreOpen" class="mt-2 flex flex-wrap gap-2 rounded-xl bg-grey-50 p-2" role="group" aria-label="其他類別">
        <BaseChip v-for="c in CATEGORY_MORE" :key="c.value" :active="model === c.value" :data-category="c.value" @click="model = c.value">
          <CategoryIcon kind="food" :value="c.value" :label="false" />{{ c.label }}
        </BaseChip>
      </div>
    </Transition>
  </fieldset>
</template>
