<script setup lang="ts">
/** @component MR-P04 VolunteerPage — 志工頁（佔位） */
import { Construction } from 'lucide-vue-next'
import { EmptyState, PageContainer } from '@/ui'
</script>

<template>
  <PageContainer title="志工" back>
    <EmptyState title="建置中" description="這個頁面由 T-118 完成" :icon="Construction" />
  </PageContainer>
</template>