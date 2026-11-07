<script setup lang="ts">
/** @component MR-C56 CategoryIcon — 分類 icon＋中文：食物類別、提供者類型、食物點種類（合約 §4，lucide 單色） */
/**
 * T-130：icon 對照只讀 logic/mealLabels.ts 的 FOOD_CATEGORY_ICON、ORG_TYPE_ICON、POINT_KIND_ICON，不在這裡寫死。
 * 單色：icon 用 currentColor，跟著外層文字顏色（例如 BaseChip 選中時變白），不新增顏色。
 * icon 設 aria-hidden，文字給螢幕閱讀器；icon 一律搭配中文，`label=false` 只給外層自己已經寫了中文的情況。
 *
 *   <CategoryIcon kind="food" :value="food.category" />
 *   <CategoryIcon kind="org" :value="supplier.org_type" />
 */
import { computed, type Component } from 'vue'
import { FOOD_CATEGORY_ICON, FOOD_CATEGORY_LABEL, ORG_TYPE_ICON, POINT_KIND_ICON } from '../logic/shared'
import { ORG_TYPE_LABEL, POINT_KIND_LABEL } from '../logic/supplier'

type Kind = 'food' | 'org' | 'point'

const props = withDefaults(defineProps<{ kind: Kind; value: string; label?: boolean }>(), { label: true })

const TABLES: Record<Kind, { icon: Record<string, Component>; text: Record<string, string> }> = {
  food: { icon: FOOD_CATEGORY_ICON, text: FOOD_CATEGORY_LABEL },
  org: { icon: ORG_TYPE_ICON, text: ORG_TYPE_LABEL },
  point: { icon: POINT_KIND_ICON, text: POINT_KIND_LABEL },
}

const icon = computed<Component | null>(() => TABLES[props.kind].icon[props.value] ?? null)
const text = computed(() => TABLES[props.kind].text[props.value] ?? props.value)
</script>

<template>
  <span class="inline-flex items-center gap-1.5">
    <component :is="icon" v-if="icon" :size="18" :stroke-width="2" class="shrink-0" aria-hidden="true" />
    <span v-if="label">{{ text }}</span>
  </span>
</template>
