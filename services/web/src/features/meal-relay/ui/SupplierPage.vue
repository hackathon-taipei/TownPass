<script setup lang="ts">
/** @component MR-P06 SupplierPage — 提供者頁（佔位） */
import { Construction } from 'lucide-vue-next'
import { EmptyState, PageContainer } from '@/ui'
</script>

<template>
  <PageContainer title="提供食物" back>
    <EmptyState title="建置中" description="這個頁面由 T-117 完成" :icon="Construction" />
  </PageContainer>
</template>