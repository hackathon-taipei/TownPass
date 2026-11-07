<script setup lang="ts">
/** @component MR-P05 TaskPage — 我的任務與拜訪回報（佔位） */
import { Construction } from 'lucide-vue-next'
import { EmptyState, PageContainer } from '@/ui'
</script>

<template>
  <PageContainer title="我的任務" back>
    <EmptyState title="建置中" description="這個頁面由 T-118 完成" :icon="Construction" />
  </PageContainer>
</template>