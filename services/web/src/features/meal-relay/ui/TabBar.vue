<script setup lang="ts" generic="T extends string">
/** @component MR-C08 TabBar — 分頁列：底線滑動、內容交叉淡入 */
/**
 * 分頁列（志工頁：上架／認領／長者，ARCHITECTURE §11.2）。
 * 底線指示條用 transform 滑到目前分頁（ANIMATION §5.4）。內容請用 <Transition name="tab-fade" mode="out-in"> 包起來。
 */
import './motion.css'
const model = defineModel<T>({ required: true })
const props = defineProps<{ tabs: { value: T; label: string }[] }>()
const index = () => Math.max(0, props.tabs.findIndex((t) => t.value === model.value))
</script>

<template>
  <div class="relative flex border-b border-grey-100" role="tablist">
    <button
      v-for="t in tabs"
      :key="t.value"
      type="button"
      role="tab"
      class="h-11 flex-1 text-sm font-semibold transition-colors duration-200"
      :class="model === t.value ? 'text-primary-700' : 'text-grey-500'"
      :aria-selected="model === t.value"
      @click="model = t.value"
    >
      {{ t.label }}
    </button>
    <span
      class="tab-indicator absolute bottom-0 left-0 h-0.5 rounded-full bg-primary-500"
      :style="{ width: `${100 / tabs.length}%`, transform: `translateX(${index() * 100}%)` }"
      aria-hidden="true"
    />
  </div>
</template>
