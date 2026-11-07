<script setup lang="ts">
/** @component MR-P08 AdminPage — 管理系統：待審核（數字徽章）｜服務看板｜長者名冊三個分頁（與網址 ?tab= 同步）、重置示範資料（先確認）；只有 admin 能用 */
/**
 * 網址 /#/f/meal-relay/admin?as=<admin id>&tab=review|board|elders（§2；設計 v2 §3.6）。不是 admin → 顯示沒有權限與說明。
 * 樹：MR-C50 AdminShell { #actions: 「管理員」＋紅框「重置示範資料」→ MR-C67 ConfirmDialog(danger), MR-C21 PageTransition {
 *   M01+M05（沒有權限／無法確認身分）｜ MR-C05 StaleBanner, MR-C66 SegmentedTabs（待審核徽章）, MR-C21 PageTransition(refresh) {
 *     待審核 MR-C51 ReviewPanel｜服務看板 MR-C52 BoardPanel｜
 *     長者名冊 { 「僅使用模擬資料」晶片, MR-C54 ElderRoster, MR-C53 ElderForm（≥ 1024px 右欄；以下 MR-C09 BottomSheet）, A07 SourceNote } } }, MR-C12 ToastHost }
 */
import { computed, onBeforeUnmount, onMounted } from 'vue'
import { ShieldX, User, WifiOff } from 'lucide-vue-next'
import { BaseButton, BaseCard, EmptyState, SourceNote } from '@/ui'
import { DENIED_TEXT, SIMULATED_ONLY_TEXT, adminTabs, useAdmin, useAdminTab, useWideLayout } from '../logic/admin'
import AdminShell from './AdminShell.vue'
import StationManager from './StationManager.vue'
import BoardPanel from './BoardPanel.vue'
import BottomSheet from './BottomSheet.vue'
import ConfirmDialog from './ConfirmDialog.vue'
import ElderForm from './ElderForm.vue'
import ElderRoster from './ElderRoster.vue'
import PageTransition from './PageTransition.vue'
import ReviewPanel from './ReviewPanel.vue'
import SegmentedTabs from './SegmentedTabs.vue'
import StaleBanner from './StaleBanner.vue'
import ToastHost from './ToastHost.vue'

const tab = useAdminTab()
const admin = useAdmin({ tab })
const wide = useWideLayout()
const {
  access, accountId, accessError, now, version, offline, staleAt, pending, reviewed, board, markers, foods, sourceText,
  errors, roster, stations, draft, editing, formErrors, formMarkers, saving, formOpen, confirmingReset, resetting,
} = admin

const tabs = computed(() => adminTabs(pending.value.length))
const formTitle = computed(() => (editing.value ? `修改長者：${editing.value.alias}` : '新增長者'))

onMounted(() => void admin.start())
onBeforeUnmount(() => admin.stop())
</script>

