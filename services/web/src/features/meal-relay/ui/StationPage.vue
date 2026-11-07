<script setup lang="ts">
/** @component MR-P07 StationPage — 據點頁（佔位） */
import { Construction } from 'lucide-vue-next'
import { EmptyState, PageContainer } from '@/ui'
</script>

<template>
  <PageContainer title="據點報到" back>
    <EmptyState title="建置中" description="這個頁面由 T-119 完成" :icon="Construction" />
  </PageContainer>
</template>