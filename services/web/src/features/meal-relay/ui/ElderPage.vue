<script setup lang="ts">
/** @component MR-P02 ElderPage — 長者頁（佔位） */
import { Construction } from 'lucide-vue-next'
import { EmptyState, PageContainer } from '@/ui'
</script>

<template>
  <PageContainer title="找食物" back>
    <EmptyState title="建置中" description="這個頁面由 T-116 完成" :icon="Construction" />
  </PageContainer>
</template>