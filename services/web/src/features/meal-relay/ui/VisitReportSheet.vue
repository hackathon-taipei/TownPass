<script setup lang="ts">
/** @component MR-C42 VisitReportSheet — 拜訪回報底部面板：「回報：{代號}」、食物晶片、三選一、放門口拍照、送出回報、關閉 */
/**
 * 設計 v2 04 中（design-v2/README.md §3.3 回報面板）：MR-C09 BottomSheet {
 *   右上「關閉」、食物晶片（「素食便當・1 份」；純關懷是「這次只做關懷」）、MR-C80 VisitResultOptions、
 *   說明「放門口需要拍照；生鮮蔬果不適用」、MR-C81 DoorPhotoField（選放門口時）、MR-C10 SubmitButton「送出回報」 }
 * 合約 M9、M11：放門口只限送餐、生鮮蔬果不能放門口（V11）、一定要附照片。
 * 送出條件由 logic 的 reportBlockReason 判斷（blockReason 有值就停用並顯示原因，斷網也停用，ADR-024）。
 *
 *   <VisitReportSheet v-model:open="reportOpen" v-model:result="form.result" :task="reportTask" :photo-url="form.photoUrl"
 *                     :uploading="form.uploading" :offline="offline" :block-reason="blockReason" :error="reportError"
 *                     :submitting="reporting" @photo="attachPhoto" @submit="submitReport" />
 */
import './motion.css'
import { Info, ShoppingBag, X } from 'lucide-vue-next'
import { REPORT_NOTE, type TaskView, type VisitResult } from '../logic/volunteer'
import BottomSheet from './BottomSheet.vue'
import DoorPhotoField from './DoorPhotoField.vue'
import SubmitButton from './SubmitButton.vue'
import VisitResultOptions from './VisitResultOptions.vue'

defineProps<{
  task: TaskView | null
  photoUrl?: string | null
  uploading?: boolean
  offline?: boolean
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
    <template #header-action>
      <button
        type="button"
        class="press -mt-2 inline-flex min-h-9 items-center gap-1 rounded-full border border-grey-200 bg-grey-50/50 px-3 text-sm font-bold text-grey-800"
        @click="open = false"
      >
        <X class="size-4" aria-hidden="true" />
        關閉
      </button>
    </template>
    <form v-if="task" class="space-y-3" @submit.prevent="emit('submit')">
      <p class="flex min-h-9 items-center gap-2 rounded-xl bg-linear-to-r from-grey-50 to-grey-100 px-4 text-base font-bold text-grey-900">
        <ShoppingBag class="size-6 shrink-0 text-grey-700" aria-hidden="true" />
        {{ task.kind === 'meal' && task.claim ? `${task.claim.food.name}・${task.claim.qty} 份` : '這次只做關懷' }}
      </p>
      <VisitResultOptions v-model="result" :kind="task.kind" :category="task.claim?.food.category" />
      <p class="flex items-center gap-1.5 text-sm text-grey-600">
        <Info class="h-4 w-4 shrink-0" aria-hidden="true" />
        {{ REPORT_NOTE }}
      </p>
      <Transition name="expand">
        <div v-if="result === 'left_at_door'" class="expand-box">
          <DoorPhotoField :photo-url="photoUrl" :uploading="uploading" :disabled="offline" @photo="(file) => emit('photo', file)" />
        </div>
      </Transition>
      <Transition name="fade-up">
        <p v-if="error" class="text-sm text-warn-200" role="alert">{{ error }}</p>
      </Transition>
      <p v-if="blockReason && !error" class="text-sm text-grey-500">{{ blockReason }}</p>
      <SubmitButton class="min-h-14 rounded-xl text-2xl font-extrabold! enabled:bg-linear-to-br enabled:from-primary-600 enabled:to-primary-700" :loading="submitting" :disabled="!!blockReason">送出回報</SubmitButton>
    </form>
  </BottomSheet>
</template>
