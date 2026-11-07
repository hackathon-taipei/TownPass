<script setup lang="ts">
/** @component O02 OsmMap — 地圖（隨附臺北向量底圖，縮小時精簡路名；可切換 OSM 圖磚） */
/**
 * OpenStreetMap data via Leaflet. Competition rules forbid commercial map SDKs (e.g. Google Maps),
 * so use this component for every map. Attribution must stay visible (OSM licence).
 *
 * Basemap (ADR-017, ADR-022): by default the vector extract shipped with the site
 * (maps/taipei.pmtiles, protomaps-leaflet), online and offline, so road labels can be thinned by
 * zoom. basemap="osm" uses OSM raster tiles instead and still switches to the vector basemap when
 * offline or when tiles fail. The OSM tile policy forbids downloading their tiles in advance, so
 * the offline map can't be a tile cache.
 *
 * Look: token-coloured pin markers (L.divIcon + inline SVG), kit-styled zoom buttons / popup /
 * attribution, and a slightly desaturated OSM raster layer in "osm" mode. All Leaflet overrides
 * live in the non-scoped <style> below and are prefixed with the `.tp-map` root class.
 */
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { Feature, LabelRule } from 'protomaps-leaflet'

export type MapMarker = { lat: number; lng: number; label?: string; detail?: string; tone?: 'default' | 'warning' }

const __ATTRIBUTION = '&copy; OpenStreetMap contributors'

/** Teardrop pin, 28×36, tip at (14, 35). Colours come from CSS variables (see <style>). */
const __PIN_SVG =
  '<svg viewBox="0 0 28 36" width="28" height="36" aria-hidden="true" focusable="false">' +
  '<path class="tp-map__pin-body" d="M14 1.5C7.1 1.5 1.75 6.9 1.75 13.6 1.75 22.4 14 34.5 14 34.5S26.25 22.4 26.25 13.6C26.25 6.9 20.9 1.5 14 1.5Z"/>' +
  '<circle class="tp-map__pin-dot" cx="14" cy="13.5" r="4.75"/>' +
  '</svg>'

function __iconOf(m: MapMarker): L.DivIcon {
  return L.divIcon({
    className: `tp-map__pin tp-map__pin--${m.tone ?? 'default'}`,
    html: __PIN_SVG,
    iconSize: [28, 36],
    iconAnchor: [14, 35],
    popupAnchor: [0, -32],
  })
}

const props = withDefaults(
  defineProps<{
    center?: [number, number]
    zoom?: number
    markers?: MapMarker[]
    /** zoom to show every marker */
    fit?: boolean
    /** 'auto' / 'offline': shipped Taipei vector basemap; 'osm': OSM raster tiles (vector when offline) */
    basemap?: 'auto' | 'offline' | 'osm'
  }>(),
  { center: () => [25.0375, 121.5637], zoom: 14, markers: () => [], basemap: 'auto' },
)
const emit = defineEmits<{ markerClick: [marker: MapMarker] }>()

const el = ref<HTMLDivElement>()
let map: L.Map | undefined
let layer: L.LayerGroup | undefined

function drawMarkers() {
  if (!map) return
  layer?.remove()
  layer = L.layerGroup(
    props.markers.map((m) =>
      L.marker([m.lat, m.lng], { icon: __iconOf(m), title: m.label ?? '', riseOnHover: true })
        // setAttribute, never innerHTML: the label comes from outside data
        .on('add', (e) => (e.target as L.Marker).getElement()?.setAttribute('aria-label', m.label || '地點'))
        .bindPopup(__popupOf(m), { className: 'tp-map__popup', maxWidth: 240 })
        .on('click', () => emit('markerClick', m)),
    ),
  ).addTo(map)
  if (props.fit && props.markers.length) {
    // the pin is drawn above its point, so leave room for its 36px height at the top
    map.fitBounds(L.latLngBounds(props.markers.map((m) => [m.lat, m.lng])), {
      paddingTopLeft: [28, 48],
      paddingBottomRight: [28, 16],
      maxZoom: 16,
    })
  }
}

