<script setup lang="ts">
withDefaults(defineProps<{
  label: string
  tone?: 'brand' | 'success' | 'warning' | 'danger' | 'neutral'
  dot?: boolean
}>(), { tone: 'neutral', dot: false })
</script>

<template>
  <span :class="['inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium', `badge-${tone}`]">
    <span v-if="dot" class="size-1.5 rounded-full bg-current" aria-hidden="true" />
    {{ label }}
  </span>
</template>

<style scoped>
.badge-brand { color: #4056d6; background: #eef0ff; }
.badge-success { color: #237b5a; background: #eaf6f0; }
.badge-warning { color: #a85810; background: #fff3e3; }
.badge-danger { color: #bd3f3f; background: #fff0ef; }
.badge-neutral { color: #667085; background: #f0f2f6; }
</style>
