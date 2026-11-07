<script setup lang="ts">
/** @component MR-C22 ResetDemoButton — 重置示範資料：送出中轉圈，成功後提示並通知頁面淡出淡入（E3） */
/**
 * 管理系統用。onReset 裡呼叫 resetDemo；成功後跳提示「已重置為示範資料」並發出 done，
 * 父層把 PageTransition（variant="refresh"）的 page-key 加 1，內容就會淡出再淡入。
 *
 *   <ResetDemoButton :on-reset="resetDemo" @done="version++" />
 *   <PageTransition variant="refresh" :page-key="version"> …看板… </PageTransition>
 */
import { ref } from 'vue'
import SubmitButton from './SubmitButton.vue'
import { toast } from '../logic/toast'

const props = defineProps<{ onReset: () => Promise<unknown> }>()
const emit = defineEmits<{ done: [] }>()
const loading = ref(false)

async function reset() {
  loading.value = true
  try {
    await props.onReset()
    toast('已重置為示範資料')
    emit('done')
  } catch (e) {
    toast(e instanceof Error ? e.message : '重置失敗，請再試一次', 'error')
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <form @submit.prevent="reset">
    <SubmitButton :loading="loading">重置示範資料</SubmitButton>
  </form>
</template>
