<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { AlertTriangle, ArrowLeft, CalendarClock, Check, CheckCircle2, Clipboard, FileCheck2, FileText, History, Info, Pencil, RotateCcw, Scale, ShieldCheck, Trash2 } from 'lucide-vue-next'
import BaseBadge from '@/components/BaseBadge.vue'
import BaseModal from '@/components/BaseModal.vue'
import EmptyState from '@/components/EmptyState.vue'
import { resolvedImportance, resolvedPreparationDays } from '@/features/decision/riskEngine'
import { FACT_LABELS, SOURCE_LABELS } from '@/features/decision/rules'
import { useDemoStore } from '@/stores/demo'
import { formatCurrency, formatDate, formatTime, isValidDateString, matterTypeLabels, relativeDeadline, riskLabels } from '@/shared/ui/format'
import { useToast } from '@/shared/ui/useToast'
import type { FactProvenance, MatterFactKey, MatterImportance, MatterType } from '@/types'

const route = useRoute()
const router = useRouter()
const store = useDemoStore()
const { notify } = useToast()
const matter = computed(() => store.getMatter(String(route.params.id)))
const plan = computed(() => matter.value ? store.getPlan(matter.value.id) : undefined)
const histories = computed(() => matter.value ? store.getHistories(matter.value.id) : [])
const sourceMaterial = computed(() => store.materials.find((material) => material.fields.some((field) => field.key === 'title' && field.value === matter.value?.title && field.status === 'confirmed')))
const editOpen = ref(false)
const completeOpen = ref(false)
const deleteOpen = ref(false)
const editError = ref('')
const completeError = ref('')
const outcome = ref('已处理')
const savedAmount = ref('')
const editForm = reactive({ title: '', merchant: '', amount: '', dueDate: '', type: 'purchase' as MatterType, importance: 3 as MatterImportance, preparationDays: '', obligation: '', nextAction: '' })
const progress = computed(() => plan.value?.steps.length ? Math.round(plan.value.steps.filter((step) => step.done).length / plan.value.steps.length * 100) : 0)
const factRows = computed(() => {
  if (!matter.value) return []
  const current = matter.value
  const rows: Array<{ key: MatterFactKey; label: string; value: string; provenance: FactProvenance; canConfirm: boolean }> = []
  const add = (key: MatterFactKey, value: string, present: boolean, inferred = false) => {
    const provenance = inferred
      ? { source: 'inference' as const, confirmed: false, note: '事项类型规则暂估。' }
      : current.provenance?.[key] ?? { source: 'unverified' as const, confirmed: false, note: '尚未记录来源。' }
    rows.push({ key, label: FACT_LABELS[key], value, provenance, canConfirm: present && !provenance.confirmed })
  }
  add('dueDate', formatDate(current.dueDate, true), current.dueDate !== null)
  add('amount', formatCurrency(current.amount, current.currency), current.amount !== null)
  add('importance', `${resolvedImportance(current)}/5`, true, current.importance === undefined)
  add('preparationDays', `${resolvedPreparationDays(current)} 天`, true, current.preparationDays === undefined)
  if (current.type === 'lease') add('obligation', current.obligation || '待核对合同文本', Boolean(current.obligation?.trim()))
  return rows
})

watch(editOpen, (open) => {
  if (!open || !matter.value) return
  Object.assign(editForm, {
    title: matter.value.title, merchant: matter.value.merchant,
    amount: matter.value.amount === null ? '' : String(matter.value.amount),
    dueDate: matter.value.dueDate ?? '', type: matter.value.type,
    importance: resolvedImportance(matter.value), preparationDays: String(resolvedPreparationDays(matter.value)),
    obligation: matter.value.obligation ?? '', nextAction: matter.value.nextAction,
  })
  editError.value = ''
})
watch(completeOpen, (open) => { if (open) { outcome.value = '已处理'; savedAmount.value = ''; completeError.value = '' } })

