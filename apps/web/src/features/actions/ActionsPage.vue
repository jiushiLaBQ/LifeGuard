<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ArrowRight, Check, CheckCircle2, Clipboard, FileText, ListChecks } from 'lucide-vue-next'
import PageHeader from '@/components/PageHeader.vue'
import BaseBadge from '@/components/BaseBadge.vue'
import BaseModal from '@/components/BaseModal.vue'
import EmptyState from '@/components/EmptyState.vue'
import { useDemoStore } from '@/stores/demo'
import { formatCurrency, formatDate, matterTypeLabels, relativeDeadline } from '@/shared/ui/format'
import { useToast } from '@/shared/ui/useToast'

const store = useDemoStore()
const { notify } = useToast()
const tab = ref<'active' | 'completed'>('active')
const selectedId = ref('')
const completeOpen = ref(false)
const outcome = ref('已处理')
const savedAmount = ref('')
const completeError = ref('')
const activePlans = computed(() => store.actions.filter((plan) => store.getMatter(plan.matterId)?.status === 'active').sort((a, b) => (store.getMatter(b.matterId)?.assessment?.score ?? 0) - (store.getMatter(a.matterId)?.assessment?.score ?? 0) || (store.getMatter(a.matterId)?.dueDate ?? '9999-12-31').localeCompare(store.getMatter(b.matterId)?.dueDate ?? '9999-12-31')))
const selectedPlan = computed(() => store.actions.find((plan) => plan.id === selectedId.value) ?? activePlans.value[0])
const selectedMatter = computed(() => selectedPlan.value ? store.getMatter(selectedPlan.value.matterId) : undefined)
const progress = computed(() => selectedPlan.value ? Math.round(selectedPlan.value.steps.filter((step) => step.done).length / selectedPlan.value.steps.length * 100) : 0)
watch(activePlans, (plans) => { if (!plans.some((plan) => plan.id === selectedId.value)) selectedId.value = plans[0]?.id ?? '' }, { immediate: true })
watch(completeOpen, (open) => { if (open) { outcome.value = '已处理'; savedAmount.value = ''; completeError.value = '' } })
async function copyScript() {
  if (!selectedPlan.value) return
  try { await navigator.clipboard.writeText(selectedPlan.value.script); notify('沟通文本已复制') } catch { notify('无法访问剪贴板', 'error', '请选中文本后手工复制。') }
}
function openCompletion() { if (selectedMatter.value) completeOpen.value = true }
function complete() {
  if (!selectedMatter.value) return
  const amount = savedAmount.value ? Number(savedAmount.value) : undefined
  if (!outcome.value.trim()) { completeError.value = '请填写实际处理结果'; return }
  if (savedAmount.value && (!/^\d+(\.\d{1,2})?$/.test(savedAmount.value) || !Number.isSafeInteger(Math.round(amount! * 100)))) { completeError.value = '节省金额需为非负数字，最多两位小数'; return }
  store.completeMatter(selectedMatter.value.id, outcome.value.trim(), amount)
  completeOpen.value = false
  notify('事项已标记完成', 'success', '统计已按你确认的结果更新。')
}
</script>

