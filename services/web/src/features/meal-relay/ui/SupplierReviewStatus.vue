<script setup lang="ts">
/** @component MR-C86 SupplierReviewStatus — 提供者申請的審核中／未通過畫面：企鵝、狀態、說明（未通過時含原因）、重新整理 */
/**
 * 設計 v2（docs/meal-relay/design-v2/README.md §3.4）：審核中沒有設計圖，比照申請頁（企鵝、大標題、說明、按鈕）。
 * 審核中另外提醒不能上架（V4：NOT_APPROVED_TEXT）；頁面每 15 秒也會自動輪詢。
 * 未通過：合約的 Supplier 沒有原因欄位，顯示固定說明 REJECTED_TEXT（T-136 偏離）。
 * 「重新整理」只發 emit，由頁面 recheck()（getMe、getMySupplier）。
 */
import { RefreshCw } from 'lucide-vue-next'
import { BaseButton } from '@/ui'
import { NOT_APPROVED_TEXT, REJECTED_TEXT, type Supplier } from '../logic/supplier'
import InfoNote from './InfoNote.vue'
import MascotBadge from './MascotBadge.vue'

defineProps<{ supplier: Supplier; checking?: boolean }>()
const emit = defineEmits<{ refresh: [] }>()
</script>

<template>
  <section class="flex flex-col items-center gap-3 pt-2 text-center" role="status" :data-status="supplier.status">
    <MascotBadge :size="96" glow />
    <h2 class="text-2xl font-extrabold text-primary-800">{{ supplier.status === 'rejected' ? '申請未通過' : '審核中' }}</h2>
    <div>
      <p class="text-base font-semibold text-grey-900">{{ supplier.name }}</p>
      <p v-if="supplier.address" class="mt-0.5 text-sm text-grey-600">{{ supplier.address }}</p>
    </div>

    <template v-if="supplier.status === 'rejected'">
      <div class="w-full rounded-xl bg-warn-100/15 px-4 py-3 text-left" role="note">
        <p class="text-sm font-semibold text-warn-200">原因</p>
        <p class="mt-1 text-sm text-grey-800">{{ REJECTED_TEXT }}</p>
      </div>
    </template>
    <template v-else>
      <p class="text-sm text-grey-600">管理員審核後就能上架食物；這個頁面會自動更新審核結果。</p>
      <InfoNote class="w-full text-left" :text="NOT_APPROVED_TEXT" />
    </template>

    <BaseButton class="w-full" variant="outline" size="lg" :icon="RefreshCw" :loading="checking" @click="emit('refresh')">重新整理</BaseButton>
  </section>
</template>
