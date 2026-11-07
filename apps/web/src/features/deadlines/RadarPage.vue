<script setup lang="ts">
import { computed, ref } from 'vue'
import { CalendarDays, ChevronRight, Filter, Repeat2, Search, X } from 'lucide-vue-next'
import PageHeader from '@/components/PageHeader.vue'
import BaseBadge from '@/components/BaseBadge.vue'
import EmptyState from '@/components/EmptyState.vue'
import { useDemoStore } from '@/stores/demo'
import { useUiStore } from '@/stores/ui'
import { billingCycleLabels, daysUntil, formatCurrency, formatDate, matterTypeLabels, relativeDeadline, riskLabels } from '@/shared/ui/format'
import type { MatterStatus, MatterType } from '@/types'

const store = useDemoStore()
const ui = useUiStore()
const query = ref('')
const type = ref<'all' | MatterType>('all')
const windowFilter = ref<'all' | 'overdue' | '7' | '30'>('30')
const status = ref<'all' | MatterStatus>('active')
const filtered = computed(() => store.matters.filter((item) => {
  const text = `${item.title}${item.merchant}`.toLowerCase()
  const days = daysUntil(item.dueDate)
  const inWindow = windowFilter.value === 'all' || (windowFilter.value === 'overdue' ? item.status === 'active' && days < 0 : days >= 0 && days <= Number(windowFilter.value))
  return text.includes(query.value.trim().toLowerCase()) && (type.value === 'all' || item.type === type.value) && (status.value === 'all' || item.status === status.value) && inWindow
}).sort((a, b) => (a.dueDate ?? '9999-12-31').localeCompare(b.dueDate ?? '9999-12-31')))
const reminders = computed(() => store.upcomingRenewals.filter((event) => {
  const days = daysUntil(event.date)
  const inWindow = windowFilter.value === 'all' || (windowFilter.value === '7' ? days <= 7 : windowFilter.value === '30' ? days <= 30 : false)
  return event.service.toLowerCase().includes(query.value.trim().toLowerCase()) && inWindow
}))
const hasFilters = computed(() => query.value || type.value !== 'all' || windowFilter.value !== '30' || status.value !== 'active')
function resetFilters() { query.value = ''; type.value = 'all'; windowFilter.value = '30'; status.value = 'active' }
</script>

