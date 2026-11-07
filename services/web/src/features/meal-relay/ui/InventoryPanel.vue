<script setup lang="ts">
/** @component MR-C87 InventoryPanel — 「我的庫存」分頁：三欄總計、進行中的食物（修改、下架）、等待派送提醒、已結束收合、上架新食物 */
/**
 * 設計 v2（docs/meal-relay/design-v2/README.md §3.4，03 中）：
 *   MR-C88 InventoryTotals、MR-C85 InventoryRow×N（進行中，actions）、MR-C64 InfoNote「還有食物等待派送」（有可派送的才出現）、
 *   MR-C65 Accordion「已結束的食物（N）」（預設收合，MR-C85 不帶 actions）、A01「＋ 上架新食物」、頁尾「食物為示範資料」。
 * 進行中／已結束由 logic/supplier.ts 的 splitInventory 拆好傳進來。只發 emit，不呼叫 API。
 */
import { Clock, Plus, Truck } from 'lucide-vue-next'
import { BaseButton, EmptyState } from '@/ui'
import type { Food } from '../logic/supplier'
import Accordion from './Accordion.vue'
import InfoNote from './InfoNote.vue'
import InventoryRow from './InventoryRow.vue'
import InventoryTotals from './InventoryTotals.vue'

defineProps<{
  active: Food[]
  ended: Food[]
  totals: { remaining: number; dispatched: number; delivered: number }
  hasWaiting: boolean
  now: number
  freshId?: string | null
  offline?: boolean
}>()
const emit = defineEmits<{ edit: [id: string]; close: [id: string]; publish: [] }>()
</script>

<template>
  <section class="flex flex-col gap-3" aria-label="我的庫存">
    <InventoryTotals :totals="totals" />

    <EmptyState v-if="!active.length && !ended.length" title="還沒有上架的食物" description="把多出來的食物上架，志工報到時系統會自動派給長者。" />

    <TransitionGroup name="list" tag="div" class="flex flex-col gap-3">
      <InventoryRow
        v-for="f in active"
        :key="f.id"
        :food="f"
        :now="now"
        :fresh="f.id === freshId"
        :offline="offline"
        actions
        @edit="emit('edit', $event)"
        @close="emit('close', $event)"
      />
    </TransitionGroup>

    <InfoNote v-if="hasWaiting" text="還有食物等待派送" detail="志工報到時，系統會自動派給長者" :icon="Truck" />

    <Accordion v-if="ended.length" :title="`已結束的食物（${ended.length}）`" :icon="Clock">
      <div class="flex flex-col gap-3">
        <InventoryRow v-for="f in ended" :key="f.id" :food="f" :now="now" />
      </div>
    </Accordion>

    <BaseButton block size="lg" :icon="Plus" @click="emit('publish')">上架新食物</BaseButton>
    <p class="text-center text-xs text-grey-500">食物為示範資料</p>
  </section>
</template>
