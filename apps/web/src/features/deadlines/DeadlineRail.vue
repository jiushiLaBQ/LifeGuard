<script setup lang="ts">
import { computed } from 'vue'
import type { Matter } from '@/types'
import { daysUntil, formatDate, matterTypeLabels } from '@/shared/ui/format'

const props = defineProps<{ matters: Matter[] }>()
const items = computed(() => props.matters.filter((item) => item.status === 'active' && item.dueDate && daysUntil(item.dueDate) >= 0 && daysUntil(item.dueDate) <= 30).slice(0, 5))
</script>

<template>
  <div v-if="items.length" class="rail-grid relative mt-6 grid gap-3" :style="{ gridTemplateColumns: `repeat(${items.length}, minmax(120px, 1fr))` }">
    <div class="rail-line" aria-hidden="true" />
    <RouterLink v-for="(item, index) in items" :key="item.id" :to="`/matters/${item.id}`" class="group relative z-10 min-w-0 pt-7">
      <span :class="['absolute left-0 top-[3px] size-3 rounded-full border-2 border-white ring-1', index === 0 ? 'bg-warning ring-orange-200' : 'bg-brand ring-indigo-200']" />
      <p class="text-xs font-semibold" :class="daysUntil(item.dueDate) <= 2 ? 'text-warning' : 'text-brand'">{{ daysUntil(item.dueDate) === 0 ? '今天' : formatDate(item.dueDate) }}</p>
      <p class="mt-1.5 truncate text-sm font-medium text-ink group-hover:text-brand">{{ item.title }}</p>
      <p class="mt-1 truncate text-xs text-muted">{{ matterTypeLabels[item.type] }}</p>
    </RouterLink>
  </div>
</template>

<style scoped>
.rail-line { position: absolute; left: 5px; right: 12px; top: 8px; height: 1px; background: #dfe4ed; }
@media (max-width: 640px) {
  .rail-grid { display: flex !important; flex-direction: column; gap: 0; margin-left: 4px; }
  .rail-line { left: 5px; right: auto; top: 12px; bottom: 20px; width: 1px; height: auto; }
  .rail-grid a { padding: 0 0 20px 26px; }
  .rail-grid a > span { left: 0; top: 3px; }
}
</style>
