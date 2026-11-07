<script setup lang="ts">
/** @component MR-C35 SupplierApplyForm — 申請成為提供者：單位名稱、類型（MR-C92）、位置與地址（MR-C93）、店面照片（MR-C06，選填，個人不顯示）→ applySupplier */
/**
 * 設計 v2（docs/meal-relay/design-v2/README.md §3.4，03 左）：
 *   標語＋MR-C62 MascotBadge、A04 單位名稱、MR-C92 OrgTypePicker、MR-C93 ApplyLocationField、
 *   店面照片（ADR-029）、MR-C64 InfoNote「審核通過後，就能上架食物」、MR-C10「送出申請」、連結「已申請？查看審核狀態」。
 * 一般市民（citizen）用；表單狀態在 logic/supplier.ts 的 useSupplierPage()（applyForm），這裡只綁欄位、發 emit。
 * 送出鍵在必填欄位都填好前停用（D4），離線時也停用（ADR-024）。
 * 店面照片（ADR-029）：選了類型、而且不是「個人」才顯示；只拍招牌或店門口，不能有人臉、車牌、個資。
 */
import { computed } from 'vue'
import { Camera, ChevronRight } from 'lucide-vue-next'
import { BaseInput } from '@/ui'
import { STOREFRONT_PHOTO_RULE, showsStorefrontPhoto } from '../logic/placePhoto'
import { buildSupplierApply, setFormImage, type ApplyForm } from '../logic/supplier'
import Accordion from './Accordion.vue'
import ApplyLocationField from './ApplyLocationField.vue'
import ImageInput from './ImageInput.vue'
import InfoNote from './InfoNote.vue'
import MascotBadge from './MascotBadge.vue'
import OrgTypePicker from './OrgTypePicker.vue'
import SubmitButton from './SubmitButton.vue'

const props = defineProps<{ form: ApplyForm; saving?: boolean; offline?: boolean; error?: string; checking?: boolean }>()
const emit = defineEmits<{ submit: []; recheck: [] }>()

const built = computed(() => buildSupplierApply(props.form))
const addressError = computed(() => (built.value.ok ? '' : (built.value.errors.address ?? '')))
</script>

<template>
  <form class="flex flex-col gap-3.5" aria-label="申請成為提供者" @submit.prevent="emit('submit')">
    <div class="flex items-center justify-between gap-2">
      <h2 class="mr-display min-w-0 text-2xl leading-tight font-extrabold text-primary-800">
        讓多出來的一份，<br />成為一份照顧
        <span class="mx-auto mt-2 block h-2 w-20 rotate-[-4deg] rounded-[100%] border-t-[3px] border-secondary-500" aria-hidden="true"></span>
      </h2>
      <MascotBadge class="shrink-0" :size="104" glow />
    </div>

    <BaseInput v-model="form.name" class="[&_label]:font-bold [&_label]:text-grey-900 [&_input]:border-grey-300" label="單位名稱" placeholder="例：萬華好味便當" />
    <OrgTypePicker v-model="form.org_type" />
    <ApplyLocationField
      v-model="form.location"
      v-model:address="form.address"
      :show-address="form.org_type !== 'person'"
      :address-error="addressError"
    />

    <Accordion v-if="showsStorefrontPhoto(form.org_type)" title="店面照片（選填）" :icon="Camera">
      <p class="mb-2 text-sm text-grey-500">管理員審核時看得到，志工也比較放心。{{ STOREFRONT_PHOTO_RULE }}。</p>
      <ImageInput
        label="拍招牌或店門口"
        :preview-url="form.image_preview"
        :disabled="saving"
        @change="setFormImage(form, $event)"
        @clear="setFormImage(form, null)"
      />
    </Accordion>

    <InfoNote text="審核通過後，就能上架食物" />
    <p v-if="error" class="text-sm text-warn-200" role="alert">{{ error }}</p>
    <SubmitButton class="min-h-12 text-xl font-bold enabled:bg-primary-600 enabled:hover:bg-primary-700" :loading="saving" :disabled="!built.ok || offline">送出申請</SubmitButton>
    <button
      type="button"
      class="press mx-auto -mt-2 flex min-h-11 items-center gap-0.5 px-2 text-sm font-semibold text-primary-700 disabled:text-grey-400"
      :disabled="checking"
      @click="emit('recheck')"
    >
      已申請？查看審核狀態<ChevronRight class="h-4 w-4" aria-hidden="true" />
    </button>
  </form>
</template>
