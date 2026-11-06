/**
 * DATA LAYER - add-on rag: everything that touches the device or the model runtime.
 *   - hardware probe (WebGPU, memory, cores, free storage)
 *   - Transformers.js pipelines (embeddings + text generation), all ON DEVICE
 *   - vector cache in device storage
 * Models download once from huggingface.co and are stored in the Origin Private File System
 * (OPFS) through a custom cache: the browser Cache API rejected the 350 MB-1.2 GB weight files
 * ("Failed to execute 'put' on 'Cache'"), which silently broke offline use. Files are streamed
 * to `<name>.part` and renamed when complete, and persistent storage is requested so the browser
 * doesn't evict them. The ONNX Runtime wasm goes through the same cache (env.useWasmCache), so
 * after one online prefetch everything runs with Wi-Fi and mobile data off.
 */
import {
  env,
  pipeline,
  TextStreamer,
  type FeatureExtractionPipeline,
  type ProgressInfo,
  type TextGenerationPipeline,
} from '@huggingface/transformers'
import { readJson, writeJson } from '@/platform/storage'

env.allowLocalModels = false
// old WebViews have no OPFS - check at runtime even though the DOM types say it always exists
if (typeof navigator !== 'undefined' && typeof navigator.storage?.getDirectory === 'function') {
  env.useBrowserCache = false
  env.useCustomCache = true
  env.customCache = {
    match: (url: string) => __opfsMatch(url),
    put: (url: string, response: Response) => __opfsPut(url, response),
  }
} else {
  env.useBrowserCache = true // no OPFS (old WebView): fall back to Cache Storage
}

/** Ask the browser not to evict our model files (best effort; may need user engagement). */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    return (await navigator.storage?.persist?.()) ?? false
  } catch {
    return false
  }
}

export interface HardwareProfile {
  webgpu: boolean
  /** WebGPU adapter supports 16-bit floats (needed for q4f16 weights) */
  shaderF16: boolean
  maxBufferMB: number
  /** navigator.deviceMemory - Chromium only, rounded and capped at 8; null when unknown */
  memoryGB: number | null
  cores: number
  /** free browser storage quota; null when unknown */
  freeStorageMB: number | null
  gpuName: string
}

export type Device = 'webgpu' | 'wasm'
export type Dtype = 'q4f16' | 'q4' | 'q8'
export type Progress = (p: { file: string; loaded: number; total: number }) => void
export type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string }

export async function probeHardware(): Promise<HardwareProfile> {
  const nav = navigator as Navigator & { deviceMemory?: number; gpu?: GpuLike }
  const hw: HardwareProfile = {
    webgpu: false,
    shaderF16: false,
    maxBufferMB: 0,
    memoryGB: typeof nav.deviceMemory === 'number' ? nav.deviceMemory : null,
    cores: nav.hardwareConcurrency || 1,
    freeStorageMB: null,
    gpuName: '',
  }
  try {
    const adapter = await nav.gpu?.requestAdapter({ powerPreference: 'high-performance' })
    if (adapter) {
      hw.webgpu = true
      hw.shaderF16 = adapter.features.has('shader-f16')
      hw.maxBufferMB = Math.round(adapter.limits.maxBufferSize / 2 ** 20)
      hw.gpuName = [adapter.info?.vendor, adapter.info?.architecture].filter(Boolean).join(' ')
    }
  } catch {
    /* no WebGPU in this WebView */
  }
  try {
    const est = await navigator.storage?.estimate()
    if (est?.quota !== undefined) hw.freeStorageMB = Math.round((est.quota - (est.usage ?? 0)) / 2 ** 20)
  } catch {
    /* storage estimate unavailable */
  }
  return hw
}

// ---------------------------------------------------------------- embeddings
let __embedder: FeatureExtractionPipeline | null = null
let __embedderId = ''

export async function loadEmbedder(modelId: string, dtype: Dtype, onProgress?: Progress): Promise<void> {
  if (__embedder && __embedderId === modelId) return
  __embedder = (await pipeline('feature-extraction', modelId, {
    device: 'wasm', // small model: CPU is fast enough and works on every phone
    dtype,
    progress_callback: __progressAdapter(onProgress),
  })) as FeatureExtractionPipeline
  __embedderId = modelId
}

/** Mean-pooled, L2-normalised vectors (so cosine similarity = dot product). */
export async function embed(texts: string[]): Promise<number[][]> {
  if (!__embedder) throw new Error('embedder not loaded')
  const out = await __embedder(texts, { pooling: 'mean', normalize: true })
  return out.tolist() as number[][]
}

// ---------------------------------------------------------------- generation
let __generator: TextGenerationPipeline | null = null
let __generatorId = ''

export async function loadGenerator(modelId: string, device: Device, dtype: Dtype, onProgress?: Progress): Promise<void> {
  if (__generator && __generatorId === modelId) return
  await unloadGenerator()
  __generator = (await pipeline('text-generation', modelId, {
    device,
    dtype,
    progress_callback: __progressAdapter(onProgress),
  })) as TextGenerationPipeline
  __generatorId = modelId
}

