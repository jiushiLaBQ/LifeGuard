<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ArrowRight, CalendarCheck2, Check, FileCheck2, LockKeyhole, PlayCircle, ScanLine, ShieldCheck, Sparkles } from 'lucide-vue-next'
import AppLogo from '@/components/AppLogo.vue'
import BaseBadge from '@/components/BaseBadge.vue'
import BaseModal from '@/components/BaseModal.vue'
import { useDemoStore } from '@/stores/demo'
import { daysUntil, formatCurrency, relativeDeadline } from '@/shared/ui/format'
import { useToast } from '@/shared/ui/useToast'

const router = useRouter()
const store = useDemoStore()
const { notify } = useToast()
const confirmOpen = ref(false)
const headphones = computed(() => store.getMatter('matter-headphones'))
const video = computed(() => store.getMatter('matter-video'))
const urgentCount = computed(() => store.activeMatters.filter((matter) => daysUntil(matter.dueDate) >= 0 && daysUntil(matter.dueDate) <= 2).length)
const todayLabel = new Intl.DateTimeFormat('zh-CN', { dateStyle: 'full' }).format(new Date())
const hasUserRecords = computed(() => [...store.matters, ...store.subscriptions, ...store.materials].some((item) => item.source !== 'demo'))

function loadDemo() {
  if (hasUserRecords.value) confirmOpen.value = true
  else applyDemo()
}
function applyDemo() {
  confirmOpen.value = false
  store.resetDemo()
  notify('竞赛演示已加载', 'success', '三组虚构案例已就绪：建议先在材料中心确认键盘订单截图。')
  router.push('/dashboard')
}
</script>

