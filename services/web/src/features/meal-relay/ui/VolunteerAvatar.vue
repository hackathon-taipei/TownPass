<script setup lang="ts">
/** @component MR-C23 VolunteerAvatar — 志工的企鵝頭像：依志工 id 固定分到 6 隻之一，可輕輕搖擺 */
/**
 * 用在據點頁「今天報到」清單（MR-P07）、志工頁（MR-P04）等列出志工的地方。
 * 合約 v2.2 沒有志工位置的 API，所以不畫在地圖上。圖的來源與授權見 docs/meal-relay/ui-kit.md §5。
 *
 *   <VolunteerAvatar :id="checkin.volunteer_id" :name="checkin.volunteer_name" />
 *   <VolunteerAvatar :id="me.id" :size="64" :idle="false" />
 *
 * name 有傳時當作替代文字；沒傳時視為裝飾圖（旁邊已經有名字）。
 */
import './motion.css'
import { computed } from 'vue'
import { idlePhaseOf, penguinSrc } from '../logic/volunteerAvatar'

const props = withDefaults(defineProps<{ id: string; name?: string; size?: number; idle?: boolean }>(), {
  name: undefined,
  size: 40,
  idle: true,
})

const src = computed(() => penguinSrc(props.id, import.meta.env.BASE_URL))
const style = computed(() => ({
  width: `${props.size}px`,
  height: `${props.size}px`,
  '--idle-phase': idlePhaseOf(props.id).toFixed(3),
}))
</script>

<template>
  <span class="tp-avatar" :class="{ 'tp-avatar--idle': idle }" :style="style">
    <img class="tp-avatar__img" :src="src" :alt="name ? `${name}的頭像` : ''" draggable="false" />
  </span>
</template>
