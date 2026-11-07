<script setup lang="ts">
/** @component MR-P08 AdminPage — 管理系統：審核提供者、看板與統計、長者名冊（新增、修改）、重置 Demo；只有 admin 能用 */
/**
 * 網址 /#/f/meal-relay/admin?as=<admin id>（§2）。不是 admin → 顯示沒有權限與說明。
 * 樹：MR-C50 AdminShell { #actions: MR-C22 ResetDemoButton, MR-C21 PageTransition {
 *   M01+M05（沒有權限／無法確認身分）｜ MR-C05 StaleBanner, MR-C08 TabBar, MR-C21 PageTransition(refresh) {
 *     審核 MR-C51 ReviewPanel｜看板 MR-C52 BoardPanel（統計卡與清單，沒有總覽地圖）｜名冊 MR-C54 ElderRoster + MR-C53 ElderForm + A07 SourceNote } }, MR-C12 ToastHost }
 */
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { ShieldX, WifiOff } from 'lucide-vue-next'
import { BaseButton, BaseCard, EmptyState, SourceNote } from '@/ui'
import { ADMIN_TABS, DENIED_TEXT, useAdmin, type Elder } from '../logic/admin'
import AdminShell from './AdminShell.vue'
import BoardPanel from './BoardPanel.vue'
import ElderForm from './ElderForm.vue'
import ElderRoster from './ElderRoster.vue'
import PageTransition from './PageTransition.vue'
import ResetDemoButton from './ResetDemoButton.vue'
import ReviewPanel from './ReviewPanel.vue'
import StaleBanner from './StaleBanner.vue'
import TabBar from './TabBar.vue'
import ToastHost from './ToastHost.vue'

const admin = useAdmin()
const {
  access, accountId, accessError, tab, now, version, offline, staleAt, pending, reviewed, board, foods, sourceText,
  errors, roster, stations, draft, editing, formErrors, formMarkers, saving,
} = admin

const formBox = ref<HTMLElement>()

/** 按名冊的「修改」：表單切成修改模式，捲到表單（手機上表單在名冊下方） */
function edit(elder: Elder) {
  admin.startEdit(elder)
  formBox.value?.scrollIntoView?.({ behavior: 'smooth', block: 'start' })
}

onMounted(() => void admin.start())
onBeforeUnmount(() => admin.stop())
</script>

<template>
  <AdminShell title="鄰食轉運站 管理系統" :subtitle="accountId ? `目前帳號：${accountId}` : undefined">
    <template v-if="access === 'admin'" #actions>
      <ResetDemoButton v-if="!offline" :on-reset="admin.reset" />
      <p v-else class="text-sm text-grey-500">離線時不能重置</p>
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
        <TabBar v-model="tab" :tabs="ADMIN_TABS" />

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
              :foods="foods"
              :now="now"
              :source-text="sourceText"
              :error="errors.board"
            />

            <div v-else class="grid gap-4 lg:grid-cols-5">
              <ElderRoster
                class="lg:col-span-2"
                :elders="roster"
                :stations="stations"
                :active-id="editing?.id ?? null"
                :disabled="offline"
                :error="errors.elders"
                @edit="edit"
              />
              <div ref="formBox" class="flex scroll-mt-4 flex-col gap-2 lg:col-span-3">
                <ElderForm
                  v-model="draft"
                  :stations="stations"
                  :markers="formMarkers"
                  :errors="formErrors"
                  :editing-alias="editing?.alias ?? null"
                  :saving="saving"
                  :disabled="offline"
                  @submit="admin.saveElder()"
                  @cancel="admin.resetForm()"
                />
                <SourceNote v-if="sourceText" :source="sourceText" />
              </div>
            </div>
          </Transition>
        </PageTransition>
      </div>
    </PageTransition>
    <ToastHost />
  </AdminShell>
</template>