<template>
  <div class="min-h-screen bg-white">
    <header class="mx-auto flex h-[76px] max-w-7xl items-center px-5 sm:px-8">
      <AppLogo />
      <nav class="ml-auto hidden items-center gap-7 text-sm text-muted sm:flex" aria-label="欢迎页导航"><a href="#workflow" class="hover:text-ink">工作方式</a><a href="#demo" class="hover:text-ink">竞赛演示</a><a href="#privacy" class="hover:text-ink">隐私边界</a></nav>
      <RouterLink to="/dashboard" class="btn-secondary ml-4 sm:ml-8">进入演示<ArrowRight :size="15" /></RouterLink>
    </header>

    <main>
      <section class="mx-auto grid max-w-7xl items-center gap-14 px-5 pb-20 pt-12 sm:px-8 lg:grid-cols-[0.92fr_1.08fr] lg:pb-28 lg:pt-20">
        <div>
          <div class="inline-flex items-center gap-2 rounded-full border border-indigo-100 bg-indigo-50/70 px-3 py-1.5 text-xs font-medium text-brand"><ShieldCheck :size="14" />个人生活权益与风险智能管家</div>
          <h1 class="mt-7 max-w-xl text-[42px] font-bold leading-[1.13] tracking-[-0.055em] text-ink sm:text-[56px]">重要的期限，<br /><span class="text-brand">不再靠记忆。</span></h1>
          <p class="mt-6 max-w-lg text-base leading-8 text-muted sm:text-lg">让每一份消费凭证都有价值，让每一个重要期限都不被遗忘。知悉把零散材料转化为可确认、可执行、可复盘的生活事项。</p>
          <div class="mt-8 flex flex-wrap gap-3"><RouterLink to="/dashboard" class="btn-primary min-h-12 px-5">免登录体验完整演示<ArrowRight :size="17" /></RouterLink><a href="#workflow" class="btn-secondary min-h-12 px-5">查看工作方式</a></div>
          <div class="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted"><span class="inline-flex items-center gap-1.5"><Check :size="14" class="text-success" />无需注册</span><span class="inline-flex items-center gap-1.5"><Check :size="14" class="text-success" />虚构演示数据</span><span class="inline-flex items-center gap-1.5"><Check :size="14" class="text-success" />材料不离开浏览器</span></div>
        </div>

        <div class="relative mx-auto w-full max-w-[590px]">
          <div class="absolute -left-5 -top-5 size-20 rounded-2xl border border-indigo-100 bg-indigo-50/50" aria-hidden="true" />
          <div class="card relative overflow-hidden rounded-[20px] p-5 sm:p-7">
            <div class="flex items-center justify-between border-b border-line pb-5"><div><p class="text-xs font-medium text-muted">{{ todayLabel }}</p><h2 class="mt-1.5 text-xl font-semibold tracking-[-0.03em]">今天，先处理这 {{ urgentCount }} 件事</h2></div><span class="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-success">演示工作区 · 实时计算</span></div>
            <div v-if="headphones" class="mt-5 rounded-xl border border-orange-100 bg-orange-50/55 p-4">
              <div class="flex items-start gap-3"><span class="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-white text-warning shadow-sm"><CalendarCheck2 :size="18" /></span><div class="min-w-0 flex-1"><div class="flex flex-wrap items-center gap-2"><p class="text-sm font-semibold">{{ headphones.title }}</p><span class="text-xs font-medium text-warning">{{ relativeDeadline(headphones.dueDate) }}</span></div><p class="mt-1.5 text-xs leading-5 text-muted">可能涉及 {{ formatCurrency(headphones.amount, headphones.currency) }} · 下一步：{{ headphones.nextAction }}</p></div></div>
            </div>
            <div v-if="video" class="mt-3 rounded-xl border border-line p-4"><div class="flex items-start gap-3"><span class="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-brand"><Sparkles :size="18" /></span><div><p class="text-sm font-semibold">{{ video.title }}</p><p class="mt-1.5 text-xs text-muted">{{ relativeDeadline(video.dueDate) }} · {{ video.nextAction }}</p></div></div></div>
            <div v-if="!headphones && !video" class="mt-5 rounded-xl border border-dashed border-slate-300 p-5 text-center"><p class="text-sm text-muted">演示工作区当前为空。</p><button class="btn-primary mt-3" @click="loadDemo"><PlayCircle :size="15" />一键加载演示案例</button></div>
            <div class="mt-6"><div class="mb-3 flex items-center justify-between text-xs"><span class="font-medium text-muted">近期权益轨道</span><span>未来 30 天</span></div><div class="relative flex justify-between px-1 pb-1 pt-3"><span class="absolute left-2 right-2 top-[19px] h-px bg-line" /><span v-for="(label, index) in ['今天', '3 天', '7 天', '18 天', '30 天']" :key="label" class="relative z-10 flex flex-col items-center gap-2 text-[10px] text-muted"><span :class="['size-2.5 rounded-full ring-4 ring-white', index === 0 ? 'bg-warning' : index === 1 ? 'bg-brand' : 'bg-slate-300']" />{{ label }}</span></div></div>
            <div class="mt-5 flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2.5 text-xs text-muted"><LockKeyhole :size="14" class="text-success" />识别结果经你确认后，才进入正式期限与统计</div>
          </div>
        </div>
      </section>

      <section id="workflow" class="border-y border-line bg-canvas py-20">
        <div class="mx-auto max-w-7xl px-5 sm:px-8"><div class="max-w-2xl"><p class="eyebrow">闭环而非记事本</p><h2 class="mt-3 text-3xl font-bold tracking-[-0.04em]">从一张凭证，到一次有结果的行动</h2><p class="mt-3 text-sm leading-7 text-muted">每一步都保留证据和状态。AI 只提供候选，决定权始终在你。</p></div>
          <div class="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div v-for="(step, index) in [
              { icon: ScanLine, title: '材料进入', text: '图片、PDF 或手工记录统一进入材料中心。' },
              { icon: FileCheck2, title: '人工确认', text: '字段保留证据与可信状态，不确定就待确认。' },
              { icon: CalendarCheck2, title: '期限与行动', text: '规则计算优先级，生成可执行的材料和步骤清单。' },
              { icon: ShieldCheck, title: '完成与复盘', text: '记录真实处理结果，让每一次权益处置有迹可循。' },
            ]" :key="step.title" class="rounded-2xl border border-line bg-white p-5"><div class="flex items-center justify-between"><span class="flex size-10 items-center justify-center rounded-xl bg-indigo-50 text-brand"><component :is="step.icon" :size="19" /></span><span class="text-xs font-semibold text-slate-400">0{{ index + 1 }}</span></div><h3 class="mt-5 font-semibold">{{ step.title }}</h3><p class="mt-2 text-sm leading-6 text-muted">{{ step.text }}</p></div>
          </div>
        </div>
      </section>

      <section id="demo" class="mx-auto max-w-7xl px-5 py-20 sm:px-8">
        <div class="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div class="max-w-2xl"><p class="eyebrow">竞赛演示</p><h2 class="mt-3 text-3xl font-bold tracking-[-0.04em]">三组模拟案例，一条完整闭环</h2><p class="mt-3 text-sm leading-7 text-muted">以下案例全部为虚构模拟数据。加载后评分、期限与行动建议由规则引擎实时计算，不是预设答案；建议按 1 → 2 → 3 的顺序体验。</p></div>
          <button class="btn-primary min-h-12 shrink-0 px-5" @click="loadDemo"><PlayCircle :size="17" />一键加载演示案例</button>
        </div>
        <div class="mt-10 grid gap-4 lg:grid-cols-3">
          <article class="rounded-2xl border border-line bg-white p-5"><div class="flex items-center justify-between"><BaseBadge label="模拟数据 1" tone="brand" /><span class="text-xs font-semibold text-slate-400">网购订单</span></div><h3 class="mt-4 font-semibold">订单截图与退货事项</h3><p class="mt-2 text-sm leading-6 text-muted">降噪耳机退货期限紧迫；键盘订单截图停在待确认状态，等你核对字段后生成事项。</p><ol class="mt-4 space-y-2 text-xs leading-5 text-muted"><li>1. 材料中心确认键盘订单字段</li><li>2. 查看退货事项评分与评分原因</li><li>3. 勾选行动步骤并记录完成结果</li></ol></article>
          <article class="rounded-2xl border border-line bg-white p-5"><div class="flex items-center justify-between"><BaseBadge label="模拟数据 2" tone="brand" /><span class="text-xs font-semibold text-slate-400">电子产品</span></div><h3 class="mt-4 font-semibold">保修临期与检测准备</h3><p class="mt-2 text-sm leading-6 text-muted">平板电脑保修即将结束，电子发票已确认并关联事项，可查看来源与证据链。</p><ol class="mt-4 space-y-2 text-xs leading-5 text-muted"><li>1. 打开保修事项查看五维评分</li><li>2. 核对信息来源与确认状态</li><li>3. 按检测清单准备发票与故障证据</li></ol></article>
          <article class="rounded-2xl border border-line bg-white p-5"><div class="flex items-center justify-between"><BaseBadge label="模拟数据 3" tone="brand" /><span class="text-xs font-semibold text-slate-400">会员订阅</span></div><h3 class="mt-4 font-semibold">自动续费与隐形消费</h3><p class="mt-2 text-sm leading-6 text-muted">视频会员即将扣款；笔记与文档服务构成重复候选，只给依据、不替你判定浪费。</p><ol class="mt-4 space-y-2 text-xs leading-5 text-muted"><li>1. 期限雷达查看订阅续费提醒</li><li>2. 消费分析查看月度与年度预测</li><li>3. 暂停或恢复订阅观察统计变化</li></ol></article>
        </div>
      </section>

      <section id="privacy" class="mx-auto flex max-w-7xl flex-col items-start justify-between gap-6 px-5 py-16 sm:px-8 md:flex-row md:items-center"><div class="max-w-2xl"><p class="eyebrow">透明的演示边界</p><h2 class="mt-3 text-2xl font-bold tracking-[-0.035em]">不伪造登录，也不伪装智能识别</h2><p class="mt-3 text-sm leading-7 text-muted">当前是免登录本地版。账户与外部模型服务尚未接入；图片和 PDF 优先在浏览器内解析，OCR 语言数据按需下载，文件内容不会上传。候选字段仍需你核对确认，所有预置内容均标注为演示样例。</p></div><RouterLink to="/dashboard" class="btn-primary shrink-0">进入演示工作区<ArrowRight :size="16" /></RouterLink></section>
    </main>
    <footer class="border-t border-line px-5 py-6 text-center text-xs text-muted">知悉 LifeGuard · Personal Life Guardian · 2026 Qoder 高校创造力大赛</footer>
    <BaseModal :open="confirmOpen" title="加载竞赛演示案例？" description="当前工作区包含你新增或修改的记录，加载会用三组虚构案例替换它们，此操作无法撤销。如需保留，请先在设置中导出 JSON。" @close="confirmOpen = false"><template #footer><button class="btn-secondary" @click="confirmOpen = false">取消</button><button class="btn-primary" @click="applyDemo">替换并加载</button></template></BaseModal>
  </div>
</template>