/** Built with textContent: labels come from outside data and must never be read as HTML. */
function __popupOf(m: MapMarker): HTMLElement {
  const box = document.createElement('div')
  const title = box.appendChild(document.createElement('strong'))
  title.className = 'tp-map__popup-title'
  title.textContent = m.label ?? ''
  if (m.detail) {
    const detail = box.appendChild(document.createElement('div'))
    detail.className = 'tp-map__popup-detail'
    detail.textContent = m.detail
  }
  return box
}

/**
 * Labels by zoom, so the zoomed-out map stays clean. The Taipei extract tags roads as
 * kind=highway|major_road|minor_road|path with the OSM class in kind_detail.
 * - roads: highway / trunk / primary from 12 (flavor default), secondary / tertiary / medium_road
 *   from 15, minor_road / other / path from 16 (flavor default)
 * - places: cities/towns as the flavor does, districts (suburb, e.g. 信義區) from 12 (the data has them from 13),
 *   villages (e.g. 興雅) from 15, hamlets and other old place names from 16
 */
const __MAIN_ROADS = new Set(['motorway', 'trunk', 'primary'])
const __PLACE_MINZOOM: Record<string, number> = { village: 15, hamlet: 16, locality: 16, isolated_dwelling: 16 }
const __kind = (f: Feature, key = 'kind') => String(f.props[key] ?? '')
// suburb = 行政區; macrohood/quarter in this extract are shopping areas (e.g. 光華商場), so they stay out
const __district = (f: Feature) => __kind(f) === 'neighbourhood' && __kind(f, 'kind_detail') === 'suburb'
const __mainRoad =(f: Feature) => __kind(f) === 'highway' || __MAIN_ROADS.has(__kind(f, 'kind_detail').replace(/_link$/, ''))

/** Thin the flavor's default label rules instead of rewriting the style. */
function __thinLabels(rules: LabelRule[]): LabelRule[] {
  // classify a rule by asking its own filter about a sample feature
  const takes = (r: LabelRule, layer: string, kind: string) =>
    r.dataLayer === layer && (r.filter?.(16, { props: { kind } } as unknown as Feature) ?? false)
  const out: LabelRule[] = []
  let roadsDone = false
  for (const r of rules) {
    const keep = r.filter ?? (() => true)
    if (takes(r, 'roads', 'major_road') || takes(r, 'roads', 'highway')) {
      if (roadsDone) continue // the flavor lists this rule twice
      roadsDone = true
      out.push({ ...r, filter: (z, f) => keep(z, f) && (z >= 15 || __mainRoad(f)) })
    } else if (takes(r, 'roads', 'minor_road')) {
      out.push({ ...r, minzoom: Math.max(r.minzoom ?? 0, 16) })
      out.push({ ...r, minzoom: 15, filter: (_z, f) => __kind(f) === 'medium_road' })
    } else if (takes(r, 'places', 'locality')) {
      out.push({ ...r, filter: (z, f) => keep(z, f) && z >= (__PLACE_MINZOOM[__kind(f, 'kind_detail')] ?? 0) })
      if (r.minzoom !== undefined && r.maxzoom === undefined) {
        // the flavor has no district labels; reuse its town-label style for them
        out.push({ ...r, minzoom: 12, filter: (_z, f) => __district(f) })
      }
    } else {
      out.push(r)
    }
  }
  return out
}

let osmLayer: L.TileLayer | undefined
let usingVector = false

