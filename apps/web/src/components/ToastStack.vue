<script setup lang="ts">
import { CheckCircle2, CircleAlert, Info, X } from 'lucide-vue-next'
import { useToast } from '@/shared/ui/useToast'

const { toasts, dismiss } = useToast()
</script>

<template>
  <Teleport to="body">
    <div class="pointer-events-none fixed inset-x-4 top-4 z-[100] flex flex-col items-end gap-2 sm:left-auto sm:w-[380px]" aria-live="polite">
      <TransitionGroup name="toast">
        <div v-for="toast in toasts" :key="toast.id" class="pointer-events-auto flex w-full items-start gap-3 rounded-xl border border-line bg-white p-4 shadow-xl">
          <CheckCircle2 v-if="toast.tone === 'success'" class="mt-0.5 shrink-0 text-success" :size="19" />
          <CircleAlert v-else-if="toast.tone === 'error'" class="mt-0.5 shrink-0 text-danger" :size="19" />
          <Info v-else class="mt-0.5 shrink-0 text-brand" :size="19" />
          <div class="min-w-0 flex-1">
            <p class="text-sm font-semibold text-ink">{{ toast.title }}</p>
            <p v-if="toast.description" class="mt-1 text-xs leading-5 text-muted">{{ toast.description }}</p>
          </div>
          <button class="-mr-1 -mt-1 p-1 text-muted hover:text-ink" aria-label="关闭通知" @click="dismiss(toast.id)"><X :size="16" /></button>
        </div>
      </TransitionGroup>
    </div>
  </Teleport>
</template>

<style scoped>
.toast-enter-active, .toast-leave-active { transition: all 0.18s ease; }
.toast-enter-from, .toast-leave-to { opacity: 0; transform: translateY(-8px); }
</style>
