<script setup lang="ts">
import { computed } from 'vue'
import { ArrowRight, CalendarClock, CheckCircle2, ChevronRight, CircleAlert, Clock3, FileCheck2, Plus, ReceiptText, ShieldCheck, Upload, WalletCards } from 'lucide-vue-next'
import PageHeader from '@/components/PageHeader.vue'
import BaseBadge from '@/components/BaseBadge.vue'
import EmptyState from '@/components/EmptyState.vue'
import DeadlineRail from '@/features/deadlines/DeadlineRail.vue'
import { useDemoStore } from '@/stores/demo'
import { useUiStore } from '@/stores/ui'
import { daysUntil, formatCurrency, formatTime, matterTypeLabels, relativeDeadline, riskLabels } from '@/shared/ui/format'

const store = useDemoStore()
const ui = useUiStore()
const firstName = computed(() => store.profile.name || '朋友')
const priorities = computed(() => store.activeMatters.slice(0, 4))
const deadlineMatters = computed(() => [...store.activeMatters].sort((a, b) => (a.dueDate ?? '9999-12-31').localeCompare(b.dueDate ?? '9999-12-31')))
const todayCount = computed(() => store.activeMatters.filter((item) => daysUntil(item.dueDate) === 0).length)
const stats = computed(() => [
  { label: '待处理事项', value: store.activeMatters.length, note: `${todayCount.value} 项今天截止`, icon: Clock3, tone: 'text-brand bg-indigo-50' },
  { label: '7 天内到期', value: store.weekDue.length, note: '按已确认期限统计', icon: CalendarClock, tone: 'text-warning bg-orange-50' },
  { label: '需要优先关注', value: store.riskMatters.length, note: '紧急与高风险事项', icon: CircleAlert, tone: 'text-danger bg-red-50' },
  { label: '每月周期支出', value: formatCurrency(store.monthlySpending, store.profile.currency), note: `${store.subscriptions.filter((item) => item.status === 'active').length} 个有效订阅`, icon: WalletCards, tone: 'text-success bg-emerald-50' },
])
const activityIcons = { confirm: FileCheck2, complete: CheckCircle2, upload: Upload, action: ShieldCheck, settings: ReceiptText }
</script>