export async function unloadGenerator(): Promise<void> {
  try {
    await __generator?.dispose()
  } catch {
    /* already gone */
  }
  __generator = null
  __generatorId = ''
}

export const loadedGenerator = (): string => __generatorId

/**
 * Greedy decoding, streamed token by token through onText. Returns the full answer.
 * `documents` go through the model's own chat template (Granite 4 has native RAG support:
 * it adds a "answer strictly from these documents" system block), which grounds small models
 * much better than pasting the context into the user message.
 */
export async function generate(
  messages: ChatMessage[],
  maxNewTokens: number,
  onText?: (t: string) => void,
  documents?: Record<string, string>[],
): Promise<string> {
  if (!__generator) throw new Error('generator not loaded')
  const tokenizer = __generator.tokenizer
  const prompt = tokenizer.apply_chat_template(messages, {
    tokenize: false,
    add_generation_prompt: true,
    documents: documents ?? null,
  }) as string
  console.debug('[rag-debug-prompt]', prompt)
  const streamer = onText
    ? new TextStreamer(tokenizer, { skip_prompt: true, skip_special_tokens: true, callback_function: onText })
    : undefined
  const out = (await __generator(prompt, {
    max_new_tokens: maxNewTokens,
    do_sample: false,
    // NO repetition penalty: it also penalises tokens of the prompt, i.e. exactly the facts a
    // RAG answer must copy - with 1.1 both Granite sizes drifted into ungrounded English.
    repetition_penalty: 1.0,
    return_full_text: false,
    add_special_tokens: false, // the template already added them
    streamer,
  })) as { generated_text: string }[]
  return (out[0]?.generated_text ?? '').trim()
}

// ---------------------------------------------------------------- caches
/** Model ids whose weight files are fully stored on the device (i.e. usable offline). */
export async function cachedModelIds(candidates: string[]): Promise<string[]> {
  try {
    const names: string[] = []
    const dir = await __modelDir()
    for await (const [name, handle] of (dir as unknown as { entries(): AsyncIterable<[string, FileSystemHandle]> }).entries()) {
      if (handle.kind === 'file' && !name.endsWith('.part')) names.push(name)
    }
    // a model counts as offline-ready only when its weights (.onnx_data or a whole .onnx) are there
    return candidates.filter((id) => {
      const key = __fileName(`/${id}/resolve/`)
      return names.some((n) => n.includes(key) && /onnx(_data)?$/.test(n))
    })
  } catch {
    return []
  }
}

export const loadVectors = (key: string): Record<string, number[]> => readJson(key, {})
export const saveVectors = (key: string, v: Record<string, number[]>): void => writeJson(key, v)

// ---------------------------------------------------------------- internals
type GpuLike = {
  requestAdapter(o?: { powerPreference?: string }): Promise<{
    features: Set<string>
    limits: { maxBufferSize: number }
    info?: { vendor?: string; architecture?: string }
  } | null>
}

async function __modelDir(): Promise<FileSystemDirectoryHandle> {
  const root = await navigator.storage.getDirectory()
  return root.getDirectoryHandle('townpass-models', { create: true })
}

/** URL -> safe flat file name, e.g. huggingface.co/<org>/<model>/resolve/main/onnx/x.onnx_data */
function __fileName(url: string): string {
  return url.replace(/^https?:\/\//, '').replace(/[^a-zA-Z0-9._-]+/g, '~')
}

async function __opfsMatch(url: string): Promise<Response | undefined> {
  try {
    const handle = await (await __modelDir()).getFileHandle(__fileName(url))
    const file = await handle.getFile()
    if (!file.size) return undefined
    return new Response(file, { headers: { 'content-length': String(file.size) } })
  } catch {
    return undefined // not stored yet
  }
}

async function __opfsPut(url: string, response: Response): Promise<void> {
  const dir = await __modelDir()
  const name = __fileName(url)
  const part = await dir.getFileHandle(`${name}.part`, { create: true })
  const writable = await part.createWritable()
  if (response.body) await response.body.pipeTo(writable) // streams to disk, closes the writable
  else {
    await writable.write(await response.arrayBuffer())
    await writable.close()
  }
  // rename only when complete, so a half-written file is never mistaken for a model
  const movable = part as FileSystemFileHandle & { move?: (name: string) => Promise<void> }
  if (movable.move) await movable.move(name)
  else {
    const final = await dir.getFileHandle(name, { create: true })
    const w = await final.createWritable()
    await w.write(await part.getFile())
    await w.close()
    await dir.removeEntry(`${name}.part`)
  }
}

function __progressAdapter(onProgress?: Progress) {
  return (p: ProgressInfo) => {
    if (onProgress && p.status === 'progress') onProgress({ file: p.file, loaded: p.loaded, total: p.total })
  }
}