/** Shipped Taipei vector basemap (maps/taipei.pmtiles). Default online and offline (ADR-017, ADR-022). */
async function useVectorBasemap() {
  if (usingVector || !map) return
  usingVector = true
  osmLayer?.remove()
  // protomaps-leaflet extends the global L, so it has to exist before the library loads
  ;(window as unknown as { L: typeof L }).L = L
  const { leafletLayer } = await import('protomaps-leaflet')
  if (!map) return
  const layer = leafletLayer({
    url: `${import.meta.env.BASE_URL}maps/taipei.pmtiles`,
    flavor: 'light',
    lang: 'zh',
    maxDataZoom: 14,
    maxZoom: 18,
    attribution: `${__ATTRIBUTION} &middot; Protomaps`,
  })
  layer.labelRules = __thinLabels(layer.labelRules)
  layer.clearLayout() // rebuild the labeler with the thinned rules
  ;(layer as unknown as L.Layer).addTo(map)
}

/** basemap="osm": OSM raster tiles, falling back to the vector basemap when tiles fail. */
function useOsmBasemap() {
  osmLayer = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: __ATTRIBUTION,
    // only this layer gets the calmer filter (see <style>); the vector layer is left as is
    className: 'tp-map__osm',
  })
  osmLayer.on('tileerror', () => void useVectorBasemap())
  osmLayer.addTo(map!)
}

onMounted(() => {
  map = L.map(el.value!, {
    // On phones a one-finger drag should scroll the page, not trap the user in the map.
    // Pinch-zoom and the +/- buttons still work.
    dragging: !L.Browser.mobile,
    scrollWheelZoom: false,
    zoomControl: false,
  }).setView(props.center, props.zoom)
  // Leaflet copies these titles into aria-label
  L.control.zoom({ position: 'bottomright', zoomInTitle: '放大', zoomOutTitle: '縮小' }).addTo(map)
  map.on('popupopen', (e) => {
    const close = e.popup.getElement()?.querySelector('.leaflet-popup-close-button')
    close?.setAttribute('aria-label', '關閉')
    close?.setAttribute('title', '關閉')
  })
  if (props.basemap === 'osm' && navigator.onLine) useOsmBasemap()
  else void useVectorBasemap()
  drawMarkers()
})
watch(() => props.markers, drawMarkers, { deep: true })
watch(() => props.center, (c) => map?.setView(c))
onBeforeUnmount(() => {
  map?.remove()
  map = undefined
})
</script>

<template>
  <!-- isolate: Leaflet panes use z-index 400+, keep them below sticky headers/bars -->
  <div ref="el" class="tp-map isolate h-64 w-full overflow-hidden rounded-xl shadow-card ring-1 ring-grey-100" />
</template>

<style>
/* Leaflet overrides, scoped by the .tp-map root class. Colours: tokens only (var(--color-*)). */
.tp-map.leaflet-container {
  font-family: var(--font-sans);
  background: var(--color-grey-50);
}

/* calmer online basemap so the pins stand out */
.tp-map .tp-map__osm {
  filter: saturate(0.65) brightness(1.03);
}

/* pins */
.tp-map .tp-map__pin {
  background: none;
  border: 0;
  --pin-fill: var(--color-primary-500);
  --pin-stroke: var(--color-primary-700);
}
.tp-map .tp-map__pin--warning {
  --pin-fill: var(--color-orange-500);
  --pin-stroke: var(--color-orange-700);
}
.tp-map .tp-map__pin svg {
  display: block;
  overflow: visible;
  filter: drop-shadow(0 2px 2px color-mix(in srgb, var(--color-grey-900) 30%, transparent));
  transition: transform 0.15s ease;
  transform-origin: 50% 100%;
}
.tp-map .tp-map__pin:hover svg,
.tp-map .tp-map__pin:focus-visible svg {
  transform: scale(1.1);
}
.tp-map .tp-map__pin:focus-visible {
  outline: none;
}
.tp-map .tp-map__pin:focus-visible .tp-map__pin-body {
  stroke: var(--color-grey-900);
}
.tp-map .tp-map__pin-body {
  fill: var(--pin-fill);
  stroke: var(--pin-stroke);
  stroke-width: 1.5;
}
.tp-map .tp-map__pin-dot {
  fill: var(--color-white);
}

/* zoom control: white rounded buttons, card shadow, 36px touch targets */
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

/* popup */
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

/* attribution: smaller but still visible (OSM licence) */
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