<template>
  <div>
    <PageHeader eyebrow="今日工作台" :title="`${firstName}，先处理最值得优先投入的事`" description="综合期限、潜在损失、重要性、准备时间和信息可靠性排序。所有数字均来自当前演示工作区记录。">
      <button class="btn-secondary" @click="ui.matterOpen = true"><Plus :size="16" />新建事项</button>
      <button class="btn-primary" @click="ui.uploadOpen = true"><Upload :size="16" />上传材料</button>
    </PageHeader>

    <section class="card overflow-hidden" aria-labelledby="deadline-rail-title">
      <div class="flex flex-col gap-2 border-b border-line px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div>
          <div class="flex items-center gap-2"><h2 id="deadline-rail-title" class="section-title">近期权益轨道</h2><BaseBadge label="未来 30 天" tone="brand" /></div>
          <p class="mt-1 text-xs text-muted">从最近截止日开始，点击节点查看证据与行动。</p>
        </div>
        <RouterLink to="/radar" class="inline-flex items-center gap-1 text-sm font-semibold text-brand">完整期限雷达<ArrowRight :size="15" /></RouterLink>
      </div>
      <div class="px-5 pb-5 sm:px-6">
        <DeadlineRail :matters="deadlineMatters" />
        <EmptyState v-if="!store.activeMatters.length" title="近期没有待处理期限" description="上传一份材料或手工新建事项，确认日期后会出现在这里。">
          <button class="btn-primary" @click="ui.matterOpen = true"><Plus :size="16" />新建事项</button>
        </EmptyState>
      </div>
    </section>

    <section class="mt-5 grid grid-cols-2 gap-3 xl:grid-cols-4" aria-label="工作区摘要">
      <div v-for="stat in stats" :key="stat.label" class="card flex min-w-0 items-center gap-3 p-4 sm:gap-4 sm:p-5">
        <span :class="['hidden size-10 shrink-0 items-center justify-center rounded-[10px] sm:flex', stat.tone]"><component :is="stat.icon" :size="19" /></span>
        <div class="min-w-0"><p class="truncate text-xs font-medium text-muted">{{ stat.label }}</p><p class="numeric mt-1 truncate text-xl font-bold tracking-[-0.03em] text-ink sm:text-2xl">{{ stat.value }}</p><p class="mt-1 hidden truncate text-[11px] text-muted lg:block">{{ stat.note }}</p></div>
      </div>
    </section>

    <div class="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.65fr)_minmax(300px,1fr)]">
      <section class="card overflow-hidden" aria-labelledby="priority-title">
        <div class="flex items-center justify-between border-b border-line px-5 py-4 sm:px-6"><div><h2 id="priority-title" class="section-title">优先处理</h2><p class="mt-1 text-xs text-muted">按五维优先级排序；金额只占部分权重，信息缺口会明确提示。</p></div><BaseBadge :label="`${priorities.length} 项`" /></div>
        <div v-if="priorities.length" class="divide-y divide-line">
          <RouterLink v-for="item in priorities" :key="item.id" :to="`/matters/${item.id}`" class="group flex items-center gap-3 px-5 py-4 transition-colors hover:bg-slate-50 sm:px-6">
            <span :class="['size-2 shrink-0 rounded-full', item.risk === 'urgent' ? 'bg-danger' : item.risk === 'high' ? 'bg-warning' : 'bg-brand']" aria-hidden="true" />
            <div class="min-w-0 flex-1"><div class="flex flex-wrap items-center gap-2"><h3 class="truncate text-sm font-semibold text-ink group-hover:text-brand">{{ item.title }}</h3><BaseBadge :label="`${item.assessment?.score ?? 0} 分 · ${riskLabels[item.risk]}`" :tone="item.risk === 'urgent' ? 'danger' : item.risk === 'high' ? 'warning' : 'neutral'" /></div><p class="mt-1.5 truncate text-xs text-muted">{{ matterTypeLabels[item.type] }} · {{ item.nextAction }}</p></div>
            <div class="shrink-0 text-right"><p :class="['text-xs font-semibold', daysUntil(item.dueDate) <= 2 ? 'text-danger' : 'text-ink']">{{ relativeDeadline(item.dueDate) }}</p><p class="numeric mt-1 text-xs text-muted">{{ formatCurrency(item.amount) }}</p></div>
            <ChevronRight :size="16" class="hidden shrink-0 text-slate-400 sm:block" />
          </RouterLink>
        </div>
        <EmptyState v-else title="待办已经清空" description="新确认的事项会按五维优先级进入队列。" />
      </section>

      <section class="card overflow-hidden" aria-labelledby="activity-title">
        <div class="flex items-center justify-between border-b border-line px-5 py-4"><h2 id="activity-title" class="section-title">最近活动</h2><span class="text-xs text-muted">本地实时记录</span></div>
        <div v-if="store.activities.length" class="px-5 py-2">
          <div v-for="activity in store.activities.slice(0, 5)" :key="activity.id" class="flex gap-3 border-b border-line py-3.5 last:border-0">
            <span class="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-canvas text-muted"><component :is="activityIcons[activity.kind]" :size="15" /></span>
            <div class="min-w-0"><p class="text-sm font-medium text-ink">{{ activity.title }}</p><p class="mt-1 line-clamp-2 text-xs leading-5 text-muted">{{ activity.description }}</p><p class="mt-1 text-[11px] text-slate-400">{{ formatTime(activity.timestamp) }}</p></div>
          </div>
        </div>
        <EmptyState v-else title="还没有活动" description="上传、确认和完成操作会记录在这里。" />
      </section>
    </div>

    <section class="mt-5 flex flex-col gap-4 rounded-[14px] border border-indigo-100 bg-indigo-50/60 p-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
      <div class="flex gap-3"><span class="flex size-10 shrink-0 items-center justify-center rounded-[10px] bg-white text-brand"><Upload :size="19" /></span><div><h2 class="text-sm font-semibold text-ink">从生活材料开始</h2><p class="mt-1 text-xs leading-5 text-muted">图片或 PDF 在浏览器内解析；识别失败时仍可手工录入，确认前不会进入正式统计。</p></div></div>
      <button class="btn-primary shrink-0" @click="ui.uploadOpen = true">选择材料<ArrowRight :size="15" /></button>
    </section>
  </div>
</template>
