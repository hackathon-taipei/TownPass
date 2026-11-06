/**
 * LOGIC LAYER - add-on rag: on-device retrieval-augmented answers.
 *   1. vectorise what features already provide, split into single facts (one notice / line per chunk)
 *   2. embed the question, take the most similar chunks (cosine)
 *   3. a small local LLM answers ONLY from them; a grounding guard (isGrounded) replaces English,
 *      invented or garbled answers with the best fact; without the LLM -> extractive answer
 * The generator is picked from the phone's hardware (chooseGenerator) and can be overridden.
 * Competition rule: everything runs on the device; MODEL_DISCLOSURE lists what must be disclosed.
 */
import { computed, ref } from 'vue'
import { featureEntry, features, type Feature, type FeatureItem } from '@/framework'
import type { RouteLocationRaw } from 'vue-router'
import {
  cachedModelIds,
  embed,
  generate,
  loadEmbedder,
  loadedGenerator,
  loadGenerator,
  loadVectors,
  probeHardware,
  requestPersistentStorage,
  saveVectors,
  unloadGenerator,
  type ChatMessage,
  type Device,
  type Dtype,
  type HardwareProfile,
} from './data'

export type { HardwareProfile }

export const EMBEDDING_MODEL = {
  id: 'Xenova/multilingual-e5-small',
  base: 'intfloat/multilingual-e5-small',
  vendor: 'Microsoft',
  licence: 'MIT',
  dtype: 'q8' as Dtype,
  sizeMB: 118,
}

export const GENERATORS = {
  small: {
    id: 'onnx-community/granite-4.0-350m-ONNX-web',
    base: 'ibm-granite/granite-4.0-350m',
    label: 'Granite 4.0 350M',
    vendor: 'IBM',
    licence: 'Apache-2.0',
    sizeMB: { q4f16: 350, q4: 576 } as Record<string, number>,
  },
  large: {
    id: 'onnx-community/granite-4.0-1b-ONNX-web',
    base: 'ibm-granite/granite-4.0-1b',
    label: 'Granite 4.0 1B',
    vendor: 'IBM',
    licence: 'Apache-2.0',
    sizeMB: { q4f16: 1247, q4: 1781 } as Record<string, number>,
  },
} as const
export type GeneratorKey = keyof typeof GENERATORS
/** 'none' = no language model: answer with the best retrieved fact (extractive). */
export type ModelKey = GeneratorKey | 'none'

export interface ModelChoice {
  key: ModelKey
  id: string
  label: string
  device: Device
  dtype: Dtype
  sizeMB: number
  reasons: string[]
}

/** Thresholds for the 1B model. Tuned for "answers in a few seconds on a recent flagship phone". */
export const LARGE_MODEL_NEEDS = { memoryGB: 8, cores: 8, freeStorageMB: 2600, maxBufferMB: 1024 }

/**
 * Pure policy: which language model this phone should run.
 *   WebGPU + fp16 + ≥8 GB memory + ≥8 cores + room to cache it  -> 1B on the GPU
 *   WebGPU + fp16 otherwise                                       -> 350M on the GPU
 *   no usable WebGPU                                              -> no LLM (extractive answers):
 *     measured ~30 s per answer for 350M on a laptop CPU - unusable in a demo.
 *     Override 'small' still runs 350M on the CPU; 1B never runs on the CPU.
 */
