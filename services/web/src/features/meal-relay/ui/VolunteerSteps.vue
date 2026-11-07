<script setup lang="ts">
/** @component MR-C76 VolunteerSteps — 志工首頁步驟列：報到 → 取餐 → 回報（MR-C63 圖示版），目前步驟依任務狀態 */
/**
 * 設計 v2 01 中最下面（design-v2/README.md §3.2）。目前步驟由 logic 的 volunteerStepOf() 決定：
 * 0 報到（還沒報到）、1 取餐（有待取餐的任務）、2 回報（都在配送中或純關懷）、3 全部完成（三步都打勾）。
 *
 *   <VolunteerSteps :current="step" />
 */
import { computed } from 'vue'
import { CircleCheck, Package, ScanLine } from 'lucide-vue-next'
import { VOLUNTEER_STEP_LABELS, type VolunteerStep } from '../logic/volunteer'
import StepIndicator from './StepIndicator.vue'

defineProps<{ current: VolunteerStep }>()

const ICONS = [ScanLine, Package, CircleCheck]
const steps = computed(() => VOLUNTEER_STEP_LABELS.map((label, i) => ({ label, icon: ICONS[i]! })))
</script>

<template>
  <StepIndicator :steps="steps" :current="current" aria-label="今天的步驟" />
</template>
