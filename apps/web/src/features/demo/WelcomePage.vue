<script setup lang="ts">
import { ArrowRight, CalendarCheck2, Check, FileCheck2, LockKeyhole, ScanLine, ShieldCheck, Sparkles } from 'lucide-vue-next'
import AppLogo from '@/components/AppLogo.vue'
</script>

<template>
  <div class="min-h-screen bg-white">
    <header class="mx-auto flex h-[76px] max-w-7xl items-center px-5 sm:px-8">
      <AppLogo />
      <nav class="ml-auto hidden items-center gap-7 text-sm text-muted sm:flex" aria-label="欢迎页导航"><a href="#workflow" class="hover:text-ink">工作方式</a><a href="#privacy" class="hover:text-ink">隐私边界</a></nav>
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
            <div class="flex items-center justify-between border-b border-line pb-5"><div><p class="text-xs font-medium text-muted">2026 年 11 月 5 日 · 星期四</p><h2 class="mt-1.5 text-xl font-semibold tracking-[-0.03em]">今天，先处理这 2 件事</h2></div><span class="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-success">生活尽在掌握</span></div>
            <div class="mt-5 rounded-xl border border-orange-100 bg-orange-50/55 p-4">
              <div class="flex items-start gap-3"><span class="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-white text-warning shadow-sm"><CalendarCheck2 :size="18" /></span><div class="min-w-0 flex-1"><div class="flex flex-wrap items-center gap-2"><p class="text-sm font-semibold">降噪耳机退货</p><span class="text-xs font-medium text-warning">今天截止</span></div><p class="mt-1.5 text-xs leading-5 text-muted">可能涉及 ¥1,299 · 下一步：提交退货申请</p></div></div>
            </div>
            <div class="mt-3 rounded-xl border border-line p-4"><div class="flex items-start gap-3"><span class="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-brand"><Sparkles :size="18" /></span><div><p class="text-sm font-semibold">云享视频会员续费</p><p class="mt-1.5 text-xs text-muted">2 天后 · 检查是否保留自动续费</p></div></div></div>
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

      <section id="privacy" class="mx-auto flex max-w-7xl flex-col items-start justify-between gap-6 px-5 py-16 sm:px-8 md:flex-row md:items-center"><div class="max-w-2xl"><p class="eyebrow">透明的演示边界</p><h2 class="mt-3 text-2xl font-bold tracking-[-0.035em]">不伪造登录，也不伪装智能识别</h2><p class="mt-3 text-sm leading-7 text-muted">当前是免登录本地版。账户与外部模型服务尚未接入；图片和 PDF 优先在浏览器内解析，OCR 语言数据按需下载，文件内容不会上传。候选字段仍需你核对确认，所有预置内容均标注为演示样例。</p></div><RouterLink to="/dashboard" class="btn-primary shrink-0">进入演示工作区<ArrowRight :size="16" /></RouterLink></section>
    </main>
    <footer class="border-t border-line px-5 py-6 text-center text-xs text-muted">知悉 LifeGuard · Personal Life Guardian · 2026 Qoder 高校创造力大赛</footer>
  </div>
</template>
