<script setup lang="ts">
import { computed, ref } from 'vue'
import type { EChartsOption } from 'echarts'
import { ArrowRight, CalendarClock, Check, ChevronDown, CircleAlert, Lightbulb, PauseCircle, Pencil, PlayCircle, Plus, Repeat2, TrendingUp, WalletCards } from 'lucide-vue-next'
import PageHeader from '@/components/PageHeader.vue'
import BaseBadge from '@/components/BaseBadge.vue'
import EmptyState from '@/components/EmptyState.vue'
import EChart from '@/shared/charts/EChart.vue'
import SubscriptionFormModal from './SubscriptionFormModal.vue'
import { buildSavingSuggestions, buildSpendingTrend, findDuplicateCandidates, findHighCostSubscriptions, monthlyEquivalent, projectRenewals } from './subscriptionEngine'
import { useDemoStore } from '@/stores/demo'
import { billingCycleLabels, daysUntil, formatCurrency, formatDate, toDateInput } from '@/shared/ui/format'
import { useToast } from '@/shared/ui/useToast'
import type { Subscription } from '@/types'

const store = useDemoStore()
const { notify } = useToast()
const today = toDateInput(new Date())
const currency = computed(() => store.profile.currency as Subscription['currency'])
const statusFilter = ref<'active' | 'paused' | 'cancelled' | 'all'>('active')
const formOpen = ref(false)
const editing = ref<Subscription>()
const filteredSubscriptions = computed(() => store.subscriptions.filter((item) => statusFilter.value === 'all' || item.status === statusFilter.value).slice().sort((a, b) => a.nextRenewal.localeCompare(b.nextRenewal)))
const billableSubscriptions = computed(() => store.subscriptions.filter((item) => item.status === 'active' && item.autoRenew && item.currency === currency.value))
const otherCurrencyCount = computed(() => store.subscriptions.filter((item) => item.status === 'active' && item.autoRenew && item.currency !== currency.value).length)
const upcoming = computed(() => projectRenewals(store.subscriptions, today, 30, currency.value))
const upcomingTotal = computed(() => upcoming.value.reduce((total, event) => total + event.amount, 0))
const trend = computed(() => buildSpendingTrend(store.subscriptions, today, currency.value))
const annualSpending = computed(() => trend.value.reduce((total, point) => total + point.amount, 0))
const duplicateGroups = computed(() => findDuplicateCandidates(store.subscriptions, currency.value))
const highCost = computed(() => findHighCostSubscriptions(store.subscriptions, currency.value))
const suggestions = computed(() => buildSavingSuggestions(store.subscriptions, today, currency.value))
const categoryData = computed(() => {
  const totals = new Map<string, number>()
  billableSubscriptions.value.forEach((item) => totals.set(item.category, (totals.get(item.category) ?? 0) + monthlyEquivalent(item)))
  return Array.from(totals, ([name, value]) => ({ name, value: Number(value.toFixed(2)) }))
})
const pieOption = computed<EChartsOption>(() => ({
  tooltip: { trigger: 'item', valueFormatter: (value) => formatCurrency(Number(value), currency.value) },
  legend: { bottom: 0, icon: 'circle', itemWidth: 8, itemHeight: 8, textStyle: { color: '#697386', fontSize: 11 } },
  color: ['#4056d6', '#7182e3', '#2f8c75', '#d58a45', '#9b71c7'],
  series: [{ type: 'pie', radius: ['50%', '72%'], center: ['50%', '43%'], avoidLabelOverlap: true, label: { show: false }, emphasis: { label: { show: false } }, data: categoryData.value }],
}))
const trendOption = computed<EChartsOption>(() => ({
  tooltip: { trigger: 'axis', valueFormatter: (value) => formatCurrency(Number(value), currency.value) },
  grid: { left: 58, right: 18, top: 24, bottom: 42 },
  xAxis: { type: 'category', data: trend.value.map((point) => point.month), axisLabel: { color: '#697386', fontSize: 10 }, axisLine: { lineStyle: { color: '#e4e8f0' } }, axisTick: { show: false } },
  yAxis: { type: 'value', axisLabel: { color: '#697386', fontSize: 10, formatter: (value: number) => formatCurrency(value, currency.value) }, splitLine: { lineStyle: { color: '#edf0f5' } } },
  series: [{ name: '排定扣款', type: 'line', data: trend.value.map((point) => Number(point.amount.toFixed(2))), smooth: 0.25, symbolSize: 7, lineStyle: { width: 3, color: '#4056d6' }, itemStyle: { color: '#4056d6' }, areaStyle: { color: '#4056d6', opacity: 0.08 } }],
}))

