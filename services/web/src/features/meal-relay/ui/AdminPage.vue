<script setup lang="ts">
/** @component MR-P08 AdminPage — 管理系統（佔位） */
import { Construction } from 'lucide-vue-next'
import { EmptyState, PageContainer } from '@/ui'
</script>

<template>
  <PageContainer title="管理系統">
    <EmptyState title="建置中" description="這個頁面由 T-120 完成" :icon="Construction" />
  </PageContainer>
</template>