export function chooseGenerator(hw: HardwareProfile, override?: ModelKey): ModelChoice {
  const gpu = hw.webgpu && hw.shaderF16
  const reasons: string[] = []
  const need = LARGE_MODEL_NEEDS
  let key: ModelKey

  if (!gpu) {
    reasons.push(hw.webgpu ? 'GPU 不支援 16 位元運算' : '這個 WebView 沒有 WebGPU', 'CPU 生成每題約 30 秒 → 預設只做向量檢索＋摘錄')
    key = 'none'
    if (override === 'small') (key = 'small'), reasons.unshift('手動指定 350M（CPU，回答很慢）')
    if (override === 'large') (key = 'small'), reasons.unshift('沒有 GPU 不能跑 1B，改用 350M（CPU，回答很慢）')
  } else {
    if (hw.memoryGB !== null && hw.memoryGB < need.memoryGB) reasons.push(`記憶體約 ${hw.memoryGB} GB（< ${need.memoryGB}）`)
    if (hw.memoryGB === null) reasons.push('無法得知記憶體大小')
    if (hw.cores < need.cores) reasons.push(`CPU ${hw.cores} 核（< ${need.cores}）`)
    if (hw.freeStorageMB !== null && hw.freeStorageMB < need.freeStorageMB) reasons.push(`可用儲存空間 ${hw.freeStorageMB} MB 不足`)
    if (hw.maxBufferMB < need.maxBufferMB) reasons.push(`GPU 緩衝上限 ${hw.maxBufferMB} MB（< ${need.maxBufferMB}）`)
    key = reasons.length === 0 ? 'large' : 'small'
    if (key === 'large') reasons.push('硬體符合 1B 條件')
    if (override && override !== key) {
      key = override
      reasons.unshift(`手動指定 ${override === 'none' ? '只摘錄' : GENERATORS[override].label}`)
    }
  }

  if (key === 'none') return { key, id: '', label: '只用向量檢索（摘錄）', device: 'wasm', dtype: 'q4', sizeMB: 0, reasons }
  const device: Device = gpu ? 'webgpu' : 'wasm'
  const dtype: Dtype = gpu ? 'q4f16' : 'q4'
  const g = GENERATORS[key]
  return { key, id: g.id, label: g.label, device, dtype, sizeMB: g.sizeMB[dtype] ?? 0, reasons }
}

/** What the competition requires us to disclose about on-device models. */
export function modelDisclosure(choice: ModelChoice | null) {
  const g = choice && choice.key !== 'none' ? GENERATORS[choice.key] : null
  return [
    { label: '向量模型', value: `${EMBEDDING_MODEL.base}（${EMBEDDING_MODEL.vendor}，${EMBEDDING_MODEL.licence}）` },
    { label: '向量量化', value: `${EMBEDDING_MODEL.dtype}，${EMBEDDING_MODEL.id}` },
    { label: '語言模型', value: g ? `${g.base}（${g.vendor}，${g.licence}）` : '未使用（只做向量檢索＋摘錄）' },
    { label: '語言量化', value: g ? `${choice!.dtype}，${choice!.id}` : '—' },
    { label: '推論框架', value: `Transformers.js 4.3.2 + ONNX Runtime Web（${choice?.device === 'webgpu' ? 'WebGPU' : 'WebAssembly'}）` },
    { label: '執行位置', value: '全部在手機上（裝置端），不連任何雲端模型' },
  ]
}

export interface RagSource {
  key: string
  title: string
  subtitle?: string
  score: number
  to: RouteLocationRaw
}
export interface RagAnswer {
  answer: string
  sources: RagSource[]
  /** 'guarded' = the model answered but failed the grounding check, so the best fact is shown instead */
  mode: 'llm' | 'extractive' | 'guarded'
  /** what the model said when mode is 'guarded' (for debugging / the lab page) */
  rejected?: string
  model: string
  ms: number
}

// ---------------------------------------------------------------- state (shared singleton)
type Status = 'idle' | 'probing' | 'downloading' | 'indexing' | 'ready' | 'error'
const status = ref<Status>('idle')
const progress = ref(0)
const message = ref('')
const hardware = ref<HardwareProfile | null>(null)
const choice = ref<ModelChoice | null>(null)
const docsCount = ref(0)
const offlineReady = ref<string[]>([])
let __chunks: __Chunk[] = []

export function useRag() {
  return {
    status,
    progress,
    message,
    hardware,
    choice,
    docsCount,
    offlineReady,
    disclosure: computed(() => modelDisclosure(choice.value)),
    inspect,
    prepare,
    ask,
  }
}

/** Probe the phone and pick a model without downloading anything. */
export async function inspect(override?: ModelKey): Promise<ModelChoice> {
  status.value = 'probing'
  hardware.value = await probeHardware()
  choice.value = chooseGenerator(hardware.value, override)
  offlineReady.value = await cachedModelIds([EMBEDDING_MODEL.id, GENERATORS.small.id, GENERATORS.large.id])
  status.value = 'idle'
  return choice.value
}

