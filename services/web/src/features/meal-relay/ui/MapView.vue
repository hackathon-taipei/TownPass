<script setup lang="ts">
/** @component MR-C07 MapView — 鄰食地圖：定位針用 icon＋三色、落下／換色脈衝／淡出動畫、我的位置企鵝、可選點 */
/**
 * MapView — 鄰食轉運站地圖（型別與顏色見 ../logic/mapMarker.ts，對齊 docs/system/11-meal-relay.md v2.2）。
 * 長者定位針（kind: 'elder'）只放在管理員登記長者與志工自己的任務（M13）；志工畫面不能出現長者清單（ADR-026）。
 * 定位針不只靠顏色：據點是 HeartHandshake（深灰）、長者是 User（warn／primary），icon 白色 14px（T-126）。
 * kind: 'me' 畫成圓形企鵝頭像（MR-C23 的圖），位置只來自裝置定位，不送後端；沒有滑行、跳躍動畫。
 * 已結束的定位針（已全數派出、已過期、已下架的食物點，完成、取消）不畫（visibleMarkers）。
 *
 *   markers: Marker[]                       // { id, kind, location, status?, label?, avatar? }
 *   center?: Location                       // 指定時移到這裡；沒指定時第一次載入縮放到所有定位針
 *   onPick?: (location: Location) => void   // 有傳才允許點選位置（@pick 與 :on-pick 等同）
 *   picked?: Location | null                // 目前選取的位置（由父層控制）
 *   zoomPosition?: 'bottomright' | 'bottomleft' // 預設右下；看板留右側給圖例
 *
 * 動畫（ANIMATION.md §5.6）：依 Marker.id 比對差異，新增→落下、狀態改變→換色＋脈衝環一次、移除→淡出縮小。
 * 輪詢更新時不會自動移動或縮放地圖。MapView 不呼叫任何 API（ARCHITECTURE §3）。
 * 底圖：隨附的大臺北向量底圖（public/maps/taipei.pmtiles），縮小時精簡路名，斷網可用。比賽規則不可用 Google Maps。
 */
import { computed, h, onBeforeUnmount, onMounted, ref, render, watch, type Component } from 'vue'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { Feature, LabelRule } from 'protomaps-leaflet'
import { HeartHandshake, User } from 'lucide-vue-next'
import './motion.css'
import { MOTION, replayClass } from '../logic/motion'
import {
  MAP_STATUS_LABEL,
  MARKER_KIND_LABEL,
  pinColorOf,
  visibleMarkers,
  type Location,
  type Marker,
  type MarkerKind,
} from '../logic/mapMarker'

const props = defineProps<{
  markers: Marker[]
  center?: Location
  onPick?: (location: Location) => void
  onMarkerSelect?: (marker: Marker) => void
  picked?: Location | null
  zoomPosition?: 'bottomright' | 'bottomleft'
}>()

const __ATTRIBUTION = '&copy; OpenStreetMap contributors'
const __TAIPEI: L.LatLngTuple = [25.0375, 121.5637]

/** 定位針圓頭裡的 lucide icon（14px、白色），中心約 14, 13.5（T-126：不只靠顏色區分） */
const __LUCIDE: Partial<Record<MarkerKind, Component>> = { station: HeartHandshake, elder: User }
const __lucideCache = new Map<Component, string>()
function __lucideSvg(icon: Component): string {
  let svg = __lucideCache.get(icon)
  if (svg === undefined) {
    const box = document.createElement('div')
    render(h(icon, { size: 14, strokeWidth: 2.25, x: 7, y: 6.5, class: 'tp-map__pin-icon', 'aria-hidden': 'true' }), box)
    svg = box.innerHTML
    render(null, box)
    __lucideCache.set(icon, svg)
  }
  return svg
}

