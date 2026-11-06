/**
 * ADD-ON: rag (optional, OFF by default). Public interface - import only from '@/addons/rag'.
 *
 * On-device RAG: vectorises what features already provide (descriptions + searchItems incl. `text`)
 * with multilingual-e5-small, retrieves the closest documents, and lets a local Granite 4.0 model
 * answer only from them. The generator is chosen from the phone's hardware:
 *   granite-4.0-1b   when WebGPU + fp16 + ≥8 GB memory + ≥8 cores + ≥2.6 GB free storage
 *   granite-4.0-350m with WebGPU otherwise; 1B load failure also falls back to 350M
 *   no LLM without WebGPU: on-device retrieval + extractive answer (CPU generation ~30 s/answer);
 *     override 'small' still runs 350M on the CPU
 * Nothing leaves the phone. First run downloads ~0.5-1.4 GB once; afterwards it works offline.
 *
 * The framework never imports this. Turn it on only after the team has written the test plan and
 * demo script (handbook: addons/rag). Enable by creating a feature that routes to the lab page:
 *
 *   // services/web/src/features/ai/index.ts
 *   import { Sparkles } from 'lucide-vue-next'
 *   import { defineFeature } from '@/framework'
 *   import { RagLabPage } from '@/addons/rag'
 *   export default defineFeature({ id: 'ai', code: 'AI', title: 'AI 問答（實驗）',
 *     description: '在手機上執行的小模型，只根據 App 內資料回答', icon: Sparkles,
 *     routes: [{ path: '', name: 'lab', component: RagLabPage }] })
 *
 * Or use useRag()/ask() from a feature's logic layer to build your own screen.
 */
export const ADDON_CODE = 'RG'

export {
  chooseGenerator,
  EMBEDDING_MODEL,
  GENERATORS,
  isGrounded,
  LARGE_MODEL_NEEDS,
  modelDisclosure,
  useRag,
} from './logic'
export type { GeneratorKey, HardwareProfile, ModelChoice, ModelKey, RagAnswer, RagSource } from './logic'

/** Lazy route component: the model runtime is only downloaded when this page opens. */
export const RagLabPage = () => import('./ui/RagLabPage.vue')
