<script setup lang="ts">
/** @component MR-C51 ReviewPanel — 待審核表格：單位名稱（店面照片 MR-C57）、類型、位置（地址，沒有就座標）、通過／不通過（先確認 MR-C67）＋剛審核的結果；離線時按鈕停用 */
/**
 * 管理系統「待審核」分頁（設計 v2 §3.6、02-admin.webp 左下）。onDecide 由父層傳入（logic/admin.ts 的 review → reviewSupplier）。
 * - 「通過」直接送出；「不通過」先開確認視窗（danger），按確認才送出。合約的 reviewSupplier 沒有原因欄位，所以不填原因
 * - 成功後該列的按鈕換成「已通過／未通過」晶片，REVIEW_SETTLE_MS 後由 logic 從清單移除；失敗時按鈕恢復，錯誤由 logic 提示（toast）
 * - offline（ADR-024）時兩顆按鈕停用，並顯示「目前離線，暫時不能審核」
 * 寬度 ≥ 1024px 是表格；以下每一列折成卡片（名稱一行、類型與位置一行、按鈕一行）。
 */
import { reactive, ref } from 'vue'
import { BaseCard, BaseTag, ListItem, SectionTitle } from '@/ui'
import type { ReviewDecision, Supplier } from '../logic/admin'
import { ORG_TYPE_LABEL, shortTimeText, supplierPlaceText } from '../logic/admin'
import { supplierPhotoOf } from '../logic/placePhoto'
import { SUPPLIER_STATUS_LABEL } from '../logic/shared'
import ConfirmDialog from './ConfirmDialog.vue'
import PlacePhoto from './PlacePhoto.vue'

const props = defineProps<{
  pending: Supplier[]
  reviewed: Supplier[]
  offline: boolean
  error?: string
  onDecide: (id: string, result: ReviewDecision) => Promise<unknown>
}>()

const busy = reactive(new Set<string>())
const decided = reactive(new Map<string, ReviewDecision>())
/** 按了「不通過」的那一列；確認視窗關閉（v-model false）後才 emit confirm，所以對象另外記 */
const rejecting = ref<Supplier | null>(null)
const askReject = ref(false)

function openReject(s: Supplier) {
  rejecting.value = s
  askReject.value = true
}

async function decide(id: string, result: ReviewDecision) {
  if (props.offline || busy.has(id)) return
  busy.add(id)
  try {
    await props.onDecide(id, result)
    decided.set(id, result)
  } catch {
    // 錯誤由 logic 的 review() 提示；按鈕恢復即可
  } finally {
    busy.delete(id)
  }
}

function confirmReject() {
  const s = rejecting.value
  rejecting.value = null
  if (s) void decide(s.id, 'rejected')
}

const cell = 'py-3 pr-3 align-middle max-lg:py-0'
</script>

<template>
  <div class="grid gap-4 lg:grid-cols-3">
    <BaseCard class="lg:col-span-2">
      <h2 class="text-xl font-extrabold text-grey-900">待審核 {{ pending.length }} 件</h2>
      <p v-if="error" role="alert" class="mt-2 text-sm text-warn-200">{{ error }}</p>
      <p v-if="offline" role="status" class="mt-2 text-sm text-grey-600">目前離線，暫時不能審核</p>

      <table v-if="pending.length" class="mt-3 w-full text-left">
        <thead class="max-lg:sr-only">
          <tr class="bg-grey-50 text-sm text-grey-600">
            <th scope="col" class="rounded-l-lg py-2 pr-3 pl-3 font-semibold">單位名稱</th>
            <th scope="col" class="py-2 pr-3 font-semibold">類型</th>
            <th scope="col" class="py-2 pr-3 font-semibold">位置</th>
            <th scope="col" class="rounded-r-lg py-2 pr-3 font-semibold">操作</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="s in pending"
            :key="s.id"
            class="border-b border-grey-100 max-lg:flex max-lg:flex-wrap max-lg:items-center max-lg:gap-x-3 max-lg:gap-y-2 max-lg:py-3"
          >
            <td :class="cell" class="lg:pl-3 max-lg:w-full">
              <div class="flex items-center gap-2">
                <PlacePhoto v-if="supplierPhotoOf(s)" :photo="supplierPhotoOf(s)!" />
                <span class="text-base font-medium text-grey-900">{{ s.name }}</span>
              </div>
            </td>
            <td :class="cell" class="text-base text-grey-700 whitespace-nowrap">{{ ORG_TYPE_LABEL[s.org_type] }}</td>
            <td :class="cell" class="text-sm break-words text-grey-700 max-lg:min-w-0 max-lg:flex-1">{{ supplierPlaceText(s) }}</td>
            <td :class="cell" class="max-lg:w-full">
              <div class="flex items-center gap-2">
                <span
                  v-if="decided.has(s.id)"
                  role="status"
                  class="rounded-full px-3 py-1 text-sm font-medium"
                  :class="decided.get(s.id) === 'approved' ? 'bg-primary-50 text-primary-700' : 'bg-warn-100/15 text-warn-200'"
                >
                  {{ SUPPLIER_STATUS_LABEL[decided.get(s.id)!] }}
                </span>
                <template v-else>
                  <button
                    type="button"
                    class="press min-h-11 rounded-lg bg-primary-600 px-4 text-base font-bold text-white disabled:opacity-50"
                    :disabled="offline || busy.has(s.id)"
                    :aria-label="`通過 ${s.name}`"
                    @click="decide(s.id, 'approved')"
                  >
                    通過
                  </button>
                  <button
                    type="button"
                    class="press min-h-11 rounded-lg bg-white px-4 text-base font-bold text-grey-700 ring-1 ring-grey-300 disabled:opacity-50"
                    :disabled="offline || busy.has(s.id)"
                    :aria-label="`不通過 ${s.name}`"
                    @click="openReject(s)"
                  >
                    不通過
                  </button>
                </template>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
      <p v-else class="py-6 text-center text-sm text-grey-500">沒有待審核的申請</p>
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

    <ConfirmDialog
      v-model="askReject"
      :title="`不通過「${rejecting?.name ?? ''}」？`"
      message="不通過的申請不能重送。"
      confirm-text="不通過"
      danger
      @confirm="confirmReject"
    />
  </div>
</template>
