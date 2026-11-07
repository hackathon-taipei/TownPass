<script setup lang="ts">
/** @component MR-C21 PageTransition — 頁面切換：載入骨架 → 內容淡入上移；身分或資料重置時舊畫面淡出再換新（E1、E2、E3） */
/**
 *   E1 啟動：getMe 回應前 loading = true 顯示骨架，回應後依角色顯示頁面
 *   E2 切換身分：page-key 換成新的角色（或帳號 id），舊頁面淡出、新頁面淡入上移
 *   E3 重置：variant="refresh"、page-key 換成重置次數，內容只淡出淡入（不位移）
 *
 *   <PageTransition :loading="!me" :page-key="me?.role"> <component :is="pageOf(me.role)" /> </PageTransition>
 */
import './motion.css'

withDefaults(defineProps<{ loading?: boolean; pageKey?: string | number; variant?: 'page' | 'refresh' }>(), {
  loading: false,
  pageKey: 'page',
  variant: 'page',
})
</script>

<template>
  <Transition :name="variant === 'refresh' ? 'tab-fade' : 'fade-up'" mode="out-in">
    <div v-if="loading" key="__skeleton" class="space-y-3" role="status" aria-label="載入中">
      <slot name="skeleton">
        <div class="h-6 w-1/2 animate-pulse rounded bg-grey-200" />
        <div class="h-40 w-full animate-pulse rounded-xl bg-grey-200" />
        <div class="h-16 w-full animate-pulse rounded-xl bg-grey-200" />
      </slot>
    </div>
    <div v-else :key="pageKey"><slot /></div>
  </Transition>
</template>