/** 沒有 lucide icon 的 kind 用的小圖示（食物點、提供者只出現在選點的參考定位針） */
const __GLYPH: Record<Exclude<MarkerKind, 'me'> | 'picked', string> = {
  supplier: '<path class="tp-map__pin-glyph" d="M8.4 9.2h11.2l-1.1 3.3H9.5z M9.8 13.4h8.4v5.2H9.8z"/>', // 店面
  station: '',
  elder: '',
  point: '<path class="tp-map__pin-glyph" d="M8.2 8.6h11.6v2H8.2z M8.9 11.6h10.2v6.8H8.9z"/>', // 餐盒（食物點）
  picked: '<circle class="tp-map__pin-glyph" cx="14" cy="13.5" r="4.5"/>',
}

function __glyphOf(kind: Exclude<MarkerKind, 'me'> | 'picked'): string {
  const icon = kind === 'picked' ? undefined : __LUCIDE[kind]
  return icon ? __lucideSvg(icon) : __GLYPH[kind]
}

function __pinHtml(glyph: string): string {
  return (
    '<svg viewBox="0 0 28 36" width="28" height="36" aria-hidden="true" focusable="false">' +
    '<circle class="tp-map__pin-ring" cx="14" cy="13.6" r="11.5"/>' +
    '<path class="tp-map__pin-body" d="M14 1.5C7.1 1.5 1.75 6.9 1.75 13.6 1.75 22.4 14 34.5 14 34.5S26.25 22.4 26.25 13.6C26.25 6.9 20.9 1.5 14 1.5Z"/>' +
    glyph +
    '</svg>'
  )
}

function __icon(className: string, glyph: string): L.DivIcon {
  return L.divIcon({ className, html: __pinHtml(glyph), iconSize: [28, 36], iconAnchor: [14, 35], popupAnchor: [0, -32] })
}

/** 我的位置：圓形企鵝頭像（不是狀態，不上色）；src 只來自 penguinSrc，屬性用 DOM API 設定 */
function __meIcon(m: Marker): L.DivIcon {
  const box = document.createElement('div')
  box.className = 'tp-map__me-face'
  const img = box.appendChild(document.createElement('img'))
  img.alt = ''
  img.width = 36
  img.height = 36
  if (m.avatar) img.src = m.avatar
  return L.divIcon({ className: 'tp-map__me', html: box, iconSize: [40, 40], iconAnchor: [20, 20], popupAnchor: [0, -20] })
}

function __iconOf(m: Marker, animate: boolean): L.DivIcon {
  if (m.kind === 'me') return __meIcon(m)
  return __icon(`${__classOf(m)}${animate ? ' tp-map__pin--enter' : ''}`, __glyphOf(m.kind))
}

const __statusText = (m: Marker) => (m.status ? MAP_STATUS_LABEL[m.status] : '')
const __aria = (m: Marker) => [m.label ?? MARKER_KIND_LABEL[m.kind], __statusText(m)].filter(Boolean).join('，')
/** 說明框：名稱（沒有就用種類）＋種類・狀態。用 textContent，不用 innerHTML。 */
function __popupOf(m: Marker): HTMLElement {
  const box = document.createElement('div')
  const title = box.appendChild(document.createElement('strong'))
  title.className = 'tp-map__popup-title'
  title.textContent = m.label ?? MARKER_KIND_LABEL[m.kind]
  const detail = box.appendChild(document.createElement('div'))
  detail.className = 'tp-map__popup-detail'
  detail.textContent = [MARKER_KIND_LABEL[m.kind], __statusText(m)].filter(Boolean).join('・')
  return box
}

const el = ref<HTMLDivElement>()
let map: L.Map | undefined
let fitted = false

/* ---- 定位針：依 id 差異更新（ANIMATION §5.6 實作要求 1、2） ---- */
type Entry = { marker: L.Marker; data: Marker }
const entries = new Map<string, Entry>()
const __COLOR_CLASSES = ['primary', 'warn', 'grey', 'station'].map((c) => `tp-map__pin--${c}`)
/** 已結束的定位針不畫（T-126） */
const shown = computed(() => visibleMarkers(props.markers))

function __classOf(m: Marker) {
  return `tp-map__pin tp-map__pin--${pinColorOf(m.status)}`
}

