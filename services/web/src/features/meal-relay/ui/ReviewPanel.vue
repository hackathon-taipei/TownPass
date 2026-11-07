<script setup lang="ts">
/** @component MR-C51 ReviewPanel — 提供者審核：待審核清單（MR-C19 ReviewList，含店面照片縮圖）＋剛審核的結果；離線時只顯示、不能審核 */
/**
 * 管理系統「審核」分頁。onDecide 由父層傳入（logic/admin.ts 的 review → reviewSupplier）。
 * offline（ADR-024）時不顯示通過／不通過按鈕，改成唯讀清單。
 */
import { computed } from 'vue'
import { BaseCard, BaseTag, ListItem, SectionTitle } from '@/ui'
import type { ReviewDecision, Supplier } from '../logic/admin'
import { ORG_TYPE_LABEL, shortTimeText } from '../logic/admin'
import { supplierPhotoOf } from '../logic/placePhoto'
import { SUPPLIER_STATUS_LABEL } from '../logic/shared'
import ReviewList from './ReviewList.vue'

const props = defineProps<{
  pending: Supplier[]
  reviewed: Supplier[]
  offline: boolean
  error?: string
  onDecide: (id: string, result: ReviewDecision) => Promise<unknown>
}>()

const detailOf = (s: Supplier) => `${ORG_TYPE_LABEL[s.org_type]}・申請於 ${shortTimeText(s.created_at)}`
const items = computed(() => props.pending.map((s) => ({ id: s.id, name: s.name, detail: detailOf(s), photo: supplierPhotoOf(s) })))
</script>

<template>
  <div class="grid gap-4 lg:grid-cols-2">
    <BaseCard>
      <SectionTitle :title="`待審核的提供者（${pending.length}）`" />
      <p v-if="error" role="alert" class="mb-2 text-sm text-warn-200">{{ error }}</p>
      <ul v-if="offline" class="divide-y divide-grey-100">
        <li v-for="s in pending" :key="s.id"><ListItem :title="s.name" :subtitle="detailOf(s)" /></li>
        <li v-if="!pending.length" class="py-4 text-center text-sm text-grey-500">沒有待審核的申請</li>
      </ul>
      <ReviewList v-else :items="items" :on-decide="onDecide" />
      <p class="mt-3 text-xs text-grey-500">通過後申請人變成提供者，可以新增食物點與上架；不通過的申請不能重送。</p>
    </BaseCard>

    <BaseCard>
      <SectionTitle title="剛審核的結果" />
      <ul v-if="reviewed.length" class="divide-y divide-grey-100">
        <li v-for="s in reviewed" :key="s.id">
          <ListItem :title="s.name" :subtitle="`${ORG_TYPE_LABEL[s.org_type]}・審核於 ${shortTimeText(s.reviewed_at)}`">
            <template #trailing>
              <BaseTag :tone="s.status === 'approved' ? 'primary' : 'warn'">{{ SUPPLIER_STATUS_LABEL[s.status] }}</BaseTag>
            </template>
          </ListItem>
        </li>
      </ul>
      <p v-else class="py-4 text-center text-sm text-grey-500">這次還沒有審核</p>
    </BaseCard>
  </div>
</template>
