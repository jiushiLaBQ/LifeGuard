<script setup lang="ts">
import { ShieldCheck } from 'lucide-vue-next'

withDefaults(defineProps<{ compact?: boolean }>(), { compact: false })
</script>

<template>
  <RouterLink to="/dashboard" class="inline-flex items-center gap-2.5" aria-label="知悉 LifeGuard 首页">
    <span class="flex size-9 items-center justify-center rounded-[11px] bg-brand text-white shadow-sm">
      <ShieldCheck :size="20" :stroke-width="2.2" />
    </span>
    <span v-if="!compact" class="leading-none">
      <span class="block text-[17px] font-bold tracking-[-0.03em] text-ink">知悉</span>
      <span class="mt-1 block text-[9px] font-semibold tracking-[0.16em] text-muted uppercase">LifeGuard</span>
    </span>
  </RouterLink>
</template>
