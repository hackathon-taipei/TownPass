<script setup lang="ts">
/** @component MR-C112 StationElderList — 所選據點長者清單（僅管理員）：代稱、過敏原、送餐及關懷狀態 */
import type { Elder } from '../logic/stationManager'
import { ALLERGEN_LABEL } from '../logic/mealLabels'
import ElderStatusTag from './ElderStatusTag.vue'
defineProps<{ elders: Elder[] }>()
</script>

<template>
  <section class="space-y-3 border-t border-grey-100 pt-4" aria-label="所屬長者列表">
    <h3 class="font-bold text-primary-900">所屬長者（{{ elders.length }}）</h3>
    <p class="text-sm text-grey-600">僅使用模擬資料</p>
    <ul v-if="elders.length" class="divide-y divide-grey-100">
      <li v-for="elder in elders" :key="elder.id" class="space-y-1 py-3">
        <p class="font-bold text-grey-900">{{ elder.alias }}</p>
        <ElderStatusTag :elder="elder" />
        <p class="text-sm text-grey-600">過敏原：{{ elder.allergens.map(a => ALLERGEN_LABEL[a]).join('、') || '沒有登記' }}</p>
      </li>
    </ul>
    <p v-else class="text-grey-600">此據點目前沒有登記長者。</p>
  </section>
</template>