<template>
  <AdminShell>
    <template v-if="access === 'admin'" #actions>
      <span class="flex items-center gap-2 text-base font-bold text-primary-900 lg:text-xl" :title="accountId ? `帳號：${accountId}` : undefined">
        <User class="size-6 lg:size-7" aria-hidden="true" />管理員
      </span>
      <span class="h-6 w-px bg-grey-200" aria-hidden="true" />
      <button
        type="button"
        class="press min-h-11 rounded-lg border border-warn-200 bg-white px-4 text-base font-bold text-warn-200 disabled:opacity-50 lg:text-lg"
        :disabled="offline || resetting"
        :aria-busy="resetting"
        :title="offline ? '離線時不能重置' : undefined"
        @click="admin.askReset()"
      >
        {{ resetting ? '重置中…' : '重置示範資料' }}
      </button>
    </template>

    <PageTransition :loading="access === 'loading'" :page-key="access">
      <BaseCard v-if="access === 'denied'">
        <EmptyState title="沒有權限" :description="DENIED_TEXT" :icon="ShieldX" />
      </BaseCard>

      <BaseCard v-else-if="access === 'error'">
        <EmptyState title="無法確認身分" :description="accessError" :icon="WifiOff">
          <BaseButton variant="outline" @click="admin.init()">重新整理</BaseButton>
        </EmptyState>
      </BaseCard>

      <div v-else class="flex flex-col gap-4">
        <StaleBanner :stale-at="staleAt" :now="now" />
        <div class="border-b border-grey-400">
          <SegmentedTabs v-model="tab" :tabs="tabs" label="管理系統分頁" class="admin-tabs lg:ml-9 lg:max-w-4xl" />
        </div>

        <PageTransition variant="refresh" :page-key="version">
          <Transition name="tab-fade" mode="out-in">
            <ReviewPanel
              v-if="tab === 'review'"
              :pending="pending"
              :reviewed="reviewed"
              :offline="offline"
              :error="errors.review"
              :on-decide="admin.review"
            />

            <BoardPanel
              v-else-if="tab === 'board'"
              :board="board"
              :markers="markers"
              :foods="foods"
              :now="now"
              :source-text="sourceText"
              :error="errors.board"
            />

            <StationManager v-else-if="tab === 'stations'" :stations="stations" :elders="roster" :offline="offline" :load-error="errors.elders || errors.stations" :on-refresh="admin.loadAll" />

            <section v-else class="flex flex-col gap-3 rounded-xl border border-grey-300 p-3 lg:p-4" aria-labelledby="admin-elders-title">
              <div class="flex flex-wrap items-center justify-between gap-2">
                <h2 id="admin-elders-title" class="mr-display rounded-lg bg-primary-700 px-4 py-1 text-xl font-extrabold text-white">長者名冊（{{ roster.length }}）</h2>
                <span class="rounded-xl bg-secondary-200 px-3 py-1 text-sm font-bold text-secondary-900">
                  {{ SIMULATED_ONLY_TEXT }}
                </span>
              </div>
              <div class="grid gap-4 lg:grid-cols-5 lg:items-start">
                <div class="lg:col-span-2 lg:border-r lg:border-grey-200 lg:pr-4">
                  <ElderRoster
                    :elders="roster"
                    :stations="stations"
                    :active-id="editing?.id ?? null"
                    :error="errors.elders"
                    @edit="admin.startEdit"
                    @add="admin.startNew()"
                  />
                </div>
                <ElderForm
                  v-if="wide"
                  v-model="draft"
                  class="lg:col-span-3"
                  :stations="stations"
                  :markers="formMarkers"
                  :errors="formErrors"
                  :elder-id="editing?.id ?? null"
                  :saving="saving"
                  :disabled="offline"
                  @submit="admin.saveElder()"
                  @cancel="admin.resetForm()"
                />
              </div>
              <SourceNote v-if="sourceText" :source="sourceText" />
            </section>
          </Transition>
        </PageTransition>
      </div>
    </PageTransition>

    <BottomSheet v-if="!wide && access === 'admin'" v-model="formOpen" :title="formTitle">
      <ElderForm
        v-model="draft"
        plain
        :stations="stations"
        :markers="formMarkers"
        :errors="formErrors"
        :elder-id="editing?.id ?? null"
        :saving="saving"
        :disabled="offline"
        @submit="admin.saveElder()"
        @cancel="admin.resetForm(); formOpen = false"
      />
    </BottomSheet>

    <ConfirmDialog
      v-model="confirmingReset"
      title="重置示範資料？"
      message="食物、申請、報到與長者名冊都會回到示範的初始狀態，剛才的操作紀錄會清掉。"
      confirm-text="重置"
      danger
      @confirm="admin.confirmReset()"
    />
    <ToastHost />
  </AdminShell>
</template>

<style scoped>
.admin-tabs {
  gap: 0.25rem;
  border-radius: 0;
  box-shadow: none;
}
@media (max-width: 639px) {
  .admin-tabs { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
.admin-tabs :deep(button) {
  border-radius: 0.75rem 0.75rem 0 0;
}
.admin-tabs :deep([aria-selected='false']) {
  background: var(--color-grey-50);
  color: var(--color-primary-900);
}
.admin-tabs :deep([aria-selected='true']) {
  background: var(--color-primary-700);
}
</style>
