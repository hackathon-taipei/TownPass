<script setup lang="ts">
/** @component MR-C41 TaskMeal — 任務卡的送餐區：要送的餐（申請列）、過敏原警告、取餐與取消這份餐 */
/**
 * 合約 M8：claimed →（取餐）delivering；claimed、delivering 都可以取消，份數退回，任務保留只做關懷（V7）。
 * M4：食物與長者的過敏原有交集時停用取餐（MR-C16，長者之後改過敏原時的保險）。
 * 斷網或處理中（disabled）時按鈕停用（ADR-024）。
 *
 *   <TaskMeal :claim="task.claim" :elder="task.assignment.elder" :disabled="busy || offline" @pickup="…" @cancel="…" />
 */
import { ref } from 'vue'
import { BaseButton } from '@/ui'
import type { Claim, Elder } from '../logic/volunteer'
import AllergenWarning from './AllergenWarning.vue'
import ClaimRow from './ClaimRow.vue'

defineProps<{ claim: Claim; elder: Pick<Elder, 'alias' | 'allergens'>; disabled?: boolean; busy?: boolean }>()
const emit = defineEmits<{ pickup: []; cancel: [] }>()
const conflict = ref(false)
</script>

<template>
  <div class="space-y-2">
    <ClaimRow :claim="claim" />
    <AllergenWarning
      v-model:conflict="conflict"
      :food-allergens="claim.food.allergens"
      :elder-allergens="elder.allergens"
      :food-name="claim.food.name"
      :elder-name="elder.alias"
    />
    <div class="flex gap-2">
      <BaseButton
        v-if="claim.status === 'claimed'"
        class="flex-1"
        :loading="busy"
        :disabled="disabled || conflict"
        @click="emit('pickup')"
      >
        取餐
      </BaseButton>
      <BaseButton class="flex-1" variant="outline" :disabled="disabled || busy" @click="emit('cancel')">取消這份餐</BaseButton>
    </div>
  </div>
</template>