function __add(m: Marker, animate: boolean) {
  const marker = L.marker([m.location.lat, m.location.lng], {
    icon: __iconOf(m, animate),
    title: __aria(m),
    riseOnHover: true,
    bubblingMouseEvents: false,
    zIndexOffset: m.kind === 'me' ? 1000 : 0,
  })
    .bindPopup(__popupOf(m), { className: 'tp-map__popup', maxWidth: 240 })
    .addTo(map!)
  marker.on('click', () => props.onMarkerSelect?.(entries.get(m.id)?.data ?? m))
  marker.getElement()?.setAttribute('aria-label', __aria(m))
  entries.set(m.id, { marker, data: m })
}

function __update(entry: Entry, m: Marker) {
  const prev = entry.data
  entry.data = m
  if (prev.location.lat !== m.location.lat || prev.location.lng !== m.location.lng) {
    entry.marker.setLatLng([m.location.lat, m.location.lng])
  }
  if (prev.kind !== m.kind || prev.avatar !== m.avatar) {
    // 種類或頭像變了（很少見）：換圖示，視為新的定位針
    entry.marker.setIcon(__iconOf(m, false))
  } else if (prev.status !== m.status && m.kind !== 'me') {
    // 只換 class，不重建元素：顏色平滑過渡，再播一次脈衝環
    const node = entry.marker.getElement()
    node?.classList.remove(...__COLOR_CLASSES)
    node?.classList.add(`tp-map__pin--${pinColorOf(m.status)}`)
    replayClass(node, 'tp-map__pin--changed')
  }
  if (prev.status !== m.status || prev.label !== m.label || prev.kind !== m.kind) {
    entry.marker.setPopupContent(__popupOf(m))
    entry.marker.getElement()?.setAttribute('aria-label', __aria(m))
    entry.marker.getElement()?.setAttribute('title', __aria(m))
  }
}

function __remove(id: string) {
  const entry = entries.get(id)
  if (!entry) return
  entries.delete(id)
  entry.marker.getElement()?.classList.add('tp-map__pin--leave')
  setTimeout(() => entry.marker.remove(), MOTION.base)
}

function syncMarkers() {
  if (!map) return
  const firstLoad = !fitted
  const list = shown.value
  const next = new Set(list.map((m) => m.id))
  for (const id of [...entries.keys()]) if (!next.has(id)) __remove(id)
  for (const m of list) {
    const entry = entries.get(m.id)
    if (entry) __update(entry, m)
    else __add(m, m.kind !== 'me') // 第一次載入：全部同時落下；之後：只有新的落下（我的位置不做動畫）
  }
  // 只在第一次載入時調整視野；輪詢更新不移動地圖（ANIMATION §5.6 實作要求 3）
  if (firstLoad && list.length) {
    fitted = true
    if (props.center) map.setView([props.center.lat, props.center.lng], 15)
    else
      map.fitBounds(L.latLngBounds(list.map((m) => [m.location.lat, m.location.lng])), {
        paddingTopLeft: [28, 48],
        paddingBottomRight: [28, 16],
        maxZoom: 16,
      })
  }
}

/* ---- 選點 ---- */
let pickedMarker: L.Marker | undefined
function drawPicked(loc: Location | null | undefined) {
  if (!map) return
  if (!loc) {
    pickedMarker?.remove()
    pickedMarker = undefined
    return
  }
  if (pickedMarker) pickedMarker.remove() // 換位置：舊的直接移除
  pickedMarker = L.marker([loc.lat, loc.lng], {
    icon: __icon('tp-map__pin tp-map__pin--picked tp-map__pin--enter tp-map__pin--changed', __GLYPH.picked),
    title: '選擇的位置',
    keyboard: false,
    interactive: false,
  }).addTo(map)
}

function onMapClick(e: L.LeafletMouseEvent) {
  if (!props.onPick) return
  const location: Location = { lat: +e.latlng.lat.toFixed(6), lng: +e.latlng.lng.toFixed(6) }
  if (props.picked === undefined) drawPicked(location) // 父層沒控制 picked 時自己畫
  props.onPick(location)
}

