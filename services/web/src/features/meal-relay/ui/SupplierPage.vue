<script setup lang="ts">
/** @component MR-P06 SupplierPage — 提供者頁：申請與審核狀態、上架、我的庫存（剩餘／派出中／已送達，已結束的收合）、修改、下架 */
/**
 * MR-P06 = T01 PageContainer {
 *   MR-C05 StaleBanner,
 *   MR-C21 PageTransition {
 *     MR-C18 SupplierGate {
 *       #apply: MR-C35 SupplierApplyForm（一般市民）
 *       審核中／未通過：Gate 的狀態卡＋V4 提示（不能上架）
 *       通過：MR-C08 TabBar {
 *         我的庫存（沒有地圖）：MR-C13 StatCard×4、MR-C03 FoodCard×N（修改、下架）、MR-C56 EndedGroup（已結束 N 批）、A07 SourceNote
 *         上架食物：MR-C36 PointPicker（M02 清單、MR-C37 新增食物點＋LocationPicker 選位置）、MR-C38 FoodPublishForm
 *       }
 *     }
 *   },
 *   MR-C39 FoodEditSheet、MR-C12 ToastHost
 * }
 * 狀態與 API 都在 logic/supplier.ts 的 useSupplierPage()。
 */
import { computed, onBeforeUnmount, onMounted } from 'vue'
import { CircleAlert, Store } from 'lucide-vue-next'
import { BaseButton, BaseCard, EmptyState, PageContainer, SourceNote } from '@/ui'
import { splitEnded } from '../logic/shared'
import { NOT_APPROVED_TEXT, useSupplierPage, type SupplierTab } from '../logic/supplier'
import EndedGroup from './EndedGroup.vue'
import FoodCard from './FoodCard.vue'
import FoodEditSheet from './FoodEditSheet.vue'
import FoodPublishForm from './FoodPublishForm.vue'
import PageTransition from './PageTransition.vue'
import PointPicker from './PointPicker.vue'
import StaleBanner from './StaleBanner.vue'
import StatCard from './StatCard.vue'
import SupplierApplyForm from './SupplierApplyForm.vue'
import SupplierGate from './SupplierGate.vue'
import TabBar from './TabBar.vue'
import ToastHost from './ToastHost.vue'

const s = useSupplierPage()
const { now, saving, offline, tab } = s
/** 已過期、已下架的收合成「已結束 N 批」（T-126） */
const stock = computed(() => splitEnded(s.inventory.value))
const TABS: { value: SupplierTab; label: string }[] = [
  { value: 'inventory', label: '我的庫存' },
  { value: 'publish', label: '上架食物' },
]

onMounted(s.start)
onBeforeUnmount(s.stop)
</script>

<template>
  <PageContainer title="提供食物" back>
    <div class="flex flex-col gap-4 pt-2">
      <StaleBanner :stale-at="s.staleAt.value" :now="now" />

      <PageTransition :loading="s.view.value === 'loading'" :page-key="s.me.value?.role ?? 'none'">
        <EmptyState v-if="s.view.value === 'error'" title="讀取失敗" :description="s.loadError.value" :icon="CircleAlert">
          <BaseButton variant="outline" @click="s.load">再試一次</BaseButton>
        </EmptyState>

        <EmptyState
          v-else-if="s.view.value === 'other_role'"
          title="這裡是提供者用的頁面"
          description="志工、據點與管理員請從鄰食轉運站首頁進入自己的頁面。"
          :icon="Store"
        />

        <div v-else class="flex flex-col gap-3">
          <SupplierGate :supplier="s.supplier.value">
            <template #apply>
              <SupplierApplyForm :form="s.applyForm" :saving="saving" :offline="offline" :error="s.applyError.value" @submit="s.apply" />
            </template>

            <div class="flex flex-col gap-4">
              <TabBar v-model="tab" :tabs="TABS" />
              <Transition name="tab-fade" mode="out-in">
                <section v-if="tab === 'inventory'" key="inventory" class="flex flex-col gap-3" aria-label="我的庫存">
                  <div class="grid grid-cols-2 gap-2">
                    <StatCard label="剩餘（可派送）" :value="s.totals.value.remaining" />
                    <StatCard label="派出中" :value="s.totals.value.dispatched" />
                    <StatCard label="已送達" :value="s.totals.value.delivered" />
                    <StatCard label="還沒被派出（批）" :value="s.totals.value.unclaimed" tone="alert" />
                  </div>
                  <EmptyState v-if="!s.inventory.value.length" title="還沒有上架的食物" description="把多出來的食物上架，志工報到時系統會自動派給長者。">
                    <BaseButton @click="tab = 'publish'">上架食物</BaseButton>
                  </EmptyState>
                  <TransitionGroup name="list" tag="div" class="flex flex-col gap-3">
                    <FoodCard
                      v-for="f in stock.active"
                      :key="f.id"
                      :class="{ flash: f.id === s.freshFoodId.value }"
                      :food="f"
                      :now="now"
                      actions
                      @edit="s.openSheet($event, 'edit')"
                      @close="s.openSheet($event, 'close')"
                    />
                  </TransitionGroup>
                  <EndedGroup :count="stock.ended.length">
                    <FoodCard v-for="f in stock.ended" :key="f.id" :food="f" :now="now" />
                  </EndedGroup>
                  <SourceNote v-if="s.inventory.value.length" :source="`食物點 ${s.sourceText.value}；食物為模擬資料`" />
                </section>

                <section v-else key="publish" class="flex flex-col gap-4" aria-label="上架食物">
                  <PointPicker
                    v-model:adding="s.addingPoint.value"
                    :points="s.points.value"
                    :markers="s.markers.value"
                    :selected-id="s.foodForm.point_id"
                    :source-text="s.sourceText.value"
                    :point-form="s.pointForm"
                    :saving="saving"
                    :offline="offline"
                    :error="s.pointError.value"
                    @select="s.selectPoint"
                    @create="s.addPoint"
                  />
                  <FoodPublishForm
                    :form="s.foodForm"
                    :now="now"
                    :point-name="s.selectedPoint.value?.name"
                    :saving="saving"
                    :offline="offline"
                    :error="s.foodError.value"
                    @image="s.setImage"
                    @submit="s.publish"
                  />
                </section>
              </Transition>
            </div>
          </SupplierGate>

          <!-- V4：審核中不能上架 -->
          <BaseCard v-if="s.supplier.value?.status === 'pending'" flat role="note">
            <p class="text-sm font-medium text-grey-800">{{ NOT_APPROVED_TEXT }}</p>
            <p class="mt-1 text-sm text-grey-500">這個頁面會自動更新審核結果。</p>
          </BaseCard>
        </div>
      </PageTransition>
    </div>

    <FoodEditSheet
      v-model="s.sheetOpen.value"
      :food="s.editingFood.value"
      :mode="s.sheetMode.value"
      :form="s.editForm"
      :now="now"
      :error="s.editError.value"
      :saving="saving"
      :offline="offline"
      @save="s.saveEdit"
      @close="s.confirmClose"
    />
    <ToastHost />
  </PageContainer>
</template>