/** Download (first time) + load models and vectorise the documents. Safe to call again. */
export async function prepare(override?: ModelKey): Promise<void> {
  try {
    const c = await inspect(override)
    void requestPersistentStorage() // keep downloaded models from being evicted before the demo
    status.value = 'downloading'
    message.value = '載入向量模型'
    await loadEmbedder(EMBEDDING_MODEL.id, EMBEDDING_MODEL.dtype, __onProgress)
    status.value = 'indexing'
    message.value = '建立向量索引'
    __chunks = await __indexChunks()
    docsCount.value = __chunks.length
    status.value = 'downloading'
    message.value = `載入 ${c.label}`
    try {
      if (c.key === 'none') await unloadGenerator()
      else await loadGenerator(c.id, c.device, c.dtype, __onProgress)
    } catch (err) {
      if (c.key !== 'large') throw err
      // 1B failed (out of memory, driver...) -> fall back to 350M
      const fb = chooseGenerator(hardware.value!, 'small')
      fb.reasons.unshift(`1B 載入失敗（${err instanceof Error ? err.message : err}），改用 350M`)
      choice.value = fb
      message.value = `載入 ${fb.label}`
      await loadGenerator(fb.id, fb.device, fb.dtype, __onProgress)
    }
    offlineReady.value = await cachedModelIds([EMBEDDING_MODEL.id, GENERATORS.small.id, GENERATORS.large.id])
    status.value = 'ready'
    message.value = ''
  } catch (err) {
    status.value = 'error'
    message.value = err instanceof Error ? err.message : String(err)
  }
}

/** Retrieve + answer. Works with only the embedder (extractive) if the LLM isn't loaded. */
export async function ask(question: string, onText?: (t: string) => void, k = 4): Promise<RagAnswer> {
  const t0 = performance.now()
  if (!__chunks.length) throw new Error('請先準備模型（prepare）')
  const [qv] = await embed([`query: ${question.trim()}`])
  const top = __topK(qv!, __chunks, k)
  const sources = __sourcesOf(top)
  const extractive = top[0] ? `「${top[0].chunk.title}」${top[0].chunk.text}` : '目前資料沒有提到。'
  const model = loadedGenerator()
  if (!model) {
    onText?.(extractive)
    return { answer: extractive, sources, mode: 'extractive', model: EMBEDDING_MODEL.id, ms: performance.now() - t0 }
  }
  const facts = top.map(({ chunk }) => `${chunk.title}：${chunk.text}`)
  const answer = await generate(__messages(question, facts), 120, onText)
  if (!isGrounded(answer, facts)) {
    return { answer: extractive, sources, mode: 'guarded', rejected: answer, model, ms: performance.now() - t0 }
  }
  return { answer, sources, mode: 'llm', model, ms: performance.now() - t0 }
}

/**
 * Grounding guard for small models. An answer is accepted only if it is mostly Chinese and at
 * least `minOverlap` of its 2-character pairs appear in the retrieved facts. Measured failure
 * modes it catches: English replies, invented facts, garbled characters.
 */
export function isGrounded(answer: string, facts: string[], minOverlap = 0.35): boolean {
  const cjk = answer.match(/[㐀-鿿]/g)?.length ?? 0
  const latin = answer.match(/[A-Za-z]/g)?.length ?? 0
  if (cjk < 4 || latin > cjk) return false
  const pairs = __cjkPairs(answer)
  if (!pairs.length) return false
  const context = new Set(facts.flatMap(__cjkPairs))
  return pairs.filter((p) => context.has(p)).length / pairs.length >= minOverlap
}

// ---------------------------------------------------------------- internals
/** One retrievable fact: a document's header, or one line of its text (one notice, the hours...). */
interface __Chunk {
  key: string
  docKey: string
  title: string
  subtitle?: string
  text: string
  to: RouteLocationRaw
  vec: number[]
}
type __Doc = { key: string; title: string; subtitle?: string; lines: string[]; to: RouteLocationRaw }

