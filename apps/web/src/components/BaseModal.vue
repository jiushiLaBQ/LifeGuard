<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { X } from 'lucide-vue-next'

const props = withDefaults(defineProps<{
  open: boolean
  title: string
  description?: string
  variant?: 'center' | 'drawer'
  wide?: boolean
}>(), { variant: 'center', wide: false })
const emit = defineEmits<{ close: [] }>()
const panel = ref<HTMLElement>()
let previousFocus: HTMLElement | null = null

watch(() => props.open, async (open) => {
  if (open) {
    previousFocus = document.activeElement as HTMLElement
    document.body.style.overflow = 'hidden'
    await nextTick()
    panel.value?.focus()
  } else {
    document.body.style.overflow = ''
    previousFocus?.focus()
  }
})

onBeforeUnmount(() => { document.body.style.overflow = '' })

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') emit('close')
  if (event.key !== 'Tab' || !panel.value) return
  const focusable = Array.from(panel.value.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex="0"]'))
  if (!focusable.length) return
  const first = focusable[0]
  const last = focusable[focusable.length - 1]
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault()
    first.focus()
  }
}
</script>

<template>
  <Teleport to="body">
    <Transition name="modal">
      <div v-if="open" :class="['fixed inset-0 z-[80] flex bg-slate-950/30 backdrop-blur-[2px]', variant === 'drawer' ? 'justify-end' : 'items-center justify-center p-4 sm:p-6']" @mousedown.self="emit('close')">
        <section
          ref="panel"
          role="dialog"
          aria-modal="true"
          :aria-label="title"
          tabindex="-1"
          :class="['flex max-h-[92vh] flex-col overflow-hidden bg-white shadow-2xl outline-none', variant === 'drawer' ? 'h-full w-full max-w-[560px] rounded-l-2xl' : 'w-full rounded-2xl', variant === 'center' && wide ? 'max-w-3xl' : variant === 'center' ? 'max-w-lg' : '']"
          @keydown="onKeydown"
        >
          <header class="flex items-start gap-4 border-b border-line px-5 py-5 sm:px-6">
            <div class="min-w-0 flex-1">
              <h2 class="text-lg font-semibold tracking-[-0.02em] text-ink">{{ title }}</h2>
              <p v-if="description" class="mt-1.5 text-sm leading-5 text-muted">{{ description }}</p>
            </div>
            <button class="icon-btn -mr-2 -mt-2" aria-label="关闭弹窗" @click="emit('close')"><X :size="19" /></button>
          </header>
          <div class="scrollbar-thin flex-1 overflow-y-auto px-5 py-5 sm:px-6"><slot /></div>
          <footer v-if="$slots.footer" class="flex flex-wrap justify-end gap-2 border-t border-line bg-slate-50/70 px-5 py-4 sm:px-6"><slot name="footer" /></footer>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.modal-enter-active, .modal-leave-active { transition: opacity 0.16s ease; }
.modal-enter-from, .modal-leave-to { opacity: 0; }
</style>