/* ---- 底圖：隨附向量底圖，縮小時精簡路名 ---- */
const __MAIN_ROADS = new Set(['motorway', 'trunk', 'primary'])
const __PLACE_MINZOOM: Record<string, number> = { village: 15, hamlet: 16, locality: 16, isolated_dwelling: 16 }
const __kind = (f: Feature, key = 'kind') => String(f.props[key] ?? '')
const __district = (f: Feature) => __kind(f) === 'neighbourhood' && __kind(f, 'kind_detail') === 'suburb'
const __mainRoad = (f: Feature) =>
  __kind(f) === 'highway' || __MAIN_ROADS.has(__kind(f, 'kind_detail').replace(/_link$/, ''))

function __thinLabels(rules: LabelRule[]): LabelRule[] {
  const takes = (r: LabelRule, layer: string, kind: string) =>
    r.dataLayer === layer && (r.filter?.(16, { props: { kind } } as unknown as Feature) ?? false)
  const out: LabelRule[] = []
  let roadsDone = false
  for (const r of rules) {
    const keep = r.filter ?? (() => true)
    if (takes(r, 'roads', 'major_road') || takes(r, 'roads', 'highway')) {
      if (roadsDone) continue
      roadsDone = true
      out.push({ ...r, filter: (z, f) => keep(z, f) && (z >= 15 || __mainRoad(f)) })
    } else if (takes(r, 'roads', 'minor_road')) {
      out.push({ ...r, minzoom: Math.max(r.minzoom ?? 0, 16) })
      out.push({ ...r, minzoom: 15, filter: (_z, f) => __kind(f) === 'medium_road' })
    } else if (takes(r, 'places', 'locality')) {
      out.push({ ...r, filter: (z, f) => keep(z, f) && z >= (__PLACE_MINZOOM[__kind(f, 'kind_detail')] ?? 0) })
      if (r.minzoom !== undefined && r.maxzoom === undefined) {
        out.push({ ...r, minzoom: 12, filter: (_z, f) => __district(f) })
      }
    } else {
      out.push(r)
    }
  }
  return out
}

async function useVectorBasemap() {
  if (!map) return
  ;(window as unknown as { L: typeof L }).L = L // protomaps-leaflet 會擴充全域 L
  const { leafletLayer } = await import('protomaps-leaflet')
  if (!map) return
  const base = leafletLayer({
    url: `${import.meta.env.BASE_URL}maps/taipei.pmtiles`,
    flavor: 'light',
    lang: 'zh',
    maxDataZoom: 14,
    maxZoom: 18,
    attribution: `${__ATTRIBUTION} &middot; Protomaps`,
  })
  base.labelRules = __thinLabels(base.labelRules)
  base.clearLayout()
  ;(base as unknown as L.Layer).addTo(map)
}

onMounted(() => {
  map = L.map(el.value!, {
    // 像 Google 地圖：電腦拖曳移動、滾輪縮放；手機單指移動、雙指縮放
    dragging: true,
    touchZoom: true,
    scrollWheelZoom: true,
    zoomControl: false,
  }).setView(props.center ? [props.center.lat, props.center.lng] : __TAIPEI, 14)
  L.control.zoom({ position: props.zoomPosition ?? 'bottomright', zoomInTitle: '放大', zoomOutTitle: '縮小' }).addTo(map)
  map.on('popupopen', (e) => {
    const close = e.popup.getElement()?.querySelector('.leaflet-popup-close-button')
    close?.setAttribute('aria-label', '關閉')
    close?.setAttribute('title', '關閉')
  })
  map.on('click', onMapClick)
  void useVectorBasemap()
  syncMarkers()
  drawPicked(props.picked)
})
watch(() => props.markers, syncMarkers, { deep: true })
watch(
  () => props.center && [props.center.lat, props.center.lng],
  (c) => c && map?.setView(c as L.LatLngTuple),
)
watch(
  () => props.picked && [props.picked.lat, props.picked.lng],
  () => drawPicked(props.picked),
)
watch(
  () => props.onPick,
  (pick) => !pick && props.picked === undefined && drawPicked(null),
)
onBeforeUnmount(() => {
  map?.remove()
  map = undefined
})
</script>