async function __indexChunks(): Promise<__Chunk[]> {
  const raw = (await __docsFromFeatures()).flatMap(__chunksOf)
  const cacheKey = `rag.vectors.${EMBEDDING_MODEL.id}`
  const cache = loadVectors(cacheKey)
  const id = (c: Omit<__Chunk, 'vec'>) => __hash(`${c.title}\n${c.text}`)
  const missing = raw.filter((c) => !cache[id(c)])
  for (let i = 0; i < missing.length; i += 16) {
    const batch = missing.slice(i, i + 16)
    const vecs = await embed(batch.map((c) => `passage: ${c.title}：${c.text}`))
    batch.forEach((c, j) => (cache[id(c)] = vecs[j]!.map((x) => Math.round(x * 1e4) / 1e4)))
    progress.value = Math.min(1, (i + batch.length) / missing.length)
  }
  saveVectors(cacheKey, cache)
  return raw.map((c) => ({ ...c, vec: cache[id(c)]! }))
}

function __chunksOf(d: __Doc): Omit<__Chunk, 'vec'>[] {
  const base = { docKey: d.key, title: d.title, subtitle: d.subtitle, to: d.to }
  const header = { ...base, key: `${d.key}#0`, text: [d.subtitle, ...d.lines.slice(0, 1)].filter(Boolean).join('；') }
  return [header, ...d.lines.map((line, i) => ({ ...base, key: `${d.key}#${i + 1}`, text: line }))]
}

async function __docsFromFeatures(): Promise<__Doc[]> {
  const docs: __Doc[] = []
  for (const f of features) {
    docs.push({ key: `f:${f.id}`, title: f.title, subtitle: f.description, lines: __featureLines(f), to: featureEntry(f) })
    const items: FeatureItem[] = await Promise.resolve(f.searchItems?.() ?? []).catch(() => [])
    for (const it of items) {
      const lines = [it.tags?.length ? `特色：${it.tags.join('、')}` : '', ...(it.text ?? '').split('\n')]
      docs.push({ key: `i:${f.id}:${it.id}`, title: it.title, subtitle: it.subtitle, lines: lines.filter(Boolean), to: it.to })
    }
  }
  return docs
}

function __featureLines(f: Feature): string[] {
  return f.keywords?.length ? [`相關：${f.keywords.join('、')}`] : []
}

function __topK(q: number[], chunks: __Chunk[], k: number): { chunk: __Chunk; score: number }[] {
  return chunks
    .map((chunk) => ({ chunk, score: __dot(q, chunk.vec) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, k)
}

/** Unique documents in rank order (several chunks may come from the same place). */
function __sourcesOf(top: { chunk: __Chunk; score: number }[]): RagSource[] {
  const seen = new Set<string>()
  const out: RagSource[] = []
  for (const { chunk, score } of top) {
    if (seen.has(chunk.docKey)) continue
    seen.add(chunk.docKey)
    out.push({ key: chunk.docKey, title: chunk.title, subtitle: chunk.subtitle, score, to: chunk.to })
  }
  return out
}

function __dot(a: number[], b: number[]): number {
  let s = 0
  for (let i = 0; i < a.length; i++) s += a[i]! * b[i]!
  return s
}

/**
 * Prompt format chosen by measurement (Granite 4.0 350M/1B, q4f16, WebGPU): the facts go straight
 * into a short Chinese user message. Granite's own `documents` RAG template (English system text)
 * made both sizes answer in English or ignore the facts.
 */
function __messages(question: string, facts: string[]): ChatMessage[] {
  const context = facts.map((f, i) => `[${i + 1}] ${f}`).join('\n')
  return [{ role: 'user', content: `根據以下資料回答問題，用繁體中文、一句話。\n資料：\n${context}\n問題：${question.trim()}` }]
}

function __cjkPairs(s: string): string[] {
  const out: string[] = []
  for (const run of s.match(/[㐀-鿿]+/g) ?? []) for (let i = 0; i < run.length - 1; i++) out.push(run.slice(i, i + 2))
  return out
}

function __hash(s: string): string {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return (h >>> 0).toString(36) + s.length.toString(36)
}

function __onProgress(p: { file: string; loaded: number; total: number }): void {
  progress.value = p.total ? p.loaded / p.total : 0
  message.value = `下載 ${p.file.split('/').at(-1)}（${Math.round(p.loaded / 2 ** 20)} / ${Math.round(p.total / 2 ** 20)} MB）`
}
