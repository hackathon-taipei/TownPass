<script setup lang="ts">
/** @component MR-C50 AdminShell — 管理系統外框：電腦瀏覽器寬度為主（最寬 6xl），手機也能用；標題列右側放重置等動作 */
/**
 * 管理系統是獨立網頁、不在 App 裡（§2），T01 PageContainer 固定 max-w-md（手機寬），
 * 看板與名冊需要並排，所以本頁用這個外框。只有版面，不呼叫 API。
 *
 *   <AdminShell title="管理系統" :subtitle="`目前帳號：${accountId}`">
 *     <template #actions><ResetDemoButton :on-reset="reset" /></template>
 *     …內容…
 *   </AdminShell>
 */
defineProps<{ title: string; subtitle?: string }>()
</script>

<template>
  <div class="min-h-dvh bg-grey-50">
    <div class="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-4 sm:px-6 sm:py-6">
      <header class="flex flex-wrap items-center justify-between gap-3">
        <div class="min-w-0">
          <h1 class="truncate text-xl font-bold text-grey-900 sm:text-h1">{{ title }}</h1>
          <p v-if="subtitle" class="truncate text-sm text-grey-500">{{ subtitle }}</p>
        </div>
        <div v-if="$slots.actions" class="w-full sm:w-48"><slot name="actions" /></div>
      </header>
      <main class="flex flex-col gap-4"><slot /></main>
    </div>
  </div>
</template>
