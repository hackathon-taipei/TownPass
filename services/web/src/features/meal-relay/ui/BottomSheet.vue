<script setup lang="ts">
/** @component MR-C09 BottomSheet — 底部面板：遮罩淡入、面板由下滑入 */
/**
 * 底部面板（VisitReport 用，ANIMATION §4 sheet）：遮罩淡入、面板由下滑入；點遮罩或按 Esc 關閉。
 * 底部留手勢列空間（env(safe-area-inset-bottom)）。
 */
import './motion.css'
import { onBeforeUnmount, watch } from 'vue'

const open = defineModel<boolean>({ required: true })
defineProps<{ title: string }>()

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') open.value = false
}
watch(open, (v) => (v ? window.addEventListener('keydown', onKey) : window.removeEventListener('keydown', onKey)))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <Teleport to="body">
    <Transition name="sheet">
      <div v-if="open" class="fixed inset-0 z-[900] flex items-end justify-center bg-grey-900/40" @click.self="open = false">
        <section
          class="sheet-panel max-h-[85vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-card"
          role="dialog"
          aria-modal="true"
          :aria-label="title"
        >
          <div class="mx-auto mb-3 h-1 w-10 rounded-full bg-grey-200" aria-hidden="true" />
          <div v-if="$slots['header-action']" class="flex justify-end">
            <slot name="header-action" />
          </div>
          <h2
            class="break-words"
            :class="$slots['header-action'] ? 'text-[clamp(1.5rem,7.5vw,2rem)] leading-tight font-black text-primary-900' : 'text-lg font-bold text-grey-900'"
          >
            {{ title }}
          </h2>
          <div class="mt-3">
            <slot />
          </div>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>
