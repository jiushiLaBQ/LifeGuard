import { readonly, ref } from 'vue'

export interface ToastMessage {
  id: number
  title: string
  description?: string
  tone: 'success' | 'error' | 'info'
}

const toasts = ref<ToastMessage[]>([])
let nextId = 1

export function useToast() {
  function dismiss(id: number) {
    toasts.value = toasts.value.filter((toast) => toast.id !== id)
  }

  function notify(title: string, tone: ToastMessage['tone'] = 'success', description?: string) {
    const id = nextId++
    toasts.value.push({ id, title, description, tone })
    window.setTimeout(() => dismiss(id), 4200)
  }

  return { toasts: readonly(toasts), notify, dismiss }
}
