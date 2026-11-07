<script setup lang="ts">
/** @component MR-C42 VisitReportSheet — 拜訪回報底部面板：結果三選一、放門口拍照、送出 */
/**
 * 合約 M9、M11：結果用 kit MR-C17 VisitResultPicker；放門口只限送餐、生鮮蔬果不能放門口（V11）、一定要附照片。
 * 送出條件由 logic 的 reportBlockReason 判斷（blockReason 有值就停用並顯示原因，斷網也停用，ADR-024）。
 *
 *   <VisitReportSheet v-model:open="reportOpen" v-model:result="form.result" :task="reportTask" :photo-url="form.photoUrl"
 *                     :block-reason="blockReason" :error="reportError" :submitting="reporting" @photo="attachPhoto" @submit="submitReport" />
 */
import './motion.css'
import type { TaskView, VisitResult } from '../logic/volunteer'
import BottomSheet from './BottomSheet.vue'
import SubmitButton from './SubmitButton.vue'
import VisitResultPicker from './VisitResultPicker.vue'

defineProps<{
  task: TaskView | null
  photoUrl?: string | null
  blockReason?: string
  error?: string
  submitting?: boolean
}>()
const open = defineModel<boolean>('open', { required: true })
const result = defineModel<VisitResult | null>('result', { required: true })
const emit = defineEmits<{ photo: [file: File]; submit: [] }>()
</script>

<template>
  <BottomSheet v-model="open" :title="task ? `回報：${task.assignment.elder.alias}` : '回報拜訪'">
    <form v-if="task" class="space-y-4" @submit.prevent="emit('submit')">
      <p class="text-base text-grey-800">
        {{ task.kind === 'meal' ? `送餐：${task.claim?.food.name ?? ''}` : '這次只做關懷' }}
      </p>
      <VisitResultPicker
        v-model="result"
        :kind="task.kind"
        :category="task.claim?.food.category"
        :photo-url="photoUrl"
        @photo="(file) => emit('photo', file)"
      />
      <Transition name="fade-up">
        <p v-if="error" class="text-sm text-warn-200" role="alert">{{ error }}</p>
      </Transition>
      <p v-if="blockReason && !error" class="text-sm text-grey-500">{{ blockReason }}</p>
      <SubmitButton :loading="submitting" :disabled="!!blockReason">送出回報</SubmitButton>
    </form>
  </BottomSheet>
</template>
