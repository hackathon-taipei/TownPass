<script setup lang="ts">
/** @component MR-P08 AdminPage — 管理系統：審核提供者、看板與統計、長者名冊（新增、修改）、重置 Demo；只有 admin 能用 */
/**
 * 網址 /#/f/meal-relay/admin?as=<admin id>（§2）。不是 admin → 顯示沒有權限與說明。
 * 樹：MR-C50 AdminShell { actions: MR-C22, MR-C05, MR-C08 TabBar, MR-C21 PageTransition {
 *   審核 MR-C51 ReviewPanel｜看板 MR-C52 BoardPanel｜名冊 M01 { MR-C54 ElderRow × n } + MR-C53 ElderForm } }
 */
import { onBeforeUnmount, onMounted } from 'vue'
import { ShieldX, WifiOff } from 'lucide-vue-next'
import { BaseButton, BaseCard, EmptyState, SectionTitle, SourceNote } from '@/ui'
import { ADMIN_TABS, DENIED_TEXT, elderSummary, useAdmin, type Elder } from '../logic/admin'
import AdminShell from './AdminShell.vue'
import BoardPanel from './BoardPanel.vue'
import ElderForm from './ElderForm.vue'
import ElderRow from './ElderRow.vue'
import PageTransition from './PageTransition.vue'
import ResetDemoButton from './ResetDemoButton.vue'
import ReviewPanel from './ReviewPanel.vue'
import StaleBanner from './StaleBanner.vue'
import TabBar from './TabBar.vue'
import ToastHost from './ToastHost.vue'

const admin = useAdmin()
const {
  access, accountId, accessError, tab, now, version, offline, staleAt, pending, reviewed, board, markers, foods, sourceText,
  errors, roster, stations, draft, editing, formErrors, saving,
} = admin

function edit(elder: Elder) {
  admin.startEdit(elder)
  if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' })
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
              :markers="markers"
              :foods="foods"
              :now="now"
              :source-text="sourceText"
              :error="errors.board"
            />

            <div v-else class="grid gap-4 lg:grid-cols-5">
              <BaseCard class="lg:col-span-2">
                <SectionTitle :title="`長者名冊（${roster.length}）`" />
                <p v-if="errors.elders" role="alert" class="mb-2 text-sm text-warn-200">{{ errors.elders }}</p>
                <ul class="divide-y divide-grey-100">
                  <li v-for="e in roster" :key="e.id">
                    <ElderRow
                      :elder="e"
                      :summary="elderSummary(e, stations)"
                      :active="editing?.id === e.id"
                      :disabled="offline"
                      @edit="edit"
                    />
                  </li>
                </ul>
                <p v-if="!roster.length" class="py-4 text-center text-sm text-grey-500">名冊還沒有長者</p>
                <p class="mt-3 text-xs text-grey-500">名冊只在管理系統，志工手機上看不到（ADR-026）。全部是模擬資料。</p>
              </BaseCard>

              <div class="flex flex-col gap-2 lg:col-span-3">
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
