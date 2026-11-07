<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ArrowRight, Check, CheckCircle2, ChevronRight, FileImage, FileText, LoaderCircle, RefreshCcw, Search, ShieldAlert, Trash2, Upload } from 'lucide-vue-next'
import PageHeader from '@/components/PageHeader.vue'
import BaseBadge from '@/components/BaseBadge.vue'
import BaseModal from '@/components/BaseModal.vue'
import EmptyState from '@/components/EmptyState.vue'
import { useDemoStore } from '@/stores/demo'
import { useUiStore } from '@/stores/ui'
import { formatFileSize, formatTime, isValidDateString, matterTypeLabels } from '@/shared/ui/format'
import { useToast } from '@/shared/ui/useToast'
import type { DocumentType, ExtractedField, MatterType, RecognitionFieldKey } from '@/types'
import { emptyRecognition, recognitionToFields, suggestedMatterType } from './recognitionRules'
import { calculateFileHash, getExtractedText, releaseMaterialFile, runMaterialRecognition } from './recognitionRunner'

const route = useRoute()
const router = useRouter()
const store = useDemoStore()
const ui = useUiStore()
const { notify } = useToast()
const query = ref('')
const status = ref<'all' | 'processing' | 'awaiting_confirmation' | 'ready' | 'error'>('all')
const selectedId = ref(String(route.query.material ?? store.materials[0]?.id ?? ''))
const editableFields = ref<ExtractedField[]>([])
const matterType = ref<MatterType>('purchase')
const documentType = ref<DocumentType>('其他')
const currency = ref<'CNY' | 'USD' | 'HKD' | ''>('')
const subscriptionCategory = ref('其他')
const confirmError = ref('')
const saving = ref(false)
const deleteOpen = ref(false)
const clearOpen = ref(false)
const replaceInput = ref<HTMLInputElement>()
const textPreview = ref('')
const filtered = computed(() => store.materials.filter((item) => item.name.toLowerCase().includes(query.value.trim().toLowerCase()) && (status.value === 'all' || item.status === status.value)))
const visibleFields = computed(() => editableFields.value.filter((field) => field.key !== 'billing_cycle' || matterType.value === 'subscription'))
const selected = computed(() => store.materials.find((item) => item.id === selectedId.value))
const statusLabels = { processing: '识别中', awaiting_confirmation: '待确认', ready: '已确认', error: '需手工处理' }
const engineLabels = { 'pdf-text': 'PDF 文本层', 'browser-ocr': '浏览器 OCR', 'pdf-ocr': 'PDF 扫描页 OCR', manual: '手工录入', demo: '预置样例' }
watch(() => route.query.material, (value) => {
  const id = String(value ?? '')
  if (id && store.materials.some((item) => item.id === id)) selectedId.value = id
})
watch(() => [selected.value?.id, selected.value?.recognition, selected.value?.status] as const, () => {
  const material = selected.value
  editableFields.value = material ? material.fields.map((field) => ({ ...field })) : []
  documentType.value = material?.recognition?.document_type ?? '其他'
  currency.value = material?.recognition?.currency ?? ''
  matterType.value = material?.recognition ? suggestedMatterType(material.recognition) : 'purchase'
  ensureSubscriptionFields()
  textPreview.value = material ? getExtractedText(material.id) : ''
  confirmError.value = ''
}, { immediate: true })
watch(matterType, ensureSubscriptionFields)
watch(() => store.materials.map((item) => item.id), () => {
  if (!store.materials.some((item) => item.id === selectedId.value)) selectedId.value = store.materials[0]?.id ?? ''
})
function selectMaterial(id: string) {
  selectedId.value = id
  router.replace({ query: { ...route.query, material: id } })
}
function ensureSubscriptionFields() {
  if (matterType.value !== 'subscription') return
  const existing = new Map(editableFields.value.map((field) => [field.key, field]))
  editableFields.value = recognitionToFields(selected.value?.recognition ?? emptyRecognition()).map((field) => existing.get(field.key) ?? field)
}
function startManual() {
  editableFields.value = recognitionToFields(emptyRecognition())
  documentType.value = '其他'
  currency.value = ''
  confirmError.value = ''
}
function validateFields() {
  const value = (key: ExtractedField['key']) => editableFields.value.find((field) => field.key === key)?.value.trim() ?? ''
  if (!value('title')) return '请填写事项名称'
  if (value('amount') && !/^\d+(\.\d{1,2})?$/.test(value('amount'))) return '金额需为非负数字，最多两位小数'
  if (value('amount') && !Number.isSafeInteger(Math.round(Number(value('amount')) * 100))) return '金额超出可处理范围'
  if (value('amount') && !currency.value) return '请选择金额对应的货币单位'
  if (matterType.value === 'subscription') {
    if (!value('amount')) return '请确认订阅每次扣款金额'
    if (!value('renewal_date')) return '请确认下次续费日期'
    if (!['monthly', 'quarterly', 'yearly'].includes(value('billing_cycle'))) return '材料未明确续费周期，请人工选择月付、季付或年付'
    if (!subscriptionCategory.value.trim()) return '请填写订阅分类'
  }
  for (const key of ['purchase_date', 'effective_date', 'expiry_date', 'renewal_date', 'dueDate'] as const) {
    if (value(key) && !isValidDateString(value(key))) return '请检查日期是否为真实日历日期'
  }
  return ''
}
async function confirmMaterial() {
  if (!selected.value || selected.value.status === 'processing') return
  confirmError.value = validateFields()
  if (confirmError.value) return
  saving.value = true
  try {
    const materialId = selected.value.id
    const matter = store.confirmMaterial(materialId, editableFields.value, matterType.value, currency.value || 'CNY', documentType.value, subscriptionCategory.value)
    const subscription = matterType.value === 'subscription' ? store.subscriptions.find((item) => item.materialId === materialId) : undefined
    notify(subscription ? '字段已确认并生成订阅' : '字段已确认并生成事项', 'success', subscription ? '续费预测、趋势和期限雷达已同步更新。' : matter.dueDate ? '期限雷达和统计已同步更新。' : '事项已保存，但未生成未确认的期限。')
    await router.push(subscription ? `/subscriptions/${subscription.id}` : `/matters/${matter.id}`)
  } catch (error) {
    confirmError.value = error instanceof Error ? error.message : '确认失败，请检查后重试'
  } finally { saving.value = false }
}
async function recognizeAgain() {
  if (!selected.value || selected.value.status === 'processing') return
  const success = await runMaterialRecognition(selected.value.id)
  if (success) notify('重新识别完成', 'success', '请重新核对候选字段，原结果已被替换。')
}
async function replaceFile(file?: File) {
  if (!file || !selected.value) return
  if (file.size === 0 || file.size > 15 * 1024 * 1024) { confirmError.value = '请选择非空且不超过 15 MB 的文件'; return }
  const hash = await calculateFileHash(file)
  if (store.materials.some((item) => item.id !== selected.value?.id && item.hash === hash)) { confirmError.value = '这份文件已存在于另一条材料记录中'; return }
  const material = selected.value
  if (material.previewUrl?.startsWith('blob:')) URL.revokeObjectURL(material.previewUrl)
  material.name = file.name
  material.size = file.size
  material.mimeType = file.type
  material.hash = hash
  material.previewUrl = URL.createObjectURL(file)
  confirmError.value = ''
  await runMaterialRecognition(material.id, file)
  if (replaceInput.value) replaceInput.value.value = ''
}
function clearResult() {
  if (!selected.value) return
  store.clearRecognition(selected.value.id)
  editableFields.value = recognitionToFields(emptyRecognition())
  clearOpen.value = false
  notify('识别结果已清除', 'success', '原始文件仍保留，可手工录入或重新识别。')
}
function removeMaterial() {
  if (!selected.value) return
  releaseMaterialFile(selected.value.id)
  store.removeMaterial(selected.value.id)
  deleteOpen.value = false
  router.replace({ query: {} })
  notify('材料与识别记录已删除')
}
function isDateField(key: ExtractedField['key']) {
  return key.endsWith('_date') || key === 'dueDate'
}
function needsConfirmation(key: ExtractedField['key']) {
  return selected.value?.recognition?.need_confirmation.includes(key as RecognitionFieldKey) ?? false
}
function markEdited(field: ExtractedField) {
  field.confidence = null
  field.evidence = '已由你修改，确认后以填写值为准'
}
</script>

