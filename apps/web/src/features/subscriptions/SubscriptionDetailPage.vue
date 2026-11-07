<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ArrowLeft, CalendarClock, FileCheck2, Lightbulb, PauseCircle, Pencil, PlayCircle, ShieldAlert, Trash2 } from 'lucide-vue-next'
import BaseBadge from '@/components/BaseBadge.vue'
import BaseModal from '@/components/BaseModal.vue'
import EmptyState from '@/components/EmptyState.vue'
import SubscriptionFormModal from './SubscriptionFormModal.vue'
import { buildSavingSuggestions, buildSpendingTrend, findDuplicateCandidates, findHighCostSubscriptions, monthlyEquivalent, projectRenewals } from './subscriptionEngine'
import { useDemoStore } from '@/stores/demo'
import { billingCycleLabels, formatCurrency, formatDate, formatTime, toDateInput } from '@/shared/ui/format'
import { useToast } from '@/shared/ui/useToast'

const route = useRoute()
const router = useRouter()
const store = useDemoStore()
const { notify } = useToast()
const today = toDateInput(new Date())
const editOpen = ref(false)
const deleteOpen = ref(false)
const subscription = computed(() => store.getSubscription(String(route.params.id)))
const trend = computed(() => subscription.value ? buildSpendingTrend([subscription.value], today, subscription.value.currency) : [])
const annualSpending = computed(() => trend.value.reduce((total, point) => total + point.amount, 0))
const schedule = computed(() => subscription.value ? projectRenewals([subscription.value], today, 366, subscription.value.currency).slice(0, 8) : [])
const duplicateGroup = computed(() => subscription.value ? findDuplicateCandidates(store.subscriptions, subscription.value.currency).find((group) => group.subscriptions.some((item) => item.id === subscription.value?.id)) : undefined)
const highCost = computed(() => subscription.value ? findHighCostSubscriptions(store.subscriptions, subscription.value.currency).find((item) => item.subscription.id === subscription.value?.id) : undefined)
const suggestions = computed(() => subscription.value ? buildSavingSuggestions(store.subscriptions, today, subscription.value.currency).filter((suggestion) => suggestion.subscriptionIds.includes(subscription.value!.id)) : [])
const sourceMaterial = computed(() => store.materials.find((material) => material.id === subscription.value?.materialId))
const relatedMatter = computed(() => store.matters.find((matter) => matter.subscriptionId === subscription.value?.id) ?? store.matters.find((matter) => matter.type === 'subscription' && matter.title === subscription.value?.service && matter.dueDate === subscription.value?.nextRenewal))

function togglePause() {
  if (!subscription.value) return
  if (subscription.value.status === 'active') {
    store.pauseSubscription(subscription.value.id)
    notify('已暂停订阅跟踪', 'success', '这只是本地记录状态，未操作第三方服务商账户。')
  } else {
    store.resumeSubscription(subscription.value.id)
    notify('已恢复订阅跟踪', 'success', subscription.value.autoRenew ? '排定扣款已重新计入预测。' : '自动续费仍关闭，因此不计入未来预测。')
  }
}
async function remove() {
  if (!subscription.value) return
  store.removeSubscription(subscription.value.id)
  deleteOpen.value = false
  notify('本地订阅记录已删除', 'success', '这不会取消第三方服务，也不会删除已生成的生活事项。')
  await router.push('/spending')
}
</script>

