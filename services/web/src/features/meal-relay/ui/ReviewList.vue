<script setup lang="ts">
/** @component MR-C19 ReviewList — 審核清單：店面照片縮圖（選填）、按通過／不通過 → 晶片變色 → 整列收合（D3） */
/**
 * 管理系統審核提供者用。按鈕呼叫 onDecide（父層裡呼叫 reviewSupplier）：
 *   成功 → 該列顯示「已通過／未通過」晶片停一下，再整列收合，下方的列平順補上
 *   失敗（onDecide 丟出錯誤）→ 按鈕恢復，錯誤由父層顯示（toast）
 *
 *   <ReviewList :items="pending.map((s) => ({ id: s.id, name: s.name, detail: ORG_TYPE[s.org_type], photo: supplierPhotoOf(s) }))"
 *               :on-decide="(id, result) => reviewSupplier(id, result)" />
 * photo 有值才在左側放縮圖（MR-C57，點一下放大，ADR-029）；沒有就維持原本的版面。
 */
import './motion.css'
import { computed, reactive } from 'vue'
import type { SupplierStatus } from '../logic/mealLabels'
import { SUPPLIER_STATUS_LABEL } from '../logic/mealLabels'
import { MOTION } from '../logic/motion'
import type { PlacePhoto as PlacePhotoData } from '../logic/placePhoto'
import PlacePhoto from './PlacePhoto.vue'

type Decision = Exclude<SupplierStatus, 'pending'>
const props = defineProps<{
  items: { id: string; name: string; detail?: string; photo?: PlacePhotoData | null }[]
  onDecide: (id: string, result: Decision) => Promise<unknown>
  emptyText?: string
}>()

const busy = reactive(new Set<string>())
const decided = reactive(new Map<string, Decision>())
const gone = reactive(new Set<string>())
const rows = computed(() => props.items.filter((i) => !gone.has(i.id)))

async function decide(id: string, result: Decision) {
  busy.add(id)
  try {
    await props.onDecide(id, result)
    decided.set(id, result)
    setTimeout(() => gone.add(id), MOTION.emphasis) // 晶片停留 --motion-emphasis 再收合
  } finally {
    busy.delete(id)
  }
}
</script>

<template>
  <TransitionGroup tag="ul" name="list" class="space-y-2">
    <li v-for="r in rows" :key="r.id">
      <div class="flex min-h-14 items-center gap-2 rounded-xl bg-white px-3 py-2 shadow-card ring-1 ring-grey-100">
        <PlacePhoto v-if="r.photo" :photo="r.photo" />
        <div class="min-w-0 flex-1">
          <p class="truncate text-base text-grey-900">{{ r.name }}</p>
          <p v-if="r.detail" class="truncate text-xs text-grey-500">{{ r.detail }}</p>
        </div>
        <span
          v-if="decided.has(r.id)"
          class="shrink-0 rounded-full px-2 py-0.5 text-xs font-medium transition-colors duration-200"
          :class="decided.get(r.id) === 'approved' ? 'bg-success/15 text-success' : 'bg-warn-100/15 text-warn-200'"
          role="status"
        >
          {{ SUPPLIER_STATUS_LABEL[decided.get(r.id)!] }}
        </span>
        <template v-else>
          <button type="button" class="press h-10 shrink-0 rounded-full bg-primary-500 px-4 text-sm font-medium text-white disabled:opacity-50" :disabled="busy.has(r.id)" @click="decide(r.id, 'approved')">
            通過
          </button>
          <button type="button" class="press h-10 shrink-0 rounded-full bg-white px-4 text-sm text-grey-700 ring-1 ring-grey-200 disabled:opacity-50" :disabled="busy.has(r.id)" @click="decide(r.id, 'rejected')">
            不通過
          </button>
        </template>
      </div>
    </li>
    <li v-if="rows.length === 0" key="empty" class="py-4 text-center text-sm text-grey-500">{{ emptyText ?? '沒有待審核的申請' }}</li>
  </TransitionGroup>
</template>
