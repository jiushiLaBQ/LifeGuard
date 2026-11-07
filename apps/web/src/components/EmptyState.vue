<script setup lang="ts">
import { Inbox } from 'lucide-vue-next'

defineProps<{ title: string; description: string }>()
</script>

<template>
  <div class="flex flex-col items-center px-6 py-12 text-center">
    <span class="mb-4 flex size-11 items-center justify-center rounded-xl bg-canvas text-muted"><Inbox :size="21" /></span>
    <h3 class="text-sm font-semibold text-ink">{{ title }}</h3>
    <p class="mt-1.5 max-w-sm text-sm leading-6 text-muted">{{ description }}</p>
    <div v-if="$slots.default" class="mt-5"><slot /></div>
  </div>
</template>