function openCreate() {
  editing.value = undefined
  formOpen.value = true
}
function openEdit(item: Subscription) {
  editing.value = item
  formOpen.value = true
}
function togglePause(item: Subscription) {
  if (item.status === 'active') {
    store.pauseSubscription(item.id)
    notify('已暂停订阅跟踪', 'success', '仅暂停 LifeGuard 预测，不代表已在服务商处取消；记录仍可恢复。')
  } else {
    store.resumeSubscription(item.id)
    notify('已恢复订阅跟踪', 'success', item.autoRenew ? '未来扣款已重新计入预测。' : '自动续费仍为关闭状态，不计入未来预测。')
  }
}
function markDistinct(id: string) {
  store.setDuplicateState(id, 'distinct')
  notify('已标记为不同服务', 'success', '该记录不再参与动态重复候选分组，可随时在详情中恢复候选。')
}
function renewalTiming(date: string) {
  const days = daysUntil(date)
  return days === 0 ? '今天' : days === 1 ? '明天' : `${days} 天后`
}
</script>

<template>
  <div>
    <PageHeader eyebrow="隐形消费识别" title="知道每一笔钱为何继续发生" description="从真实订阅记录展开续费日程，预测周期支出并核对相似服务。候选与建议都不是浪费结论，也不会代替你操作第三方账户。">
      <button class="btn-primary" @click="openCreate"><Plus :size="16" />新增订阅</button>
    </PageHeader>

    <p v-if="otherCurrencyCount" class="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-800">当前摘要按 {{ currency }} 统计；另有 {{ otherCurrencyCount }} 条其他币种记录不使用固定汇率换算，请在列表或详情中查看原币金额。</p>

    <section class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="订阅支出摘要">
      <div class="card p-5"><div class="flex items-center gap-2 text-xs font-medium text-muted"><WalletCards :size="15" class="text-brand" />每月等值支出</div><p class="numeric mt-3 text-2xl font-bold tracking-[-0.035em] text-ink">{{ formatCurrency(store.monthlySpending, currency) }}</p><p class="mt-2 text-xs text-muted">季付除以 3，年付除以 12</p></div>
      <div class="card p-5"><div class="flex items-center gap-2 text-xs font-medium text-muted"><CalendarClock :size="15" class="text-warning" />未来 30 天预计续费</div><p class="numeric mt-3 text-2xl font-bold tracking-[-0.035em] text-ink">{{ formatCurrency(upcomingTotal, currency) }}</p><p class="mt-2 text-xs text-muted">{{ upcoming.length }} 次排定扣款，含第 30 天</p></div>
      <div class="card p-5"><div class="flex items-center gap-2 text-xs font-medium text-muted"><TrendingUp :size="15" class="text-success" />未来 12 个自然月预测</div><p class="numeric mt-3 text-2xl font-bold tracking-[-0.035em] text-ink">{{ formatCurrency(annualSpending, currency) }}</p><p class="mt-2 text-xs text-muted">含本月剩余，按实际周期逐次展开</p></div>
      <div class="card p-5"><div class="flex items-center gap-2 text-xs font-medium text-muted"><Repeat2 :size="15" class="text-brand" />重复候选组</div><p class="numeric mt-3 text-2xl font-bold tracking-[-0.035em] text-ink">{{ duplicateGroups.length }}</p><p class="mt-2 text-xs text-muted">{{ billableSubscriptions.length }} 条记录计入未来预测</p></div>
    </section>

    <section v-if="highCost.length" class="card mt-5 border-orange-200 bg-orange-50/50 p-5 sm:p-6" aria-labelledby="high-cost-title"><div class="flex items-center gap-2"><CircleAlert :size="18" class="text-warning" /><h2 id="high-cost-title" class="section-title">高额记录复核提示</h2><BaseBadge label="动态阈值" tone="warning" /></div><p class="mt-1 text-xs text-muted">提示线为同币种有效自动续费记录的每月等值平均值与中位数 1.5 倍中的较高者。</p><div class="mt-4 grid gap-3 lg:grid-cols-2"><article v-for="item in highCost" :key="item.subscription.id" class="rounded-xl border border-orange-100 bg-white p-4"><div class="flex items-start justify-between gap-3"><div><RouterLink :to="`/subscriptions/${item.subscription.id}`" class="text-sm font-semibold text-ink hover:text-brand">{{ item.subscription.service }}</RouterLink><p class="mt-1 text-xs text-muted">每月等值 {{ formatCurrency(item.monthlyEquivalent, currency) }} · 提示线 {{ formatCurrency(item.threshold, currency) }}</p></div><BaseBadge label="建议复核" tone="warning" /></div><p class="mt-3 text-xs leading-5 text-muted">{{ item.reason }}</p></article></div></section>

    <div class="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(320px,1fr)]">
      <section class="card p-5 sm:p-6"><div><h2 class="section-title">周期性消费趋势</h2><p class="mt-1 text-xs text-muted">未来 12 个自然月的排定扣款，不是历史消费或固定年化数字。</p></div><EChart v-if="billableSubscriptions.length" :option="trendOption" label="未来十二个自然月订阅扣款预测折线图" /><div v-if="billableSubscriptions.length" class="sr-only">{{ trend.map((point) => `${point.month} ${formatCurrency(point.amount, currency)}`).join('，') }}</div><EmptyState v-else title="暂无周期预测" description="新增有效自动续费记录后，按实际日期与周期生成趋势。"><button class="btn-primary" @click="openCreate">新增订阅</button></EmptyState></section>
      <section class="card p-5 sm:p-6"><div><h2 class="section-title">每月等值构成</h2><p class="mt-1 text-xs text-muted">用于比较周期负担，不代表本月实际扣款。</p></div><EChart v-if="categoryData.length" :option="pieOption" label="有效订阅每月等值支出构成饼图" /><div v-if="categoryData.length" class="sr-only">{{ categoryData.map((item) => `${item.name} ${formatCurrency(item.value, currency)}`).join('，') }}</div><EmptyState v-else title="暂无支出构成" description="当前币种没有有效自动续费记录。" /></section>
    </div>

    <section class="card mt-5 overflow-hidden" aria-labelledby="renewal-timeline-title"><div class="border-b border-line px-5 py-4 sm:px-6"><h2 id="renewal-timeline-title" class="section-title">未来 30 天续费时间轴</h2><p class="mt-1 text-xs text-muted">由下次续费日和月、季、年周期展开；暂停、取消和未开启自动续费的记录不会出现。</p></div><div v-if="upcoming.length" class="p-5 sm:p-6"><ol class="space-y-0"><li v-for="event in upcoming" :key="event.id" class="relative flex gap-4 border-l border-line pb-5 pl-5 last:pb-0"><span class="absolute -left-[5px] top-1.5 size-2.5 rounded-full bg-brand ring-4 ring-indigo-50" /><div class="w-20 shrink-0"><p class="text-xs font-semibold text-ink">{{ formatDate(event.date) }}</p><p class="mt-1 text-[11px] text-muted">{{ renewalTiming(event.date) }}</p></div><div class="min-w-0 flex-1"><RouterLink :to="`/subscriptions/${event.subscriptionId}`" class="text-sm font-semibold text-ink hover:text-brand">{{ event.service }}</RouterLink><p class="mt-1 text-xs text-muted">{{ billingCycleLabels[event.cycle] }} · 本次排定扣款</p></div><p class="numeric shrink-0 text-sm font-semibold text-ink">{{ formatCurrency(event.amount, event.currency) }}</p></li></ol></div><EmptyState v-else title="未来 30 天没有排定续费" description="可新增记录，或检查现有记录的续费日期、状态和自动续费开关。"><button class="btn-secondary" @click="openCreate">新增订阅</button></EmptyState></section>

    <section v-if="duplicateGroups.length" class="card mt-5 overflow-hidden" aria-labelledby="duplicate-title"><div class="border-b border-line px-5 py-4 sm:px-6"><div class="flex flex-wrap items-center gap-2"><h2 id="duplicate-title" class="section-title">相似服务，需要你判断</h2><BaseBadge label="候选，非结论" tone="warning" /></div><p class="mt-1 text-xs text-muted">仅展示分组依据，不自动认定重复、合并或取消。</p></div><div :class="['grid gap-5 p-5 sm:p-6', duplicateGroups.length > 1 ? 'lg:grid-cols-2' : '']"><article v-for="group in duplicateGroups" :key="group.id" class="rounded-xl border border-line p-4"><div class="flex items-start justify-between gap-3"><h3 class="text-sm font-semibold text-ink">{{ group.category }} · {{ group.subscriptions.length }} 条记录</h3><p class="numeric text-xs font-semibold text-brand">{{ formatCurrency(group.monthlyEquivalentTotal, group.currency) }}/月等值</p></div><ul class="mt-3 space-y-1.5"><li v-for="reason in group.reasons" :key="reason" class="flex gap-2 text-xs leading-5 text-muted"><span class="mt-2 size-1 shrink-0 rounded-full bg-warning" />{{ reason }}</li></ul><div class="mt-4 space-y-3 border-t border-line pt-4"><div v-for="item in group.subscriptions" :key="item.id" class="flex flex-col gap-3 rounded-lg bg-canvas p-3 sm:flex-row sm:items-center"><div class="min-w-0 flex-1"><RouterLink :to="`/subscriptions/${item.id}`" class="text-sm font-semibold text-ink hover:text-brand">{{ item.service }}</RouterLink><p class="mt-1 text-xs text-muted">{{ formatCurrency(item.amount, item.currency) }}/{{ billingCycleLabels[item.cycle] }} · {{ item.notes || '未填写权益说明' }}</p></div><button class="btn-secondary min-h-9 shrink-0 px-3 py-1.5 text-xs" @click="markDistinct(item.id)"><Check :size="14" />并不重复</button></div></div></article></div></section>

    <section v-if="suggestions.length" class="card mt-5 p-5 sm:p-6" aria-labelledby="suggestions-title"><div class="flex items-center gap-2"><Lightbulb :size="18" class="text-brand" /><h2 id="suggestions-title" class="section-title">可采取的节省开支建议</h2></div><p class="mt-1 text-xs text-muted">金额是候选记录或排定扣款的参考值，只有实际操作并确认后才能记为节省。</p><div class="mt-4 grid gap-3 lg:grid-cols-2"><article v-for="suggestion in suggestions" :key="suggestion.id" class="rounded-xl border border-line p-4"><div class="flex items-start gap-3"><span :class="['mt-0.5 size-2 shrink-0 rounded-full', suggestion.kind === 'duplicate' ? 'bg-warning' : suggestion.kind === 'high-cost' ? 'bg-danger' : 'bg-brand']" /><div><h3 class="text-sm font-semibold leading-5 text-ink">{{ suggestion.title }}</h3><p class="mt-2 text-xs leading-5 text-muted">{{ suggestion.description }}</p><p v-if="suggestion.referenceAmount !== undefined" class="numeric mt-3 text-xs font-semibold text-brand">{{ suggestion.referenceLabel }}：{{ formatCurrency(suggestion.referenceAmount, suggestion.currency) }}</p><RouterLink :to="`/subscriptions/${suggestion.subscriptionIds[0]}`" class="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-brand">核对记录<ArrowRight :size="13" /></RouterLink></div></div></article></div></section>

    <section class="card mt-5 overflow-hidden" aria-labelledby="subscription-list-title"><div class="flex flex-col gap-3 border-b border-line px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6"><div><h2 id="subscription-list-title" class="section-title">订阅与周期消费</h2><p class="mt-1 text-xs text-muted">暂停和删除只改变 LifeGuard 本地记录，不代表第三方服务已取消。</p></div><label class="relative"><span class="sr-only">筛选订阅状态</span><select v-model="statusFilter" class="input min-h-9 w-full py-1.5 pr-9 sm:w-36"><option value="active">有效订阅</option><option value="paused">已暂停</option><option value="cancelled">已取消记录</option><option value="all">全部记录</option></select><ChevronDown :size="14" class="pointer-events-none absolute right-3 top-3 text-muted" /></label></div><div v-if="filteredSubscriptions.length" class="divide-y divide-line"><div v-for="item in filteredSubscriptions" :key="item.id" class="flex flex-col gap-4 px-5 py-4 lg:flex-row lg:items-center sm:px-6"><span :class="['flex size-10 shrink-0 items-center justify-center rounded-[10px] text-sm font-bold', item.status === 'active' ? 'bg-indigo-50 text-brand' : 'bg-slate-100 text-muted']">{{ item.service.slice(0, 1) }}</span><div class="min-w-0 flex-1"><div class="flex flex-wrap items-center gap-2"><RouterLink :to="`/subscriptions/${item.id}`" class="text-sm font-semibold text-ink hover:text-brand">{{ item.service }}</RouterLink><BaseBadge v-if="item.duplicateState === 'distinct'" label="已确认不同" tone="success" /><BaseBadge v-if="item.status === 'paused'" label="已暂停" /><BaseBadge v-if="item.status === 'cancelled'" label="已取消记录" /><BaseBadge v-if="item.status === 'active' && !item.autoRenew" label="未计预测" /></div><p class="mt-1 text-xs text-muted">{{ item.category }} · {{ billingCycleLabels[item.cycle] }} · {{ item.source === 'material' ? '材料确认' : item.source === 'manual' ? '手工新增' : '虚构演示' }}</p></div><div class="grid grid-cols-2 gap-4 lg:w-[280px]"><div><p class="text-xs text-muted">每次 / 每月等值</p><p class="numeric mt-1 text-sm font-semibold text-ink">{{ formatCurrency(item.amount, item.currency) }} <span class="font-normal text-muted">/ {{ formatCurrency(monthlyEquivalent(item), item.currency) }}</span></p></div><div><p class="text-xs text-muted">下次续费</p><p class="mt-1 text-xs font-medium text-ink">{{ formatDate(item.nextRenewal, true) }}</p></div></div><div class="flex shrink-0 flex-wrap gap-2"><button class="btn-ghost min-h-9 px-3 py-1.5 text-xs" @click="openEdit(item)"><Pencil :size="14" />编辑</button><button class="btn-secondary min-h-9 px-3 py-1.5 text-xs" @click="togglePause(item)"><component :is="item.status === 'active' ? PauseCircle : PlayCircle" :size="14" />{{ item.status === 'active' ? '暂停跟踪' : '恢复跟踪' }}</button><RouterLink :to="`/subscriptions/${item.id}`" class="btn-ghost min-h-9 px-3 py-1.5 text-xs">详情<ArrowRight :size="14" /></RouterLink></div></div></div><EmptyState v-else title="没有符合条件的订阅" description="切换状态筛选查看其他记录，或新增一条已核实的订阅。"><button class="btn-secondary" @click="statusFilter = 'all'">查看全部</button><button class="btn-primary" @click="openCreate">新增订阅</button></EmptyState></section>

    <SubscriptionFormModal :open="formOpen" :subscription="editing" @close="formOpen = false" />
  </div>
</template>