<template>
  <div>
    <PageHeader eyebrow="期限雷达" title="看见接下来要发生的事" description="此页仍按日期查看期限；优先级分综合五个因素，未核实信息会单独标记，不替你做确定判断。">
      <button class="btn-primary" @click="ui.matterOpen = true"><CalendarDays :size="16" />添加期限</button>
    </PageHeader>

    <section class="card p-4 sm:p-5" aria-label="期限筛选">
      <div class="grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(240px,1.5fr)_repeat(3,minmax(150px,1fr))]">
        <label class="relative"><span class="sr-only">搜索期限</span><Search :size="16" class="absolute left-3 top-3.5 text-muted" /><input v-model="query" class="input pl-9" placeholder="搜索事项或商家" /></label>
        <label><span class="sr-only">事项类型</span><select v-model="type" class="input"><option value="all">全部类型</option><option v-for="(label, key) in matterTypeLabels" :key="key" :value="key">{{ label }}</option></select></label>
        <label><span class="sr-only">时间范围</span><select v-model="windowFilter" class="input"><option value="7">未来 7 天</option><option value="30">未来 30 天</option><option value="all">全部日期</option><option value="overdue">已逾期</option></select></label>
        <label><span class="sr-only">事项状态</span><select v-model="status" class="input"><option value="active">进行中</option><option value="completed">已完成</option><option value="all">全部状态</option></select></label>
      </div>
      <div class="mt-3 flex items-center justify-between gap-3 text-xs text-muted"><span class="inline-flex items-center gap-1.5"><Filter :size="14" />找到 {{ filtered.length }} 条记录</span><button v-if="hasFilters" class="inline-flex items-center gap-1 font-medium text-brand" @click="resetFilters"><X :size="13" />重置筛选</button></div>
    </section>

    <section v-if="reminders.length" class="card mt-5 p-4 sm:p-5" aria-label="订阅续费提醒">
      <div class="flex flex-wrap items-center justify-between gap-2"><h2 class="flex items-center gap-2 text-sm font-semibold text-ink"><Repeat2 :size="16" class="text-brand" />订阅续费提醒 <BaseBadge :label="`${reminders.length} 笔`" tone="brand" /></h2><RouterLink to="/spending" class="text-xs font-semibold text-brand">管理订阅记录</RouterLink></div>
      <p class="mt-1 text-xs leading-5 text-muted">由有效且开启自动续费的订阅记录实时计算；暂停、取消或关闭自动续费的记录不会出现。已有待处理续费事项的记录不重复提醒。</p>
      <div class="mt-3 space-y-2">
        <RouterLink v-for="event in reminders" :key="event.id" :to="`/subscriptions/${event.subscriptionId}`" class="flex flex-col gap-2 rounded-xl border border-line p-3 transition-colors hover:border-indigo-200 sm:flex-row sm:items-center sm:gap-4">
          <div class="flex items-center gap-3 sm:w-[100px] sm:shrink-0 sm:flex-col sm:items-start"><span class="numeric text-sm font-bold text-ink">{{ formatDate(event.date) }}</span><span class="text-xs font-semibold text-muted">{{ relativeDeadline(event.date) }}</span></div>
          <div class="min-w-0 flex-1"><div class="flex flex-wrap items-center gap-2"><BaseBadge label="订阅续费" tone="brand" /><BaseBadge :label="billingCycleLabels[event.cycle]" /></div><p class="mt-1.5 truncate text-sm font-semibold text-ink">{{ event.service }}</p></div>
          <p class="numeric shrink-0 text-sm font-semibold text-ink">{{ formatCurrency(event.amount, event.currency) }}</p>
        </RouterLink>
      </div>
    </section>

    <section v-if="filtered.length" class="mt-5 space-y-3" aria-label="期限时间轴">
      <RouterLink v-for="item in filtered" :key="item.id" :to="`/matters/${item.id}`" class="card group relative flex flex-col gap-4 p-4 transition-colors hover:border-indigo-200 sm:flex-row sm:items-center sm:gap-5 sm:p-5">
        <div class="flex items-center gap-3 sm:w-[100px] sm:shrink-0 sm:flex-col sm:items-start"><span class="numeric text-lg font-bold tracking-[-0.03em] text-ink">{{ formatDate(item.dueDate) }}</span><span :class="['text-xs font-semibold', item.status === 'completed' ? 'text-success' : daysUntil(item.dueDate) <= 2 ? 'text-danger' : 'text-muted']">{{ item.status === 'completed' ? '已完成' : relativeDeadline(item.dueDate) }}</span></div>
        <div class="hidden h-12 w-px bg-line sm:block" />
        <div class="min-w-0 flex-1"><div class="flex flex-wrap items-center gap-2"><BaseBadge :label="matterTypeLabels[item.type]" tone="brand" /><BaseBadge :label="item.status === 'completed' ? '已完成' : `${item.assessment?.score ?? 0} 分 · ${riskLabels[item.risk]}`" :tone="item.status === 'completed' ? 'success' : item.risk === 'urgent' ? 'danger' : item.risk === 'high' ? 'warning' : 'neutral'" /></div><h2 class="mt-2.5 text-base font-semibold text-ink group-hover:text-brand">{{ item.title }}</h2><p class="mt-1 text-sm text-muted">{{ item.merchant }} · {{ item.nextAction }}</p></div>
        <div class="flex items-center justify-between gap-4 sm:block sm:text-right"><div><p class="text-xs text-muted">涉及金额</p><p class="numeric mt-1 text-base font-semibold text-ink">{{ formatCurrency(item.amount) }}</p></div><ChevronRight :size="18" class="text-slate-400 sm:ml-auto sm:mt-3" /></div>
      </RouterLink>
    </section>
    <div v-else class="card mt-5"><EmptyState title="没有符合条件的期限" description="调整筛选条件，或添加一个已确认日期的生活事项。"><button v-if="hasFilters" class="btn-secondary" @click="resetFilters">重置筛选</button><button v-else class="btn-primary" @click="ui.matterOpen = true">新建事项</button></EmptyState></div>
  </div>
</template>
