<script setup lang="ts">
/** @component MR-C50 AdminShell — 管理系統白底外框：鄰食蜂頁首（MR-C60）＋右側動作；寬度 ≥ 1024px 多欄，以下一欄 */
/**
 * 管理系統是獨立網頁、不在 App 裡（§2），T01 PageContainer 固定 max-w-md（手機寬），
 * 看板與名冊需要並排，所以本頁用這個外框。只有版面，不呼叫 API。
 * 設計 v2（docs/meal-relay/design-v2/02-admin.webp）：左邊企鵝＋「鄰食蜂｜管理系統」，右邊放「管理員」與「重置示範資料」。
 * 寬度 ≥ 1024px（lg）時頁首與動作同一列；以下動作排到頁首下方。
 *
 *   <AdminShell>
 *     <template #actions>管理員｜重置示範資料</template>
 *     …內容…
 *   </AdminShell>
 */
import BrandHeader from './BrandHeader.vue'

withDefaults(defineProps<{ title?: string }>(), { title: '管理系統' })
</script>

<template>
  <div class="min-h-dvh bg-grey-50 px-3 py-4 sm:px-5">
    <div class="mx-auto flex w-full max-w-[96rem] flex-col rounded-2xl border border-grey-300 bg-white p-3 lg:p-4">
      <div class="lg:flex lg:items-center lg:px-3">
        <BrandHeader :title="title" class="admin-masthead min-w-0 lg:flex-1" />
        <div v-if="$slots.actions" class="flex flex-wrap items-center justify-end gap-4 px-3 pb-3 lg:py-3">
          <slot name="actions" />
        </div>
      </div>
      <main class="flex flex-col gap-4"><slot /></main>
    </div>
  </div>
</template>

<style scoped>
.admin-masthead {
  background: var(--color-white);
}
@media (min-width: 1024px) {
  .admin-masthead :deep(h1) {
    color: var(--color-primary-900);
    font-size: 2rem;
  }
  .admin-masthead :deep(img[alt='鄰食蜂']) {
    height: 2.5rem;
  }
}
</style>