function saveEdit() {
  if (!matter.value) return
  if (!editForm.title.trim() || !editForm.merchant.trim() || !editForm.nextAction.trim()) { editError.value = '请完整填写名称、商家和下一步行动'; return }
  if (editForm.amount && (!/^\d+(\.\d{1,2})?$/.test(editForm.amount) || !Number.isSafeInteger(Math.round(Number(editForm.amount) * 100)))) { editError.value = '金额需为有效的非负数字，最多两位小数'; return }
  if (editForm.dueDate && !isValidDateString(editForm.dueDate)) { editError.value = '请输入真实有效的截止日期'; return }
  if (!/^\d+$/.test(editForm.preparationDays) || Number(editForm.preparationDays) > 90) { editError.value = '准备时间需为 0—90 天的整数'; return }
  if (editForm.type === 'lease' && !editForm.obligation.trim()) { editError.value = '租赁事项请填写待履行义务；不确定时可注明待核对条款'; return }
  store.updateMatter(matter.value.id, {
    title: editForm.title.trim(), merchant: editForm.merchant.trim(), amount: editForm.amount ? Number(editForm.amount) : null,
    dueDate: editForm.dueDate || null, type: editForm.type, importance: editForm.importance,
    preparationDays: Number(editForm.preparationDays), obligation: editForm.obligation.trim() || undefined,
    nextAction: editForm.nextAction.trim(),
  })
  editOpen.value = false
  notify('评分与行动方案已重算', 'success', '已完成步骤按稳定标识保留，变更已写入历史。')
}

function confirmFact(key: MatterFactKey) {
  if (!matter.value) return
  store.confirmFact(matter.value.id, key)
  notify('信息已确认', 'success', '评分、建议完成时间和行动方案已同步更新。')
}

async function copyScript() {
  if (!plan.value) return
  try { await navigator.clipboard.writeText(plan.value.script); notify('沟通文本已复制') } catch { notify('无法访问剪贴板', 'error', '请选中文本后手工复制。') }
}

function complete() {
  if (!matter.value) return
  const amount = savedAmount.value ? Number(savedAmount.value) : undefined
  if (!outcome.value.trim()) { completeError.value = '请填写实际处理结果'; return }
  if (savedAmount.value && (!/^\d+(\.\d{1,2})?$/.test(savedAmount.value) || !Number.isSafeInteger(Math.round(amount! * 100)))) { completeError.value = '金额需为非负数字，最多两位小数'; return }
  store.completeMatter(matter.value.id, outcome.value.trim(), amount)
  completeOpen.value = false
  notify('完成记录已保存', 'success', '事项已退出优先队列，历史方案仍可追溯。')
}

async function remove() {
  if (!matter.value) return
  store.removeMatter(matter.value.id)
  deleteOpen.value = false
  notify('本地事项已删除', 'success', '统计数据已同步；关联的订阅与材料记录保留。')
  await router.push('/radar')
}
</script>

