<script setup lang="ts">
/** @component MR-C81 DoorPhotoField — 放門口的照片：拍照（相機或相簿）、縮圖、「重新拍照」 */
/**
 * 設計 v2 04 中（design-v2/README.md §3.3）：照片在左、「重新拍照」在右；還沒拍時是「拍照」按鈕與提示。
 * M11：放門口一定要附照片。選好檔案後發 `photo`（File），壓縮與 uploadImage 在 logic（attachPhoto）。
 * 斷網（disabled）時停用（ADR-024）。
 *
 *   <DoorPhotoField :photo-url="form.photoUrl" :uploading="form.uploading" :disabled="offline" @photo="attachPhoto" />
 */
import './motion.css'
import { ref } from 'vue'
import { Camera } from 'lucide-vue-next'

defineProps<{ photoUrl?: string | null; uploading?: boolean; disabled?: boolean }>()
const emit = defineEmits<{ photo: [file: File] }>()

const fileInput = ref<HTMLInputElement>()
function onFile(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (file) emit('photo', file)
  input.value = ''
}
</script>

<template>
  <div class="flex items-center gap-3">
    <Transition name="fade-up" mode="out-in">
      <img
        v-if="photoUrl"
        :key="photoUrl"
        :src="photoUrl"
        alt="門口照片"
        class="h-28 w-40 shrink-0 rounded-xl object-cover ring-1 ring-grey-100"
      />
      <p v-else class="min-w-0 flex-1 text-sm text-grey-600">{{ uploading ? '照片上傳中…' : '放門口一定要拍照' }}</p>
    </Transition>
    <button
      type="button"
      class="press inline-flex min-h-12 shrink-0 items-center gap-1.5 rounded-xl bg-white px-4 text-base font-bold text-primary-700 ring-1 ring-primary-500 disabled:opacity-40"
      :class="photoUrl ? 'ml-auto' : ''"
      :disabled="disabled || uploading"
      @click="fileInput?.click()"
    >
      <Camera class="h-5 w-5" aria-hidden="true" />
      {{ photoUrl ? '重新拍照' : '拍照' }}
    </button>
    <input ref="fileInput" type="file" accept="image/*" capture="environment" class="hidden" @change="onFile" />
  </div>
</template>
