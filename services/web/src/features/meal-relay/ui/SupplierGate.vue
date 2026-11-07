<script setup lang="ts">
/** @component MR-C18 SupplierGate — 提供者申請狀態：申請表 → 審核中卡片 → 通過後進入提供者頁（D1、D2） */
/**
 * 申請人是一般市民（Role citizen，ADR-026）：沒有匯入角色的台北通帳號；長者不是帳號，不會出現在這裡。
 * 依 me.supplier（getMe 或 getMySupplier）切換三種畫面，切換時淡出再淡入（swap）：
 *   沒有申請 → #apply 插槽（申請表，送出用 SubmitButton）
 *   pending／rejected → 狀態卡（晶片顏色依狀態過渡）
 *   approved → 預設插槽（提供者頁）。若是在這個畫面上從審核中變成通過，
 *              先讓晶片變成主色「已通過」停一下（--motion-emphasis 再多一點），再換成提供者頁。
 *
 *   <SupplierGate :supplier="me.supplier">
 *     <template #apply><SupplierApplyForm /></template>
 *     <SupplierHome />
 *   </SupplierGate>
 */
import './motion.css'
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import type { Supplier } from '../logic/mealLabels'
import { SUPPLIER_STATUS_LABEL } from '../logic/mealLabels'
import { MOTION } from '../logic/motion'

const props = defineProps<{ supplier: Supplier | null }>()

/** 已通過，但還在顯示「已通過」晶片的那一小段時間 */
const holding = ref(false)
let timer: ReturnType<typeof setTimeout> | undefined
watch(
  () => props.supplier?.status,
  (now, before) => {
    clearTimeout(timer)
    holding.value = now === 'approved' && before === 'pending'
    if (holding.value) timer = setTimeout(() => (holding.value = false), MOTION.emphasis + 300)
  },
)
onBeforeUnmount(() => clearTimeout(timer))

const view = computed(() => {
  if (!props.supplier) return 'apply'
  if (props.supplier.status === 'approved' && !holding.value) return 'page'
  return 'card'
})

const CHIP: Record<Supplier['status'], string> = {
  pending: 'bg-grey-50 text-grey-500',
  approved: 'bg-primary-50 text-primary-700',
  rejected: 'bg-warn-100/15 text-warn-200',
}
</script>

<template>
  <Transition name="swap" mode="out-in">
    <div v-if="view === 'apply'" key="apply"><slot name="apply" /></div>
    <div v-else-if="view === 'card' && supplier" key="card" class="rounded-xl bg-white p-4 shadow-card ring-1 ring-grey-100" role="status">
      <p class="font-semibold text-grey-900">{{ supplier.name }}</p>
      <span class="mt-2 inline-block rounded-full px-2 py-0.5 text-xs font-medium transition-colors duration-200" :class="CHIP[supplier.status]">
        {{ SUPPLIER_STATUS_LABEL[supplier.status] }}
      </span>
      <p class="mt-2 text-sm text-grey-600">
        {{ supplier.status === 'rejected' ? '申請未通過，有問題請洽管理員。' : supplier.status === 'pending' ? '管理員審核後就能上架食物。' : '審核通過，正在進入提供者頁…' }}
      </p>
    </div>
    <div v-else key="page"><slot /></div>
  </Transition>
</template>
