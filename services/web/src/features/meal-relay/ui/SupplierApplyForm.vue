<script setup lang="ts">
/** @component MR-C35 SupplierApplyForm — 申請成為提供者：單位名稱、類型、位置（MR-C02）、店面照片（MR-C06，選填，個人不顯示）→ applySupplier */
/**
 * 一般市民（citizen）用；放在 MR-C18 SupplierGate 的 #apply 插槽。
 * 表單狀態在 logic/supplier.ts 的 useSupplierPage()（applyForm），這裡只綁欄位、發 submit。
 * 送出鍵在必填欄位都填好前停用（D4），離線時也停用（ADR-024）。
 * 店面照片（ADR-029）：選了類型、而且不是「個人」才顯示；只拍招牌或店門口，不能有人臉、車牌、個資。
 */
import { computed } from 'vue'
import { BaseChip, BaseInput, SectionTitle } from '@/ui'
import { STOREFRONT_PHOTO_RULE, showsStorefrontPhoto } from '../logic/placePhoto'
import { ORG_TYPES, ORG_TYPE_LABEL, buildSupplierApply, setFormImage, type ApplyForm } from '../logic/supplier'
import ImageInput from './ImageInput.vue'
import LocationPicker from './LocationPicker.vue'
import SubmitButton from './SubmitButton.vue'

const props = defineProps<{ form: ApplyForm; saving?: boolean; offline?: boolean; error?: string }>()
const emit = defineEmits<{ submit: [] }>()

const ready = computed(() => buildSupplierApply(props.form).ok)
</script>

<template>
  <form class="flex flex-col gap-4" @submit.prevent="emit('submit')">
    <SectionTitle title="申請成為提供者" />
    <p class="text-sm text-grey-600">店家、學校、機關或個人都可以申請；管理員審核通過後就能上架多出來的食物。</p>

    <BaseInput v-model="form.name" label="單位名稱" placeholder="例：萬華好味便當" />

    <fieldset>
      <legend class="mb-2 text-sm font-medium text-grey-700">類型</legend>
      <div class="flex flex-wrap gap-2">
        <BaseChip v-for="t in ORG_TYPES" :key="t" :active="form.org_type === t" @click="form.org_type = t">
          {{ ORG_TYPE_LABEL[t] }}
        </BaseChip>
      </div>
    </fieldset>

    <div>
      <p class="mb-2 text-sm font-medium text-grey-700">位置</p>
      <LocationPicker v-model="form.location" label="在地圖上點一下單位的位置" />
    </div>

    <div v-if="showsStorefrontPhoto(form.org_type)">
      <p class="mb-1.5 text-sm font-medium text-grey-700">店面照片（選填）</p>
      <p class="mb-2 text-sm text-grey-500">管理員審核時看得到，志工也比較放心。{{ STOREFRONT_PHOTO_RULE }}。</p>
      <ImageInput
        label="拍招牌或店門口"
        :preview-url="form.image_preview"
        :disabled="saving"
        @change="setFormImage(form, $event)"
        @clear="setFormImage(form, null)"
      />
    </div>

    <p v-if="error" class="text-sm text-warn-200" role="alert">{{ error }}</p>
    <SubmitButton :loading="saving" :disabled="!ready || offline">送出申請</SubmitButton>
  </form>
</template>