<template>
  <div v-if="matter">
    <RouterLink to="/radar" class="mb-5 inline-flex items-center gap-1.5 text-sm font-medium text-muted hover:text-brand"><ArrowLeft :size="16" />返回期限雷达</RouterLink>
    <header class="card p-5 sm:p-6">
      <div class="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between"><div><div class="flex flex-wrap items-center gap-2"><BaseBadge :label="matterTypeLabels[matter.type]" tone="brand" /><BaseBadge :label="matter.status === 'completed' ? '已完成' : riskLabels[matter.risk]" :tone="matter.status === 'completed' ? 'success' : matter.risk === 'urgent' ? 'danger' : matter.risk === 'high' ? 'warning' : 'neutral'" dot /><BaseBadge v-if="matter.source === 'demo'" label="虚构演示样例" /></div><h1 class="page-title mt-4">{{ matter.title }}</h1><p class="mt-2 max-w-2xl text-sm leading-6 text-muted">{{ matter.description }}</p></div><div class="flex shrink-0 flex-wrap gap-2"><button v-if="matter.status === 'active'" class="btn-secondary" @click="editOpen = true"><Pencil :size="15" />编辑并重算</button><button v-if="matter.status === 'active'" class="btn-primary" @click="completeOpen = true"><CheckCircle2 :size="16" />标记完成</button><button v-else class="btn-secondary" @click="store.reopenMatter(matter.id); notify('事项已恢复并重新评估')"><RotateCcw :size="15" />恢复待处理</button><button class="btn-ghost text-danger hover:bg-red-50" @click="deleteOpen = true"><Trash2 :size="15" />删除事项</button></div></div>
      <div class="mt-6 grid grid-cols-2 gap-4 border-t border-line pt-5 lg:grid-cols-4"><div><p class="text-xs text-muted">截止日期</p><p class="mt-1.5 text-sm font-semibold text-ink">{{ formatDate(matter.dueDate, true) }}</p><p :class="['mt-1 text-xs', matter.status === 'active' && matter.risk === 'urgent' ? 'text-danger' : 'text-muted']">{{ matter.status === 'active' ? relativeDeadline(matter.dueDate) : `完成于 ${formatDate(matter.completedOn!, true)}` }}</p></div><div><p class="text-xs text-muted">涉及金额</p><p class="numeric mt-1.5 text-sm font-semibold text-ink">{{ formatCurrency(matter.amount, matter.currency) }}</p><p class="mt-1 text-xs text-muted">仅用于排序，不代表确定损失</p></div><div><p class="text-xs text-muted">商家 / 机构</p><p class="mt-1.5 text-sm font-semibold text-ink">{{ matter.merchant }}</p><p class="mt-1 text-xs text-muted">{{ matter.source === 'manual' ? '手工创建' : matter.source === 'material' ? '材料确认生成' : '预置演示数据' }}</p></div><div><p class="text-xs text-muted">下一步行动</p><p class="mt-1.5 text-sm font-semibold leading-5 text-ink">{{ matter.nextAction }}</p></div></div>
    </header>

    <section v-if="matter.assessment" class="card mt-5 overflow-hidden" aria-labelledby="assessment-title">
      <div class="grid lg:grid-cols-[240px_minmax(0,1fr)]">
        <div class="border-b border-line bg-canvas p-5 sm:p-6 lg:border-b-0 lg:border-r"><p class="text-xs font-semibold uppercase tracking-[0.14em] text-muted">可解释优先级</p><div class="mt-3 flex items-end gap-2"><span class="numeric text-5xl font-bold tracking-[-0.06em] text-ink">{{ matter.assessment.score }}</span><span class="pb-1 text-sm text-muted">/ 100</span></div><BaseBadge class="mt-3" :label="matter.status === 'completed' ? '已完成 · 退出排序' : riskLabels[matter.assessment.level]" :tone="matter.assessment.level === 'urgent' ? 'danger' : matter.assessment.level === 'high' ? 'warning' : 'brand'" /><p class="mt-4 text-xs leading-5 text-muted">{{ matter.assessment.summary }}</p><p class="mt-3 text-[11px] text-slate-400">规则版本 {{ matter.assessment.ruleVersion }}</p></div>
        <div class="p-5 sm:p-6"><div class="flex flex-wrap items-center justify-between gap-3"><h2 id="assessment-title" class="section-title">为什么是这个优先级</h2><span class="text-xs text-muted">分项得分 × 权重 = 贡献分</span></div><div class="mt-4 grid gap-3 md:grid-cols-2"><article v-for="factor in matter.assessment.factors" :key="factor.key" class="rounded-xl border border-line p-4"><div class="flex items-start justify-between gap-3"><div><h3 class="text-sm font-semibold text-ink">{{ factor.label }}</h3><p class="mt-1 text-[11px] text-muted">权重 {{ factor.weight }}% · {{ SOURCE_LABELS[factor.source] }}</p></div><p class="numeric shrink-0 text-sm font-bold text-brand">{{ factor.points }}<span class="text-xs font-normal text-muted"> 分</span></p></div><div class="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100"><div class="h-full rounded-full bg-brand" :style="{ width: `${factor.score}%` }" /></div><p class="mt-2 text-[11px] text-muted">因素得分 {{ factor.score }}/100</p><p class="mt-2 text-xs leading-5 text-muted">{{ factor.explanation }}</p></article></div></div>
      </div>
    </section>

    <div class="mt-5 grid items-start gap-5 xl:grid-cols-[minmax(0,1.45fr)_minmax(300px,1fr)]">
      <section v-if="plan" class="card overflow-hidden" aria-labelledby="detail-plan-title">
        <div class="border-b border-line p-5 sm:p-6"><div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><div class="flex flex-wrap items-center gap-2"><h2 id="detail-plan-title" class="section-title">{{ plan.title }}</h2><BaseBadge label="动态规则方案" tone="brand" /></div><p class="mt-2 text-sm leading-6 text-muted">{{ plan.summary }}</p></div><span class="numeric shrink-0 text-sm font-semibold text-brand">{{ progress }}%</span></div><div class="mt-4 h-2 overflow-hidden rounded-full bg-slate-100"><div class="h-full rounded-full bg-brand transition-all" :style="{ width: `${progress}%` }" /></div>
          <div class="mt-5 grid gap-4 md:grid-cols-2"><div class="rounded-xl bg-canvas p-4"><h3 class="flex items-center gap-2 text-xs font-semibold text-ink"><Info :size="15" class="text-brand" />当前情况分析</h3><p class="mt-2 text-xs leading-5 text-muted">{{ plan.analysis }}</p></div><div class="rounded-xl bg-canvas p-4"><h3 class="flex items-center gap-2 text-xs font-semibold text-ink"><CalendarClock :size="15" class="text-brand" />建议完成时间</h3><p class="mt-2 text-sm font-semibold text-ink">{{ plan.suggestedCompletionDate ? formatDate(plan.suggestedCompletionDate, true) : '暂不生成' }}</p><p class="mt-2 text-xs leading-5 text-muted">{{ plan.recommendationReason }}</p></div></div>
          <div class="mt-4 rounded-xl border border-orange-100 bg-orange-50/60 p-4"><h3 class="flex items-center gap-2 text-xs font-semibold text-ink"><AlertTriangle :size="15" class="text-warning" />主要风险</h3><ul class="mt-2 space-y-2"><li v-for="risk in plan.risks" :key="risk" class="flex gap-2 text-xs leading-5 text-muted"><span class="mt-2 size-1 shrink-0 rounded-full bg-warning" />{{ risk }}</li></ul></div>
          <div class="mt-4 rounded-xl border border-indigo-100 bg-indigo-50/50 p-4"><p class="text-xs font-semibold text-ink">建议采取的行动</p><p class="mt-1.5 text-sm leading-6 text-ink">{{ plan.recommendedAction }}</p></div>
        </div>
        <div class="p-5 sm:p-6"><h3 class="text-sm font-semibold text-ink">操作步骤</h3><div class="mt-4 space-y-3"><label v-for="(step, index) in plan.steps" :key="step.id" :class="['flex gap-3 rounded-xl border p-4', matter.status === 'active' ? 'cursor-pointer' : '', step.done ? 'border-emerald-100 bg-emerald-50/50' : 'border-line']"><input class="sr-only" type="checkbox" :checked="step.done" :disabled="matter.status !== 'active'" @change="store.toggleStep(plan.id, step.id)" /><span :class="['mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-md border', step.done ? 'border-success bg-success text-white' : 'border-slate-300 text-transparent']"><Check :size="14" /></span><span><span :class="['block text-sm font-semibold', step.done ? 'text-success' : 'text-ink']">{{ index + 1 }}. {{ step.title }}</span><span class="mt-1 block text-xs leading-5 text-muted">{{ step.detail }}</span></span></label></div><div class="mt-5 flex flex-wrap justify-end gap-2 border-t border-line pt-5"><button class="btn-secondary" @click="copyScript"><Clipboard :size="15" />复制沟通文本</button><button v-if="matter.status === 'active'" class="btn-primary" @click="completeOpen = true"><CheckCircle2 :size="15" />记录处理结果</button></div></div>
      </section>
      <section v-else class="card"><EmptyState title="还没有行动清单" description="该事项可以由规则模板生成行动步骤。" /></section>

      <div class="space-y-5">
        <section v-if="matter.status === 'completed'" class="card border-emerald-100 p-5"><span class="flex size-10 items-center justify-center rounded-full bg-emerald-50 text-success"><CheckCircle2 :size="20" /></span><h2 class="mt-4 section-title">处理结果</h2><p class="mt-2 text-sm text-ink">{{ matter.outcome }}</p><dl class="mt-4 space-y-3 border-t border-line pt-4 text-sm"><div class="flex justify-between gap-4"><dt class="text-muted">完成日期</dt><dd class="font-medium text-ink">{{ formatDate(matter.completedOn!, true) }}</dd></div><div class="flex justify-between gap-4"><dt class="text-muted">确认少支出</dt><dd class="numeric font-semibold text-success">{{ formatCurrency(matter.savedAmount ?? 0) }}</dd></div></dl></section>
        <section class="card p-5"><h2 class="section-title">信息来源与确认</h2><p class="mt-1 text-xs leading-5 text-muted">来源和是否核对是两个独立状态。点击确认只处理当前字段。</p><div class="mt-4 space-y-3"><div v-for="row in factRows" :key="row.key" class="rounded-xl border border-line p-3"><div class="flex items-start justify-between gap-3"><div><p class="text-xs text-muted">{{ row.label }}</p><p class="mt-1 text-sm font-medium text-ink">{{ row.value }}</p></div><BaseBadge :label="row.provenance.confirmed ? '已核对' : '待确认'" :tone="row.provenance.confirmed ? 'success' : 'warning'" /></div><div class="mt-2 flex flex-wrap items-center justify-between gap-2"><p class="text-[11px] text-muted">{{ SOURCE_LABELS[row.provenance.source] }}<span v-if="row.provenance.note"> · {{ row.provenance.note }}</span></p><button v-if="row.canConfirm && matter.status === 'active'" class="btn-ghost min-h-7 px-2 py-1 text-[11px]" @click="confirmFact(row.key)">确认此信息</button></div></div></div><button v-if="matter.status === 'active'" class="btn-secondary mt-4 w-full" @click="editOpen = true"><Pencil :size="14" />补充或修改信息</button></section>
        <section class="card p-5"><h2 class="section-title">来源与证据</h2><div v-if="sourceMaterial" class="mt-4"><RouterLink :to="`/materials?material=${sourceMaterial.id}`" class="flex items-center gap-3 rounded-xl border border-line p-4 hover:border-indigo-200"><span class="flex size-10 items-center justify-center rounded-[10px] bg-indigo-50 text-brand"><FileCheck2 :size="18" /></span><span class="min-w-0 flex-1"><span class="block truncate text-sm font-semibold text-ink">{{ sourceMaterial.name }}</span><span class="mt-1 block text-xs text-muted">已确认材料字段</span></span></RouterLink></div><div v-else class="mt-4 rounded-xl bg-canvas p-4"><div class="flex gap-3"><FileText :size="17" class="mt-0.5 shrink-0 text-muted" /><p class="text-xs leading-5 text-muted">{{ matter.source === 'demo' ? '这是虚构演示事项，描述与金额用于展示产品流程，不对应真实个人材料。' : '该事项由你手工确认，当前未关联原始材料。' }}</p></div></div></section>
        <section class="card p-5"><h2 class="section-title">建议准备的材料</h2><ul v-if="plan" class="mt-4 space-y-3"><li v-for="material in plan.materials" :key="material" class="flex items-center gap-2 text-sm text-muted"><ShieldCheck :size="15" class="shrink-0 text-brand" />{{ material }}</li></ul></section>
        <section class="rounded-[14px] border border-amber-200 bg-amber-50 p-5"><Scale :size="20" class="text-warning" /><h2 class="mt-3 text-sm font-semibold text-ink">规则核实边界</h2><p class="mt-2 text-xs leading-5 text-muted">消费者权益、退款、合同和法律事项不能只凭本评分确定权利义务。请核实商家具体规则、完整合同文本、实际履行情况和适用法律；本方案不构成法律意见或平台结果保证。</p></section>
      </div>
    </div>

    <section class="card mt-5 p-5 sm:p-6" aria-labelledby="history-title"><div class="flex items-center gap-2"><History :size="18" class="text-brand" /><h2 id="history-title" class="section-title">历史变化</h2></div><p class="mt-1 text-xs text-muted">保存评分快照、字段变更和步骤进度，不按日期重排待办。</p><div v-if="histories.length" class="mt-5"><article v-for="history in histories" :key="history.id" class="relative border-l border-line pb-5 pl-5 last:pb-0"><span class="absolute -left-[5px] top-1 size-2.5 rounded-full bg-brand ring-4 ring-indigo-50" /><div class="flex flex-wrap items-center gap-2"><h3 class="text-sm font-semibold text-ink">{{ history.title }}</h3><BaseBadge :label="`${history.score} 分`" tone="neutral" /><span class="text-[11px] text-muted">{{ formatTime(history.timestamp) }}</span></div><p class="mt-1.5 text-xs leading-5 text-muted">{{ history.description }}</p><dl v-if="history.changes.length" class="mt-3 space-y-1.5 rounded-xl bg-canvas p-3 text-xs"><div v-for="change in history.changes" :key="`${history.id}-${change.field}`" class="grid gap-1 sm:grid-cols-[100px_minmax(0,1fr)_auto_minmax(0,1fr)] sm:items-center"><dt class="text-muted">{{ change.label }}</dt><dd class="break-words text-muted">{{ change.before }}</dd><span class="hidden text-slate-400 sm:block">→</span><dd class="break-words font-medium text-ink">{{ change.after }}</dd></div></dl></article></div><EmptyState v-else title="还没有历史记录" description="编辑、确认、完成和步骤操作会记录在这里。" /></section>

    <BaseModal :open="editOpen" title="编辑生活事项" description="保存后重新计算五维评分和行动建议；本次填写的信息将标记为用户提供并已核对。" wide @close="editOpen = false">
      <form id="edit-matter-form" class="grid gap-4 sm:grid-cols-2" @submit.prevent="saveEdit"><label class="block sm:col-span-2"><span class="label">事项名称</span><input v-model="editForm.title" class="input" /></label><label class="block"><span class="label">商家 / 机构</span><input v-model="editForm.merchant" class="input" /></label><label class="block"><span class="label">事项类型</span><select v-model="editForm.type" class="input"><option v-for="(label, key) in matterTypeLabels" :key="key" :value="key">{{ label }}</option></select></label><label class="block"><span class="label">金额（可留空待核实）</span><input v-model="editForm.amount" class="input" inputmode="decimal" /></label><label class="block"><span class="label">截止日期（可留空待核实）</span><input v-model="editForm.dueDate" class="input" type="date" /></label><label class="block"><span class="label">重要程度</span><select v-model="editForm.importance" class="input"><option v-for="value in [1, 2, 3, 4, 5]" :key="value" :value="value">{{ value }} / 5</option></select></label><label class="block"><span class="label">预计准备时间（天）</span><input v-model="editForm.preparationDays" class="input" inputmode="numeric" /></label><label v-if="editForm.type === 'lease'" class="block sm:col-span-2"><span class="label">待履行义务</span><textarea v-model="editForm.obligation" class="input min-h-20 resize-y" placeholder="例如：按合同第 8 条提前 30 天书面通知；请核对原文后填写" /></label><label class="block sm:col-span-2"><span class="label">下一步行动</span><textarea v-model="editForm.nextAction" class="input min-h-24 resize-y" /></label><p v-if="editError" class="field-error sm:col-span-2" role="alert">{{ editError }}</p></form>
      <template #footer><button class="btn-secondary" @click="editOpen = false">取消</button><button type="submit" form="edit-matter-form" class="btn-primary">保存并重新计算</button></template>
    </BaseModal>
    <BaseModal :open="completeOpen" title="记录实际处理结果" description="完成结果会进入历史记录；节省金额只记录你明确确认的数值。" @close="completeOpen = false"><form id="detail-complete-form" class="space-y-4" @submit.prevent="complete"><label class="block"><span class="label">处理结果</span><input v-model="outcome" class="input" placeholder="例如：已退款" /></label><label class="block"><span class="label">确认少支出或挽回金额（可选）</span><input v-model="savedAmount" class="input" inputmode="decimal" placeholder="0.00" /></label><p v-if="completeError" class="field-error" role="alert">{{ completeError }}</p></form><template #footer><button class="btn-secondary" @click="completeOpen = false">取消</button><button type="submit" form="detail-complete-form" class="btn-primary">保存完成记录</button></template></BaseModal>
    <BaseModal :open="deleteOpen" title="删除这条生活事项？" description="事项及其行动方案、历史记录将移出工作区，首页与雷达统计立即同步；关联的订阅与材料记录不会被删除。此操作不可撤销。" @close="deleteOpen = false"><p class="rounded-xl bg-canvas p-4 text-sm font-semibold text-ink">{{ matter.title }}</p><template #footer><button class="btn-secondary" @click="deleteOpen = false">保留事项</button><button class="btn-danger" @click="remove"><Trash2 :size="15" />永久删除</button></template></BaseModal>
  </div>
  <div v-else class="card"><EmptyState title="没有找到这个事项" description="它可能已被清除，或链接中的记录编号无效。"><RouterLink to="/dashboard" class="btn-primary"><ArrowLeft :size="15" />返回今日概览</RouterLink></EmptyState></div>
</template>