<template>
  <div>
    <PageHeader eyebrow="智能材料中心" title="本地识别，确认后才成为事项" description="优先读取 PDF 文本层，图片与扫描页在浏览器内 OCR。候选字段可修改、删除和重新识别，不会为填满结果而猜测。">
      <button class="btn-primary" @click="ui.uploadOpen = true"><Upload :size="16" />上传材料</button>
    </PageHeader>

    <div class="grid items-start gap-5 xl:grid-cols-[360px_minmax(0,1fr)]">
      <section class="card overflow-hidden" aria-label="材料列表">
        <div class="space-y-3 border-b border-line p-4"><label class="relative block"><span class="sr-only">搜索材料</span><Search :size="16" class="absolute left-3 top-3.5 text-muted" /><input v-model="query" class="input pl-9" placeholder="搜索文件名" /></label><div class="flex items-center justify-between gap-3"><select v-model="status" class="input min-h-9 py-1.5" aria-label="材料状态"><option value="all">全部状态</option><option value="processing">识别中</option><option value="awaiting_confirmation">待确认</option><option value="ready">已确认</option><option value="error">需手工处理</option></select><span class="shrink-0 text-xs text-muted">{{ filtered.length }} 份</span></div></div>
        <div v-if="filtered.length" class="max-h-[680px] divide-y divide-line overflow-y-auto scrollbar-thin"><button v-for="item in filtered" :key="item.id" :class="['flex w-full items-center gap-3 px-4 py-4 text-left transition-colors', selected?.id === item.id ? 'bg-indigo-50/70' : 'hover:bg-slate-50']" @click="selectMaterial(item.id)"><span :class="['flex size-10 shrink-0 items-center justify-center rounded-[10px]', item.status === 'ready' ? 'bg-emerald-50 text-success' : item.status === 'error' ? 'bg-red-50 text-danger' : 'bg-indigo-50 text-brand']"><LoaderCircle v-if="item.status === 'processing'" :size="19" class="animate-spin" /><component :is="item.mimeType === 'application/pdf' ? FileText : FileImage" v-else :size="19" /></span><span class="min-w-0 flex-1"><span class="block truncate text-sm font-semibold text-ink">{{ item.name }}</span><span class="mt-1 block text-[11px] text-muted">{{ formatFileSize(item.size) }} · {{ formatTime(item.uploadedAt) }}</span><BaseBadge class="mt-2" :label="statusLabels[item.status]" :tone="item.status === 'ready' ? 'success' : item.status === 'error' ? 'danger' : item.status === 'processing' ? 'brand' : 'warning'" /></span><ChevronRight :size="15" class="shrink-0 text-slate-400" /></button></div>
        <EmptyState v-else :title="store.materials.length ? '没有匹配的材料' : '还没有材料'" :description="store.materials.length ? '尝试更换文件名或状态筛选。' : '上传图片或 PDF，本地解析后再确认候选字段。'"><button v-if="store.materials.length" class="btn-secondary" @click="query = ''; status = 'all'">清除筛选</button><button v-else class="btn-primary" @click="ui.uploadOpen = true"><Upload :size="16" />上传材料</button></EmptyState>
      </section>

      <section v-if="selected" class="card overflow-hidden" aria-labelledby="material-title">
        <div class="flex flex-col gap-3 border-b border-line px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6"><div class="min-w-0"><div class="flex flex-wrap items-center gap-2"><BaseBadge :label="selected.source === 'demo' ? '预置识别样例' : '本地材料'" :tone="selected.source === 'demo' ? 'brand' : 'neutral'" /><BaseBadge :label="statusLabels[selected.status]" :tone="selected.status === 'ready' ? 'success' : selected.status === 'error' ? 'danger' : selected.status === 'processing' ? 'brand' : 'warning'" /><BaseBadge v-if="selected.recognitionEngine" :label="engineLabels[selected.recognitionEngine]" /></div><h2 id="material-title" class="mt-2 truncate text-base font-semibold text-ink">{{ selected.name }}</h2></div><button class="btn-ghost shrink-0 text-danger hover:bg-red-50" @click="deleteOpen = true"><Trash2 :size="15" />删除材料与记录</button></div>
        <div v-if="selected.status === 'processing'" class="border-b border-line bg-indigo-50/60 px-5 py-4 sm:px-6" aria-live="polite"><div class="flex items-center justify-between gap-3 text-xs"><span class="font-medium text-ink">{{ selected.recognitionStage }}</span><span class="numeric text-brand">{{ selected.recognitionProgress ?? 0 }}%</span></div><div class="mt-2 h-2 overflow-hidden rounded-full bg-white"><div class="h-full rounded-full bg-brand transition-all" :style="{ width: `${selected.recognitionProgress ?? 0}%` }" /></div><p class="mt-2 text-xs text-muted">首次 OCR 需要下载语言数据，耗时取决于文件页数与设备性能。你可以离开此页，任务会在当前会话继续。</p></div>
        <div v-if="selected.status === 'error'" class="flex flex-col gap-3 border-b border-red-100 bg-red-50 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6" role="alert"><p class="text-xs leading-5 text-danger">{{ selected.message }}</p><button class="btn-secondary shrink-0" @click="startManual">手工录入</button></div>

        <div class="grid min-[1100px]:grid-cols-2">
          <div class="border-b border-line p-5 min-[1100px]:border-b-0 min-[1100px]:border-r sm:p-6"><h3 class="text-sm font-semibold text-ink">材料预览</h3><div class="mt-4 flex min-h-[330px] items-center justify-center overflow-hidden rounded-xl border border-line bg-slate-100"><img v-if="selected.previewUrl && selected.mimeType.startsWith('image/')" :src="selected.previewUrl" :alt="selected.name" class="max-h-[540px] w-full object-contain" /><iframe v-else-if="selected.previewUrl && selected.mimeType === 'application/pdf'" :src="selected.previewUrl" :title="`${selected.name}预览`" class="h-[540px] w-full" /><div v-else class="px-6 py-10 text-center"><span class="mx-auto flex size-12 items-center justify-center rounded-xl bg-white text-brand"><component :is="selected.mimeType === 'application/pdf' ? FileText : FileImage" :size="22" /></span><p class="mt-4 text-sm font-semibold text-ink">{{ selected.source === 'demo' ? '演示样例不包含原始文件' : '本地预览已失效' }}</p><p class="mt-2 text-xs leading-5 text-muted">{{ selected.source === 'demo' ? '下方为明确标注的预置识别字段，用于体验确认流程。' : '刷新后浏览器不会保留原始文件。已确认字段仍保留，重新识别前请重新选择文件。' }}</p></div></div><div class="mt-4 rounded-xl bg-canvas p-4"><div class="flex gap-2"><ShieldAlert :size="16" class="mt-0.5 shrink-0 text-warning" /><p class="text-xs leading-5 text-muted">{{ selected.message || '文件仅用于本次本地演示，未上传到服务器。请勿在公开设备上处理私人材料。' }}</p></div><p v-if="selected.extractionNote" class="mt-2 text-xs leading-5 text-muted">{{ selected.extractionNote }}</p><p v-if="selected.hash" class="numeric mt-3 break-all text-[10px] text-slate-400">SHA-256 · {{ selected.hash }}</p></div><details v-if="textPreview" class="mt-4 rounded-xl border border-line p-4"><summary class="cursor-pointer text-xs font-semibold text-ink">查看本次提取文本</summary><pre class="numeric mt-3 max-h-56 overflow-auto whitespace-pre-wrap break-words text-[11px] leading-5 text-muted scrollbar-thin">{{ textPreview }}</pre><p class="mt-2 text-[11px] text-muted">原文仅保留在当前内存会话，不写入 localStorage 或导出文件。</p></details></div>

          <div class="p-5 sm:p-6"><div class="flex items-center justify-between gap-3"><h3 class="text-sm font-semibold text-ink">结构化候选记录</h3><span class="text-xs text-muted">{{ selected.status === 'ready' ? '已由你确认' : '空字段不会被自动补造' }}</span></div><div class="mt-4 grid gap-3 sm:grid-cols-3"><label><span class="label">材料类型<BaseBadge v-if="selected.recognition?.need_confirmation.includes('document_type')" class="ml-2" label="待确认" tone="warning" /><span v-else-if="selected.recognition?.confidence.document_type !== undefined" class="ml-2 text-[11px] font-normal text-muted">可信度 {{ selected.recognition?.confidence.document_type }}%</span></span><select v-model="documentType" class="input" :disabled="selected.status === 'ready' || selected.status === 'processing'"><option value="订单">订单</option><option value="保修">保修</option><option value="订阅">订阅</option><option value="合同">合同</option><option value="其他">其他</option></select></label><label><span class="label">事项类型</span><select v-model="matterType" class="input" :disabled="selected.status === 'ready' || selected.status === 'processing'"><option v-for="(label, key) in matterTypeLabels" :key="key" :value="key">{{ label }}</option></select></label><label><span class="label">货币单位</span><select v-model="currency" class="input" :disabled="selected.status === 'ready' || selected.status === 'processing'"><option value="">待确认</option><option value="CNY">CNY · 人民币</option><option value="USD">USD · 美元</option><option value="HKD">HKD · 港币</option></select></label><label v-if="matterType === 'subscription'" class="sm:col-span-3"><span class="label">订阅分类</span><input v-model="subscriptionCategory" class="input" list="material-subscription-categories" placeholder="例如：影音娱乐、效率工具" :disabled="selected.status === 'ready' || selected.status === 'processing'" /><datalist id="material-subscription-categories"><option value="影音娱乐" /><option value="效率工具" /><option value="创意工具" /><option value="运动健康" /><option value="教育学习" /><option value="生活服务" /><option value="其他" /></datalist></label></div>
            <form v-if="editableFields.length" id="material-fields-form" class="mt-4 space-y-4" @submit.prevent="confirmMaterial"><label v-for="field in visibleFields" :key="field.key" class="block"><span class="label">{{ field.label }}<BaseBadge v-if="needsConfirmation(field.key)" class="ml-2" label="待确认" tone="warning" /><span v-else-if="field.confidence !== null" class="ml-2 text-[11px] font-normal text-muted">可信度 {{ field.confidence }}%</span></span><select v-if="field.key === 'billing_cycle'" v-model="field.value" class="input" :disabled="selected.status === 'ready' || selected.status === 'processing'" @change="markEdited(field)"><option value="">待确认，不猜测</option><option value="monthly">月付</option><option value="quarterly">季付</option><option value="yearly">年付</option></select><textarea v-else-if="field.key === 'description'" v-model="field.value" class="input min-h-20 resize-y" @input="markEdited(field)" :readonly="selected.status === 'ready'" :disabled="selected.status === 'processing'" /><input v-else v-model="field.value" class="input" :type="isDateField(field.key) ? 'date' : 'text'" @input="markEdited(field)" :inputmode="field.key === 'amount' ? 'decimal' : undefined" :readonly="selected.status === 'ready'" :disabled="selected.status === 'processing'" /><span class="mt-1.5 block text-xs leading-5 text-muted">依据：{{ field.evidence || '未提供证据，请人工核对' }}</span></label><p v-if="confirmError" class="field-error" role="alert">{{ confirmError }}</p></form>
            <div v-else class="mt-5 rounded-xl border border-dashed border-slate-300 p-5 text-center"><p class="text-sm font-medium text-ink">暂无识别字段</p><p class="mt-1 text-xs leading-5 text-muted">可重新运行本地识别，或直接手工录入。</p><button class="btn-secondary mt-4" :disabled="selected.status === 'processing'" @click="startManual">手工录入</button></div>
            <p v-if="confirmError && !editableFields.length" class="field-error mt-3" role="alert">{{ confirmError }}</p>
            <div class="mt-5 flex flex-wrap gap-2 border-t border-line pt-5"><button class="btn-secondary" :disabled="selected.status === 'processing'" @click="recognizeAgain"><RefreshCcw :size="15" />重新识别</button><button class="btn-secondary" :disabled="selected.status === 'processing'" @click="replaceInput?.click()"><Upload :size="15" />重选文件</button><button class="btn-ghost text-danger" :disabled="selected.status === 'processing' || (!selected.recognition && !editableFields.length)" @click="clearOpen = true"><Trash2 :size="15" />清除识别结果</button></div><input ref="replaceInput" type="file" class="hidden" accept="image/jpeg,image/png,image/webp,application/pdf" @change="replaceFile(($event.target as HTMLInputElement).files?.[0])" />
            <div v-if="selected.status !== 'ready'" class="mt-4 flex justify-end"><button class="btn-primary" type="submit" form="material-fields-form" :disabled="saving || selected.status === 'processing' || !editableFields.length"><CheckCircle2 :size="16" />{{ saving ? '正在确认…' : matterType === 'subscription' ? '确认字段并生成订阅' : '确认字段并生成事项' }}</button></div><div v-else class="mt-5 rounded-xl border border-emerald-100 bg-emerald-50 p-4"><p class="flex items-center gap-2 text-sm font-semibold text-success"><Check :size="16" />确认记录已保存</p><RouterLink to="/radar" class="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-success">前往期限雷达<ArrowRight :size="14" /></RouterLink></div>
          </div>
        </div>
      </section>
      <div v-else class="card"><EmptyState title="选择一份材料" description="从左侧选择材料查看预览与字段，或上传新文件。"><button class="btn-primary" @click="ui.uploadOpen = true">上传材料</button></EmptyState></div>
    </div>

    <BaseModal :open="deleteOpen" title="删除材料与识别记录？" description="原始文件、候选字段和提取文本都会从当前会话与本地工作区移除；已生成的事项不会删除。" @close="deleteOpen = false"><p class="rounded-xl bg-canvas p-4 text-sm text-ink">{{ selected?.name }}</p><template #footer><button class="btn-secondary" @click="deleteOpen = false">保留材料</button><button class="btn-danger" @click="removeMaterial"><Trash2 :size="15" />确认删除</button></template></BaseModal>
    <BaseModal :open="clearOpen" title="清除识别结果？" description="候选字段与识别可信度会被清除，但保留原始文件，方便重新识别或手工录入。" @close="clearOpen = false"><template #footer><button class="btn-secondary" @click="clearOpen = false">取消</button><button class="btn-danger" @click="clearResult">清除结果</button></template></BaseModal>
  </div>
</template>
