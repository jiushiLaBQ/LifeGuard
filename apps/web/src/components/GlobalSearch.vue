<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { FileText, Repeat2, Search } from 'lucide-vue-next'
import BaseModal from '@/components/BaseModal.vue'
import EmptyState from '@/components/EmptyState.vue'
import { matterTypeLabels } from '@/shared/ui/format'
import { useDemoStore } from '@/stores/demo'
import { useUiStore } from '@/stores/ui'

const store = useDemoStore()
const ui = useUiStore()
const query = ref('')
const input = ref<HTMLInputElement>()
watch(() => ui.searchOpen, async (open) => { if (open) { query.value = ''; await nextTick(); input.value?.focus() } })

const results = computed(() => {
  const term = query.value.trim().toLowerCase()
  if (!term) return []
  const matterResults = store.matters.filter((item) => `${item.title}${item.merchant}${matterTypeLabels[item.type]}`.toLowerCase().includes(term)).map((item) => ({ id: item.id, title: item.title, meta: `${matterTypeLabels[item.type]} · ${item.merchant}`, to: `/matters/${item.id}`, kind: 'matter' }))
  const materialResults = store.materials.filter((item) => item.name.toLowerCase().includes(term)).map((item) => ({ id: item.id, title: item.name, meta: '生活材料', to: `/materials?material=${item.id}`, kind: 'material' }))
  const subscriptionResults = store.subscriptions.filter((item) => `${item.service}${item.category}`.toLowerCase().includes(term)).map((item) => ({ id: item.id, title: item.service, meta: `周期订阅 · ${item.category}`, to: `/subscriptions/${item.id}`, kind: 'subscription' }))
  return [...matterResults, ...materialResults, ...subscriptionResults].slice(0, 10)
})
</script>

<template>
  <BaseModal :open="ui.searchOpen" title="搜索工作区" description="查找事项、材料或周期订阅。" @close="ui.searchOpen = false">
    <div class="relative"><Search class="absolute left-3 top-3 text-muted" :size="18" /><input ref="input" v-model="query" class="input pl-10" placeholder="输入名称、商家或类别…" /></div>
    <div class="mt-3">
      <div v-if="!query" class="py-6 text-center text-sm text-muted">输入关键词开始搜索</div>
      <EmptyState v-else-if="!results.length" title="没有匹配结果" description="试试更短的关键词，或检查是否在其他分类中。" />
      <div v-else class="space-y-1">
        <RouterLink v-for="result in results" :key="`${result.kind}-${result.id}`" :to="result.to" class="flex items-center gap-3 rounded-xl px-3 py-3 hover:bg-canvas" @click="ui.searchOpen = false">
          <span class="flex size-9 items-center justify-center rounded-lg bg-canvas text-muted"><FileText v-if="result.kind === 'material'" :size="17" /><Repeat2 v-else-if="result.kind === 'subscription'" :size="17" /><Search v-else :size="17" /></span>
          <span class="min-w-0"><span class="block truncate text-sm font-medium text-ink">{{ result.title }}</span><span class="mt-0.5 block truncate text-xs text-muted">{{ result.meta }}</span></span>
        </RouterLink>
      </div>
    </div>
  </BaseModal>
</template>
