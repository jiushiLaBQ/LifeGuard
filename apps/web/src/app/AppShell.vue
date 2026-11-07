<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import { Bell, CalendarRange, ChartNoAxesCombined, ChevronRight, CircleUserRound, FileScan, LayoutDashboard, Menu, Plus, Search, ShieldCheck, Sparkles, Upload, X } from 'lucide-vue-next'
import AppLogo from '@/components/AppLogo.vue'
import BaseBadge from '@/components/BaseBadge.vue'
import GlobalSearch from '@/components/GlobalSearch.vue'
import UploadModal from '@/features/materials/UploadModal.vue'
import NewMatterModal from '@/features/matters/NewMatterModal.vue'
import { useDemoStore } from '@/stores/demo'
import { useUiStore } from '@/stores/ui'
import { useToast } from '@/shared/ui/useToast'

const route = useRoute()
const ui = useUiStore()
const store = useDemoStore()
const { notify } = useToast()
const navigation = [
  { to: '/dashboard', label: '今日概览', icon: LayoutDashboard },
  { to: '/materials', label: '材料中心', icon: FileScan, count: () => store.pendingMaterials.length },
  { to: '/radar', label: '期限雷达', icon: CalendarRange },
  { to: '/actions', label: '行动中心', icon: Sparkles },
  { to: '/spending', label: '消费分析', icon: ChartNoAxesCombined },
  { to: '/settings', label: '隐私与设置', icon: CircleUserRound },
]
const pageName = computed(() => route.meta.title ?? '知悉')
watch(() => route.fullPath, () => { ui.mobileNavOpen = false })
function onKeydown(event: KeyboardEvent) {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); ui.searchOpen = true }
}
onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <div class="min-h-screen bg-canvas">
    <a href="#main-content" class="fixed left-3 top-3 z-[110] -translate-y-20 rounded bg-brand px-3 py-2 text-white focus:translate-y-0">跳到主要内容</a>
    <div v-if="ui.mobileNavOpen" class="fixed inset-0 z-40 bg-slate-950/25 lg:hidden" @click="ui.mobileNavOpen = false" />
    <aside :class="['fixed inset-y-0 left-0 z-50 flex w-[238px] flex-col border-r border-line bg-white px-3.5 py-4 transition-transform lg:translate-x-0', ui.mobileNavOpen ? 'translate-x-0' : '-translate-x-full']">
      <div class="flex items-center justify-between px-2"><AppLogo /><button class="icon-btn lg:hidden" aria-label="关闭导航" @click="ui.mobileNavOpen = false"><X :size="19" /></button></div>
      <button class="btn-primary mt-6 w-full" @click="ui.matterOpen = true"><Plus :size="17" />新建生活事项</button>
      <nav class="mt-6 space-y-1" aria-label="主导航">
        <RouterLink v-for="item in navigation" :key="item.to" :to="item.to" class="group flex min-h-11 items-center gap-3 rounded-[9px] px-3 text-sm font-medium text-muted transition-colors hover:bg-canvas hover:text-ink" active-class="!bg-indigo-50 !text-brand">
          <component :is="item.icon" :size="18" :stroke-width="1.8" />
          <span class="flex-1">{{ item.label }}</span>
          <span v-if="item.count && item.count()" class="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-700">{{ item.count() }}</span>
        </RouterLink>
      </nav>
      <div class="mt-auto px-1.5">
        <div class="rounded-xl border border-line bg-canvas p-3.5">
          <div class="flex items-center gap-2"><ShieldCheck :size="16" class="text-success" /><span class="text-xs font-semibold text-ink">本地演示工作区</span></div>
          <p class="mt-2 text-xs leading-5 text-muted">数据仅保存在此浏览器。所有记录均为虚构样例。</p>
          <RouterLink to="/settings" class="mt-2.5 inline-flex items-center gap-1 text-xs font-semibold text-brand">查看数据边界<ChevronRight :size="13" /></RouterLink>
        </div>
        <p class="mt-4 px-2 text-[10px] font-medium tracking-[0.12em] text-slate-400 uppercase">LifeGuard · UI Preview 01</p>
      </div>
    </aside>

    <div class="lg:pl-[238px]">
      <header class="sticky top-0 z-30 flex h-[66px] items-center gap-3 border-b border-line/90 bg-white/95 px-4 backdrop-blur sm:px-6 lg:px-8">
        <button class="icon-btn lg:hidden" aria-label="打开导航" @click="ui.mobileNavOpen = true"><Menu :size="20" /></button>
        <div class="hidden items-center gap-2 text-sm text-muted sm:flex"><span>工作区</span><ChevronRight :size="14" /><span class="font-medium text-ink">{{ pageName }}</span></div>
        <div class="flex-1" />
        <button class="hidden h-9 w-[220px] items-center gap-2 rounded-lg border border-line bg-canvas px-3 text-sm text-muted md:flex" @click="ui.searchOpen = true"><Search :size="16" /><span class="flex-1 text-left">搜索工作区</span><kbd class="rounded border border-line bg-white px-1.5 text-[10px]">⌘ K</kbd></button>
        <button class="icon-btn md:hidden" aria-label="搜索" @click="ui.searchOpen = true"><Search :size="19" /></button>
        <button class="btn-secondary hidden sm:inline-flex" @click="ui.uploadOpen = true"><Upload :size="16" />上传材料</button>
        <button class="icon-btn" aria-label="查看待处理通知" @click="notify(`${store.weekDue.length} 项事项需要关注`, 'info', '已为你打开期限雷达'); $router.push('/radar')"><Bell :size="19" /><span v-if="store.weekDue.length" class="absolute ml-4 -mt-4 size-2 rounded-full bg-danger ring-2 ring-white" /></button>
        <BaseBadge label="演示" tone="brand" />
      </header>
      <main id="main-content" class="mx-auto w-full max-w-[1540px] p-4 sm:p-6 lg:p-8"><RouterView /></main>
    </div>
    <GlobalSearch />
    <UploadModal />
    <NewMatterModal />
  </div>
</template>