<template>
  <div v-if="subscription">
    <RouterLink to="/spending" class="mb-5 inline-flex items-center gap-1.5 text-sm font-medium text-muted hover:text-brand"><ArrowLeft :size="16" />返回消费分析</RouterLink>
    <header class="card p-5 sm:p-6">
      <div class="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between"><div class="min-w-0"><div class="flex flex-wrap items-center gap-2"><BaseBadge :label="subscription.category" tone="brand" /><BaseBadge :label="subscription.status === 'active' ? '有效记录' : subscription.status === 'paused' ? '已暂停跟踪' : '已取消记录'" :tone="subscription.status === 'active' ? 'success' : 'neutral'" dot /><BaseBadge :label="subscription.source === 'material' ? '材料确认' : subscription.source === 'manual' ? '手工新增' : '虚构演示样例'" /><BaseBadge v-if="!subscription.autoRenew" label="自动续费未开启" tone="warning" /></div><h1 class="page-title mt-4 break-words">{{ subscription.service }}</h1><p class="mt-2 max-w-2xl text-sm leading-6 text-muted">{{ subscription.notes || '尚未填写权益与使用场景，可编辑补充后再判断相似服务。' }}</p></div><div class="flex shrink-0 flex-wrap gap-2"><button class="btn-secondary" @click="editOpen = true"><Pencil :size="15" />编辑</button><button class="btn-secondary" @click="togglePause"><component :is="subscription.status === 'active' ? PauseCircle : PlayCircle" :size="15" />{{ subscription.status === 'active' ? '暂停跟踪' : '恢复跟踪' }}</button><button class="btn-ghost text-danger hover:bg-red-50" @click="deleteOpen = true"><Trash2 :size="15" />删除记录</button></div></div>
      <div class="mt-6 grid grid-cols-2 gap-4 border-t border-line pt-5 lg:grid-cols-4"><div><p class="text-xs text-muted">每次扣款</p><p class="numeric mt-1.5 text-lg font-semibold text-ink">{{ formatCurrency(subscription.amount, subscription.currency) }}</p><p class="mt-1 text-xs text-muted">{{ billingCycleLabels[subscription.cycle] }}</p></div><div><p class="text-xs text-muted">每月等值</p><p class="numeric mt-1.5 text-lg font-semibold text-ink">{{ formatCurrency(monthlyEquivalent(subscription), subscription.currency) }}</p><p class="mt-1 text-xs text-muted">用于比较，不是实际扣款</p></div><div><p class="text-xs text-muted">下次续费</p><p class="mt-1.5 text-sm font-semibold text-ink">{{ formatDate(subscription.nextRenewal, true) }}</p><p class="mt-1 text-xs text-muted">用户确认的记录日期</p></div><div><p class="text-xs text-muted">未来 12 个自然月预测</p><p class="numeric mt-1.5 text-lg font-semibold text-ink">{{ formatCurrency(annualSpending, subscription.currency) }}</p><p class="mt-1 text-xs text-muted">含本月剩余，按周期展开</p></div></div>
    </header>

    <div class="mt-5 grid items-start gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(300px,1fr)]">
      <div class="space-y-5">
        <section class="card p-5 sm:p-6" aria-labelledby="schedule-title"><div class="flex items-center gap-2"><CalendarClock :size="18" class="text-brand" /><h2 id="schedule-title" class="section-title">后续扣款安排</h2></div><p class="mt-1 text-xs text-muted">由当前下次续费日和{{ billingCycleLabels[subscription.cycle] }}周期计算，最多展示 8 次。</p><ol v-if="schedule.length" class="mt-5"><li v-for="event in schedule" :key="event.id" class="relative flex items-center gap-4 border-l border-line pb-5 pl-5 last:pb-0"><span class="absolute -left-[5px] top-1.5 size-2.5 rounded-full bg-brand ring-4 ring-indigo-50" /><div class="min-w-0 flex-1"><p class="text-sm font-semibold text-ink">{{ formatDate(event.date, true) }}</p><p class="mt-1 text-xs text-muted">{{ event.date }}</p></div><p class="numeric text-sm font-semibold text-ink">{{ formatCurrency(event.amount, event.currency) }}</p></li></ol><EmptyState v-else title="当前没有未来扣款预测" description="记录已暂停、取消或未开启自动续费。历史信息仍保留，不会生成虚假日程。" /></section>

        <section class="card p-5 sm:p-6" aria-labelledby="monthly-forecast-title"><h2 id="monthly-forecast-title" class="section-title">未来 12 个自然月费用预测</h2><p class="mt-1 text-xs text-muted">每个数字都是该记录在各自然月内的排定扣款合计，零金额月份也保留。</p><div class="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3"><div v-for="point in trend" :key="point.month" class="rounded-xl border border-line p-3"><p class="numeric text-xs text-muted">{{ point.month }}</p><p class="numeric mt-1.5 text-sm font-semibold text-ink">{{ formatCurrency(point.amount, subscription.currency) }}</p><p class="mt-1 text-[11px] text-muted">{{ point.renewalCount }} 次扣款</p></div></div></section>

        <section v-if="suggestions.length" class="card p-5 sm:p-6"><div class="flex items-center gap-2"><Lightbulb :size="18" class="text-brand" /><h2 class="section-title">针对这条记录的建议</h2></div><div class="mt-4 space-y-3"><article v-for="suggestion in suggestions" :key="suggestion.id" class="rounded-xl bg-canvas p-4"><h3 class="text-sm font-semibold text-ink">{{ suggestion.title }}</h3><p class="mt-2 text-xs leading-5 text-muted">{{ suggestion.description }}</p><p v-if="suggestion.referenceAmount !== undefined" class="numeric mt-2 text-xs font-semibold text-brand">{{ suggestion.referenceLabel }}：{{ formatCurrency(suggestion.referenceAmount, suggestion.currency) }}</p></article></div></section>
      </div>

      <div class="space-y-5">
        <section v-if="highCost" class="card border-orange-200 bg-orange-50/50 p-5"><BaseBadge label="高额记录复核提示" tone="warning" /><p class="numeric mt-4 text-2xl font-bold text-ink">{{ formatCurrency(highCost.monthlyEquivalent, subscription.currency) }}</p><p class="mt-1 text-xs text-muted">每月等值 · 动态提示线 {{ formatCurrency(highCost.threshold, subscription.currency) }}</p><p class="mt-3 text-xs leading-5 text-muted">{{ highCost.reason }}</p></section>

        <section class="card p-5"><h2 class="section-title">相似服务判断依据</h2><template v-if="duplicateGroup"><ul class="mt-4 space-y-2"><li v-for="reason in duplicateGroup.reasons" :key="reason" class="flex gap-2 text-xs leading-5 text-muted"><span class="mt-2 size-1 shrink-0 rounded-full bg-warning" />{{ reason }}</li></ul><div class="mt-4 space-y-2"><RouterLink v-for="item in duplicateGroup.subscriptions" :key="item.id" :to="`/subscriptions/${item.id}`" class="block rounded-xl border border-line p-3 hover:border-indigo-200"><p class="text-sm font-semibold text-ink">{{ item.service }}</p><p class="mt-1 text-xs text-muted">{{ item.notes || '未填写权益说明' }}</p></RouterLink></div><p class="mt-4 text-xs leading-5 text-muted">这些依据不足以认定浪费，请结合实际使用情况决定。</p></template><div v-else class="mt-4"><p class="text-xs leading-5 text-muted">{{ subscription.duplicateState === 'distinct' ? '你已确认这条记录与候选服务不同。' : '当前没有同币种、同分类的其他有效候选记录。' }}</p><button v-if="subscription.duplicateState === 'distinct'" class="btn-secondary mt-3" @click="store.setDuplicateState(subscription.id, 'candidate'); notify('已恢复重复候选检查')">恢复候选检查</button></div></section>

        <section class="card p-5"><h2 class="section-title">来源与关联</h2><dl class="mt-4 space-y-3 text-xs"><div class="flex justify-between gap-4"><dt class="text-muted">记录来源</dt><dd class="font-medium text-ink">{{ subscription.source === 'material' ? '材料字段确认' : subscription.source === 'manual' ? '手工录入' : '虚构演示数据' }}</dd></div><div class="flex justify-between gap-4"><dt class="text-muted">创建时间</dt><dd class="text-ink">{{ formatTime(subscription.createdAt) }}</dd></div><div class="flex justify-between gap-4"><dt class="text-muted">最近修改</dt><dd class="text-ink">{{ formatTime(subscription.updatedAt) }}</dd></div></dl><RouterLink v-if="sourceMaterial" :to="`/materials?material=${sourceMaterial.id}`" class="mt-4 flex items-center gap-3 rounded-xl border border-line p-3 hover:border-indigo-200"><FileCheck2 :size="18" class="shrink-0 text-brand" /><span class="min-w-0"><span class="block truncate text-xs font-semibold text-ink">{{ sourceMaterial.name }}</span><span class="mt-1 block text-[11px] text-muted">查看已确认字段，原始文件不公开展示</span></span></RouterLink><RouterLink v-if="relatedMatter" :to="`/matters/${relatedMatter.id}`" class="mt-3 inline-flex text-xs font-semibold text-brand">查看关联续费事项与行动方案</RouterLink></section>

        <section class="rounded-[14px] border border-amber-200 bg-amber-50 p-5"><ShieldAlert :size="20" class="text-warning" /><h2 class="mt-3 text-sm font-semibold text-ink">本地记录边界</h2><p class="mt-2 text-xs leading-5 text-muted">编辑、暂停、恢复或删除只改变 LifeGuard 工作区，不会取消第三方订阅或关闭支付渠道。需要停止扣款时，请到服务商官方入口操作并保存结果。</p></section>
      </div>
    </div>

    <SubscriptionFormModal :open="editOpen" :subscription="subscription" @close="editOpen = false" />
    <BaseModal :open="deleteOpen" title="删除这条本地订阅记录？" description="记录将不再参与统计和预测；已生成的生活事项与材料不会删除，第三方服务也不会被取消。" @close="deleteOpen = false"><p class="rounded-xl bg-canvas p-4 text-sm font-semibold text-ink">{{ subscription.service }}</p><template #footer><button class="btn-secondary" @click="deleteOpen = false">保留记录</button><button class="btn-danger" @click="remove"><Trash2 :size="15" />永久删除</button></template></BaseModal>
  </div>
  <div v-else class="card"><EmptyState title="没有找到这个订阅" description="它可能已被删除，或链接中的记录编号无效。"><RouterLink to="/spending" class="btn-primary"><ArrowLeft :size="15" />返回消费分析</RouterLink></EmptyState></div>
</template>