<template>
  <!-- Vue 的動態 class 留在外框，避免改寫 Leaflet 注入 host 的 class。 -->
  <div class="relative" :class="{ 'tp-map--picking': !!onPick }">
    <!-- isolate：Leaflet 的圖層 z-index 400 起跳，讓它留在頁首、底部按鈕下面 -->
    <div
      ref="el"
      class="tp-map isolate h-64 w-full overflow-hidden rounded-xl shadow-card ring-1 ring-grey-100"
    />
    <Transition name="fade-up">
      <p
        v-if="onPick"
        class="pointer-events-none absolute top-2 left-1/2 z-[500] -translate-x-1/2 rounded-full bg-white px-3 py-1 text-xs font-medium text-primary-700 shadow-card"
      >
        點地圖選擇位置
      </p>
    </Transition>
  </div>
</template>

<style>
/* 地圖外框、控制鈕、說明框。定位針與動畫在 motion.css。顏色只用 token。 */
.tp-map.leaflet-container {
  font-family: var(--font-sans);
  background: var(--color-grey-50);
}
.tp-map--picking .tp-map.leaflet-container {
  cursor: crosshair;
}
.tp-map .leaflet-bar,
.tp-map.leaflet-touch .leaflet-bar {
  border: 0;
  border-radius: 0.5rem;
  box-shadow: var(--shadow-card);
  overflow: hidden;
  background-clip: border-box;
}
.tp-map .leaflet-bar a,
.tp-map.leaflet-touch .leaflet-bar a {
  width: 36px;
  height: 36px;
  line-height: 36px;
  font-size: 20px;
  font-weight: 500;
  color: var(--color-primary-700);
  background: var(--color-white);
  border-bottom: 1px solid var(--color-grey-100);
  border-radius: 0;
}
.tp-map .leaflet-bar a:last-child {
  border-bottom: 0;
}
.tp-map .leaflet-bar a:hover,
.tp-map .leaflet-bar a:focus-visible {
  background: var(--color-primary-50);
  color: var(--color-primary-700);
}
.tp-map .leaflet-bar a:active {
  background: var(--color-primary-100);
}
.tp-map .leaflet-bar a.leaflet-disabled {
  color: var(--color-grey-300);
  background: var(--color-white);
}
.tp-map .leaflet-bottom.leaflet-right .leaflet-control-zoom {
  margin: 0 10px 24px 0;
}
.tp-map .leaflet-bottom.leaflet-left .leaflet-control-zoom {
  margin: 0 0 24px 10px;
}
.tp-map .tp-map__popup .leaflet-popup-content-wrapper {
  border-radius: 0.75rem;
  box-shadow: var(--shadow-card);
  background: var(--color-white);
  padding: 0;
}
.tp-map .tp-map__popup .leaflet-popup-content {
  margin: 12px 36px 12px 14px;
  font-family: var(--font-sans);
  line-height: 1.4;
}
.tp-map .tp-map__popup .leaflet-popup-tip {
  background: var(--color-white);
  box-shadow: var(--shadow-card);
}
.tp-map .tp-map__popup-title {
  display: block;
  font-size: 1rem;
  font-weight: 600;
  color: var(--color-grey-900);
}
.tp-map .tp-map__popup-detail {
  margin-top: 2px;
  font-size: 0.875rem;
  color: var(--color-grey-600);
}
.tp-map .tp-map__popup a.leaflet-popup-close-button {
  top: 6px;
  right: 6px;
  width: 28px;
  height: 28px;
  font: 400 20px/28px var(--font-sans);
  color: var(--color-grey-400);
  border-radius: 9999px;
}
.tp-map .tp-map__popup a.leaflet-popup-close-button:hover,
.tp-map .tp-map__popup a.leaflet-popup-close-button:focus-visible {
  color: var(--color-grey-700);
  background: var(--color-grey-50);
}
.tp-map .leaflet-control-attribution {
  font-size: 10px;
  line-height: 1.4;
  padding: 1px 6px;
  color: var(--color-grey-700);
  background: color-mix(in srgb, var(--color-white) 75%, transparent);
  border-top-left-radius: 0.375rem;
}
.tp-map .leaflet-control-attribution a {
  color: var(--color-primary-700);
}
</style>