<template>
  <div>
    <PageHeader eyebrow="行动中心" title="把期限变成可以完成的步骤" description="按五维优先级排列，并随日期、金额、类型、状态和信息确认动态重算。规则建议不构成法律或平台结果保证。">
      <div class="flex rounded-[10px] border border-line bg-white p-1"><button :class="['btn min-h-8 px-3 py-1.5', tab === 'active' ? 'bg-indigo-50 text-brand' : 'text-muted']" @click="tab = 'active'">待处理</button><button :class="['btn min-h-8 px-3 py-1.5', tab === 'completed' ? 'bg-indigo-50 text-brand' : 'text-muted']" @click="tab = 'completed'">完成记录</button></div>
    </PageHeader>

    <template v-if="tab === 'active'">
      <div v-if="activePlans.length" class="grid items-start gap-5 xl:grid-cols-[340px_minmax(0,1fr)]">
        <aside class="card overflow-hidden" aria-label="行动清单列表"><div class="border-b border-line px-5 py-4"><h2 class="section-title">待处理清单</h2><p class="mt-1 text-xs text-muted">{{ activePlans.length }} 个事项有待完成步骤</p></div><div class="divide-y divide-line"><button v-for="plan in activePlans" :key="plan.id" :class="['w-full px-5 py-4 text-left transition-colors', selectedPlan?.id === plan.id ? 'bg-indigo-50/70' : 'hover:bg-slate-50']" @click="selectedId = plan.id"><div class="flex items-center gap-2"><BaseBadge :label="matterTypeLabels[store.getMatter(plan.matterId)!.type]" :tone="selectedPlan?.id === plan.id ? 'brand' : 'neutral'" /><span class="ml-auto text-[11px] text-muted">{{ store.getMatter(plan.matterId)?.assessment?.score ?? 0 }} 分 · {{ relativeDeadline(store.getMatter(plan.matterId)!.dueDate) }}</span></div><p class="mt-2 text-sm font-semibold text-ink">{{ store.getMatter(plan.matterId)?.title }}</p><p class="mt-1 text-xs text-muted">{{ plan.steps.filter((step) => step.done).length }}/{{ plan.steps.length }} 步已完成</p></button></div></aside>

        <section v-if="selectedPlan && selectedMatter" class="card overflow-hidden" aria-labelledby="plan-title">
          <div class="border-b border-line p-5 sm:p-6"><div class="flex flex-wrap items-center gap-2"><BaseBadge :label="`${selectedMatter.assessment?.score ?? 0} 分 · 动态规则方案`" tone="brand" /><BaseBadge :label="relativeDeadline(selectedMatter.dueDate)" :tone="selectedMatter.risk === 'urgent' ? 'danger' : selectedMatter.risk === 'high' ? 'warning' : 'neutral'" /></div><h2 id="plan-title" class="mt-3 text-xl font-bold tracking-[-0.025em] text-ink">{{ selectedPlan.title }}</h2><p class="mt-2 text-sm leading-6 text-muted">{{ selectedPlan.summary }}</p><p class="mt-3 rounded-xl bg-canvas p-4 text-xs leading-5 text-muted">{{ selectedPlan.analysis }}</p><div v-if="selectedPlan.risks?.length" class="mt-3 rounded-xl border border-orange-100 bg-orange-50/50 p-4"><p class="text-xs font-semibold text-ink">主要风险</p><ul class="mt-2 space-y-1.5"><li v-for="risk in selectedPlan.risks.slice(0, 3)" :key="risk" class="text-xs leading-5 text-muted">· {{ risk }}</li></ul></div><div class="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted"><span class="font-semibold text-ink">建议完成：</span>{{ selectedPlan.suggestedCompletionDate ? formatDate(selectedPlan.suggestedCompletionDate, true) : '期限确认后生成' }}<span>· {{ selectedPlan.recommendationReason }}</span></div><div class="mt-5 flex items-center gap-3"><div class="h-2 flex-1 overflow-hidden rounded-full bg-slate-100"><div class="h-full rounded-full bg-brand transition-all" :style="{ width: `${progress}%` }" /></div><span class="numeric text-xs font-semibold text-brand">{{ progress }}%</span></div></div>
          <div class="p-5 sm:p-6"><h3 class="flex items-center gap-2 text-sm font-semibold text-ink"><ListChecks :size="17" class="text-brand" />行动步骤</h3><div class="mt-4 space-y-3"><label v-for="(step, index) in selectedPlan.steps" :key="step.id" :class="['flex cursor-pointer gap-3 rounded-xl border p-4 transition-colors', step.done ? 'border-emerald-100 bg-emerald-50/50' : 'border-line hover:border-indigo-200']"><input class="sr-only" type="checkbox" :checked="step.done" @change="store.toggleStep(selectedPlan.id, step.id)" /><span :class="['mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-md border', step.done ? 'border-success bg-success text-white' : 'border-slate-300 bg-white text-transparent']"><Check :size="14" /></span><span><span :class="['block text-sm font-semibold', step.done ? 'text-success line-through' : 'text-ink']">{{ index + 1 }}. {{ step.title }}</span><span class="mt-1 block text-xs leading-5 text-muted">{{ step.detail }}</span></span></label></div>
            <div class="mt-6 grid gap-5 border-t border-line pt-5 lg:grid-cols-2"><div><h3 class="text-sm font-semibold text-ink">建议准备的材料</h3><ul class="mt-3 space-y-2"><li v-for="material in selectedPlan.materials" :key="material" class="flex items-center gap-2 text-sm text-muted"><FileText :size="15" class="shrink-0 text-slate-400" />{{ material }}</li></ul></div><div><div class="flex items-center justify-between"><h3 class="text-sm font-semibold text-ink">沟通文本</h3><button class="btn-ghost min-h-8 px-2 py-1 text-xs" @click="copyScript"><Clipboard :size="14" />复制</button></div><p class="mt-3 rounded-xl bg-canvas p-4 text-xs leading-6 text-muted">{{ selectedPlan.script }}</p></div></div>
            <div class="mt-6 flex flex-col gap-2 border-t border-line pt-5 sm:flex-row sm:justify-between"><RouterLink :to="`/matters/${selectedMatter.id}`" class="btn-secondary">查看事项详情<ArrowRight :size="15" /></RouterLink><button class="btn-primary" @click="openCompletion"><CheckCircle2 :size="16" />标记事项完成</button></div>
          </div>
        </section>
      </div>
      <div v-else class="card"><EmptyState title="所有行动都处理完了" description="新建或确认一个生活事项后，会生成对应的规则行动清单。"><RouterLink to="/dashboard" class="btn-primary">返回今日概览</RouterLink></EmptyState></div>
    </template>

    <section v-else class="card overflow-hidden"><div class="border-b border-line px-5 py-4"><h2 class="section-title">完成记录</h2><p class="mt-1 text-xs text-muted">节省金额仅汇总你在完成时明确确认的数值。</p></div><div v-if="store.completedMatters.length" class="divide-y divide-line"><RouterLink v-for="item in store.completedMatters" :key="item.id" :to="`/matters/${item.id}`" class="flex items-center gap-4 px-5 py-4 hover:bg-slate-50"><span class="flex size-9 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-success"><CheckCircle2 :size="18" /></span><div class="min-w-0 flex-1"><p class="text-sm font-semibold text-ink">{{ item.title }}</p><p class="mt-1 text-xs text-muted">{{ formatDate(item.completedOn!, true) }} · {{ item.outcome }}</p></div><div class="text-right"><p class="numeric text-sm font-semibold text-success">+{{ formatCurrency(item.savedAmount ?? 0) }}</p><p class="mt-1 text-[11px] text-muted">确认少支出</p></div></RouterLink></div><EmptyState v-else title="还没有完成记录" description="在行动清单中提交实际结果后，会在这里留下可追溯记录。" /></section>

    <BaseModal :open="completeOpen" title="记录实际处理结果" description="完成结果会进入历史记录；节省金额可选，不填写不会自动估算。" @close="completeOpen = false">
      <form id="complete-action-form" class="space-y-4" @submit.prevent="complete"><label class="block"><span class="label">处理结果</span><input v-model="outcome" class="input" placeholder="例如：已提交退货申请" /></label><label class="block"><span class="label">确认少支出或挽回金额（可选）</span><div class="relative"><span class="absolute left-3 top-3 text-muted">¥</span><input v-model="savedAmount" class="input pl-8" inputmode="decimal" placeholder="0.00" /></div><p class="mt-1.5 text-xs text-muted">仅记录你确认的金额，不代表平台承诺。</p></label><p v-if="completeError" class="field-error" role="alert">{{ completeError }}</p></form>
      <template #footer><button class="btn-secondary" @click="completeOpen = false">取消</button><button type="submit" form="complete-action-form" class="btn-primary"><CheckCircle2 :size="16" />保存完成记录</button></template>
    </BaseModal>
  </div>
</template>
