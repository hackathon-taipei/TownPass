<script setup lang="ts">
/** @component MR-C06 ImageInput — 拍照或選圖，前端壓縮成 base64（M19，≤ IMAGE_MAX_BYTES） */
/**
 * 合約 M19：圖片前端壓縮後以 base64 上傳，後端檢查 mime 與大小（IMAGE_MAX_BYTES）。
 * 本元件只收 props、發 emit，不呼叫 API；上傳由頁面呼叫 uploadImage。
 *
 *   <ImageInput :preview-url="photoUrl" :disabled="saving" @change="onImage" @clear="onClear" />
 *   onImage({ data, mime, bytes }) 的 data 已去掉 data: 前綴
 */
import './motion.css'
import { computed, ref, watch } from 'vue'
import { IMAGE_MAX_BYTES, IMAGE_QUALITY_STEPS, base64Bytes, fitSize, isImageMime } from '../logic/shared'

const props = defineProps<{
  label?: string
  disabled?: boolean
  previewUrl?: string | null
}>()

const emit = defineEmits<{
  change: [payload: { data: string; mime: 'image/jpeg'; bytes: number }]
  clear: []
}>()

const fileInput = ref<HTMLInputElement>()
const busy = ref(false)
const error = ref('')
/** 本元件剛壓縮好的預覽：null 表示沿用 previewUrl，空字串表示使用者已移除 */
const localPreview = ref<string | null>(null)

// 父層換了圖（或清掉）就以父層為準
watch(
  () => props.previewUrl,
  () => (localPreview.value = null),
)

const shown = computed(() => (localPreview.value !== null ? localPreview.value || null : (props.previewUrl ?? null)))
const idle = computed(() => !shown.value)
const buttonText = computed(() => {
  if (busy.value) return '處理中…'
  return idle.value ? (props.label ?? '拍照或選圖') : '重新拍照'
})

function openPicker() {
  if (props.disabled || busy.value) return
  fileInput.value?.click()
}

/** 讀取圖片尺寸與像素：優先 createImageBitmap，不支援時退回 Image + objectURL */
async function loadSource(file: File): Promise<{ source: CanvasImageSource; width: number; height: number; done: () => void }> {
  if (typeof createImageBitmap === 'function') {
    const bitmap = await createImageBitmap(file)
    return { source: bitmap, width: bitmap.width, height: bitmap.height, done: () => bitmap.close() }
  }
  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    img.src = url
    await img.decode()
    return { source: img, width: img.naturalWidth, height: img.naturalHeight, done: () => URL.revokeObjectURL(url) }
  } catch (err) {
    URL.revokeObjectURL(url)
    throw err
  }
}

/** 縮到長邊 ≤ IMAGE_MAX_EDGE 後，依序試品質直到 ≤ IMAGE_MAX_BYTES；都太大回傳 null */
async function compress(file: File): Promise<string | null> {
  const loaded = await loadSource(file)
  try {
    const { width, height } = fitSize(loaded.width, loaded.height)
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('canvas 不支援')
    // 透明的 PNG 轉 JPEG 會變黑底，先鋪白色
    ctx.fillStyle = 'white'
    ctx.fillRect(0, 0, width, height)
    ctx.drawImage(loaded.source, 0, 0, width, height)
    for (const q of IMAGE_QUALITY_STEPS) {
      const url = canvas.toDataURL('image/jpeg', q)
      if (base64Bytes(url) <= IMAGE_MAX_BYTES) return url
    }
    return null
  } finally {
    loaded.done()
  }
}

async function onFile(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = '' // 讓同一張圖可以再次選取
  if (!file || busy.value) return

  error.value = ''
  if (!isImageMime(file.type)) {
    error.value = '只能用 JPG、PNG 或 WebP 圖片'
    return
  }

  busy.value = true
  try {
    const url = await compress(file)
    if (!url) {
      error.value = '圖片太大，請換一張或靠近一點拍'
      return
    }
    const data = url.slice(url.indexOf(',') + 1)
    localPreview.value = url
    emit('change', { data, mime: 'image/jpeg', bytes: base64Bytes(data) })
  } catch {
    error.value = '無法讀取這張圖片，請換一張'
  } finally {
    busy.value = false
  }
}

function clear() {
  error.value = ''
  localPreview.value = ''
  emit('clear')
}
</script>

<template>
  <div class="space-y-2">
    <input
      ref="fileInput"
      type="file"
      accept="image/jpeg,image/png,image/webp"
      capture="environment"
      class="hidden"
      :disabled="disabled || busy"
      @change="onFile"
    />

    <img
      v-if="shown"
      :src="shown"
      alt="圖片預覽"
      class="max-h-48 w-full rounded-xl object-cover ring-1 ring-grey-100"
    />

    <button
      type="button"
      class="press flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-white text-base font-medium text-primary-700 ring-1 ring-primary-200 disabled:text-grey-400"
      :disabled="disabled || busy"
      :aria-busy="busy"
      @click="openPicker"
    >
      {{ buttonText }}
    </button>

    <button
      v-if="shown && !busy"
      type="button"
      class="press flex h-11 w-full items-center justify-center rounded-xl text-sm text-grey-600 disabled:text-grey-400"
      :disabled="disabled"
      @click="clear"
    >
      移除
    </button>

    <Transition name="fade-up">
      <p v-if="error" class="text-sm text-warn-200" role="alert">{{ error }}</p>
    </Transition>
  </div>
</template>
