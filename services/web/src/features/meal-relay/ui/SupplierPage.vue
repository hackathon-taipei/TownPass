<script setup lang="ts">
/** @component MR-P06 SupplierPage — 提供者頁（設計 v2）：申請 → 審核中／未通過 → 我的庫存｜上架食物（分頁與網址 ?tab= 同步） */
/**
 * MR-P06 = T01 PageContainer {
 *   MR-C60 BrandHeader（「提供食物」；上架分頁是「上架食物」）, MR-C05 StaleBanner,
 *   MR-C21 PageTransition {
 *     讀取失敗：M05 EmptyState＋A01「再試一次」；志工、據點、管理員：M05 EmptyState
 *     沒有申請：MR-C35 SupplierApplyForm { MR-C62, A04, MR-C92 OrgTypePicker, MR-C93 ApplyLocationField { MR-C07, MR-C09＋MR-C02 }, MR-C06, MR-C64, MR-C10 }
 *     審核中／未通過：MR-C86 SupplierReviewStatus { MR-C62, MR-C64（V4）, A01「重新整理」 }
 *     通過：MR-C57 PlacePhoto（店面照片，有才顯示，ADR-029）＋單位名稱・「已通過」, MR-C66 SegmentedTabs {
 *       我的庫存：MR-C87 InventoryPanel { MR-C88 InventoryTotals, MR-C85 InventoryRow×N, MR-C64, MR-C65 Accordion（已結束）, A01「＋ 上架新食物」 }
 *       上架食物：MR-C38 FoodPublishForm { MR-C63, MR-C06, A04, MR-C89, MR-C68, MR-C90, #point: MR-C91 PointField { MR-C09＋MR-C36 PointPicker（MR-C37） }, MR-C64, MR-C10 }
 *     }
 *   },
 *   MR-C39 FoodEditSheet（修改）, MR-C67 ConfirmDialog（下架，danger）, MR-C12 ToastHost
 * }
 * 狀態與 API 都在 logic/supplier.ts 的 useSupplierPage()；分頁用 useSupplierTab()（router push，App 返回鍵退回上一個分頁）。
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { CircleAlert, Store } from 'lucide-vue-next'
import { BaseButton, EmptyState, PageContainer } from '@/ui'
import { SUPPLIER_TABS, SUPPLIER_TAB_LABEL, useSupplierPage, useSupplierTab, type Food } from '../logic/supplier'
import { mealHomeRoute } from '../logic/shared'
import BrandHeader from './BrandHeader.vue'
import ConfirmDialog from './ConfirmDialog.vue'
import FoodEditSheet from './FoodEditSheet.vue'
import FoodPublishForm from './FoodPublishForm.vue'
import InventoryPanel from './InventoryPanel.vue'
import PageTransition from './PageTransition.vue'
import PlacePhoto from './PlacePhoto.vue'
import PointField from './PointField.vue'
import SegmentedTabs from './SegmentedTabs.vue'
import StaleBanner from './StaleBanner.vue'
import SupplierApplyForm from './SupplierApplyForm.vue'
import SupplierReviewStatus from './SupplierReviewStatus.vue'
import ToastHost from './ToastHost.vue'

const tab = useSupplierTab()
const s = useSupplierPage({ tab })
const { now, saving, offline, stage } = s
const TABS = SUPPLIER_TABS.map((value) => ({ value, label: SUPPLIER_TAB_LABEL[value] }))
const title = computed(() => (stage.value === 'approved' && tab.value === 'publish' ? '上架食物' : '提供食物'))
/** 確認視窗淡出時 closingFood 已清掉，文字沿用最後一次要下架的那一批，避免閃成空白 */
const closing = ref<Food | null>(null)
watch(s.closingFood, (f) => f && (closing.value = f))
const closeMessage = computed(() => {
  const f = closing.value
  return f ? `下架後，剩下的 ${f.remaining} 份不會再派送；派出中的 ${f.dispatched_qty} 份照常送達。` : ''
})

onMounted(s.start)
onBeforeUnmount(s.stop)
</script>

<template>
  <PageContainer>
    <div class="-mx-4"><BrandHeader :title="title" /></div>
    <div class="flex flex-col gap-4 pt-3">
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
        >
          <BaseButton variant="outline" :to="mealHomeRoute">回首頁</BaseButton>
        </EmptyState>

        <Transition v-else name="swap" mode="out-in">
          <SupplierApplyForm
            v-if="stage === 'apply'"
            key="apply"
            :form="s.applyForm"
            :saving="saving"
            :offline="offline"
            :error="s.applyError.value"
            :checking="s.checking.value"
            @submit="s.apply"
            @recheck="s.recheck"
          />
          <SupplierReviewStatus
            v-else-if="s.supplier.value && stage !== 'approved'"
            key="review"
            :supplier="s.supplier.value"
            :checking="s.checking.value"
            @refresh="s.recheck"
          />
          <div v-else key="approved" class="flex flex-col gap-4">
            <div class="flex items-center justify-center gap-2">
              <PlacePhoto v-if="s.supplierPhoto.value" :photo="s.supplierPhoto.value" size="sm" />
              <span class="min-w-0 truncate text-base font-bold text-grey-900">{{ s.supplier.value?.name }}</span>
              <span class="shrink-0 rounded-full bg-primary-50 px-2.5 py-0.5 text-sm font-semibold text-primary-700">已通過</span>
            </div>
            <SegmentedTabs v-model="tab" :tabs="TABS" label="提供者分頁" />
            <Transition name="tab-fade" mode="out-in">
              <InventoryPanel
                v-if="tab === 'inventory'"
                key="inventory"
                :active="s.stock.value.active"
                :ended="s.stock.value.ended"
                :totals="s.totals.value"
                :has-waiting="s.hasWaiting.value"
                :now="now"
                :fresh-id="s.freshFoodId.value"
                :offline="offline"
                @edit="s.openSheet($event, 'edit')"
                @close="s.openSheet($event, 'close')"
                @publish="tab = 'publish'"
              />
              <FoodPublishForm
                v-else
                key="publish"
                :form="s.foodForm"
                :now="now"
                :saving="saving"
                :offline="offline"
                :error="s.foodError.value"
                @image="s.setImage"
                @submit="s.publish"
              >
                <template #point>
                  <PointField
                    v-model:adding="s.addingPoint.value"
                    :point="s.selectedPoint.value"
                    :points="s.points.value"
                    :markers="s.markers.value"
                    :source-text="s.sourceText.value"
                    :point-form="s.pointForm"
                    :saving="saving"
                    :offline="offline"
                    :error="s.pointError.value"
                    @select="s.selectPoint"
                    @create="s.addPoint"
                  />
                </template>
              </FoodPublishForm>
            </Transition>
          </div>
        </Transition>
      </PageTransition>
    </div>

    <FoodEditSheet
      v-model="s.sheetOpen.value"
      :food="s.editingFood.value"
      :form="s.editForm"
      :now="now"
      :error="s.editError.value"
      :saving="saving"
      :offline="offline"
      @save="s.saveEdit"
    />
    <ConfirmDialog
      v-model="s.closeDialogOpen.value"
      :title="`下架「${closing?.name ?? ''}」？`"
      :message="closeMessage"
      confirm-text="下架"
      danger
      @confirm="s.confirmClose"
      @cancel="s.cancelClose"
    />
    <ToastHost />
  </PageContainer>
</template>
