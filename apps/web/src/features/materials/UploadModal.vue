<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { FileImage, FileText, UploadCloud } from 'lucide-vue-next'
import BaseModal from '@/components/BaseModal.vue'
import { useDemoStore } from '@/stores/demo'
import { useUiStore } from '@/stores/ui'
import { formatFileSize } from '@/shared/ui/format'
import { useToast } from '@/shared/ui/useToast'
import { calculateFileHash, registerMaterialFile, runMaterialRecognition } from './recognitionRunner'

const ui = useUiStore()
const store = useDemoStore()
const router = useRouter()
const { notify } = useToast()
const input = ref<HTMLInputElement>()
const selectedFile = ref<File>()
const error = ref('')
const processing = ref(false)
const dragging = ref(false)
const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']

function selectFile(file?: File) {
  error.value = ''
  if (!file) return
  const limit = file.type === 'application/pdf' ? 15 * 1024 * 1024 : 10 * 1024 * 1024
  if (!allowedTypes.includes(file.type)) error.value = '仅支持 JPG、PNG、WebP 图片和 PDF 文件'
  else if (file.size === 0) error.value = '文件内容为空，请选择有效材料'
  else if (file.size > limit) error.value = `${file.type === 'application/pdf' ? 'PDF' : '图片'}不能超过 ${limit / 1024 / 1024} MB`
  else selectedFile.value = file
}

async function submit() {
  const file = selectedFile.value
  if (!file || processing.value) return
  processing.value = true
  error.value = ''
  try {
    const hash = await calculateFileHash(file)
    if (store.materials.some((material) => material.hash === hash)) {
      error.value = '这份文件已上传过，请在材料列表中打开原记录'
      return
    }
    const id = crypto.randomUUID()
    store.addMaterial({
      id, name: file.name, size: file.size, mimeType: file.type, hash, status: 'processing', source: 'local',
      previewUrl: URL.createObjectURL(file), uploadedAt: new Date().toISOString(), recognitionProgress: 0, recognitionStage: '等待本地解析', message: '文件仅在当前浏览器中解析，不会上传到第三方服务。',
      fields: [
        { key: 'title', label: '事项名称', value: '', confidence: null, status: 'pending', evidence: '未运行智能识别，请人工填写' },
        { key: 'merchant', label: '商家', value: '', confidence: null, status: 'pending', evidence: '未运行智能识别，请人工填写' },
        { key: 'amount', label: '实付金额', value: '', confidence: null, status: 'pending', evidence: '未运行智能识别，请人工填写' },
        { key: 'dueDate', label: '办理截止日', value: '', confidence: null, status: 'pending', evidence: '未运行智能识别，请人工填写' },
      ],
    })
    ui.uploadOpen = false
    selectedFile.value = undefined
    notify('材料已添加', 'success', '正在浏览器内提取文字，你也可以随时手工录入')
    registerMaterialFile(id, file)
    await router.push(`/materials?material=${id}`)
    void runMaterialRecognition(id)
  } catch {
    error.value = '无法读取这份文件，请检查文件是否损坏后重试'
  } finally {
    processing.value = false
  }
}
</script>

<template>
  <BaseModal :open="ui.uploadOpen" title="上传生活材料" description="材料仅用于当前浏览器中的本地演示，不会上传到服务器。" @close="ui.uploadOpen = false">
    <input ref="input" type="file" class="hidden" accept="image/jpeg,image/png,image/webp,application/pdf" @change="selectFile(($event.target as HTMLInputElement).files?.[0])" />
    <button
      type="button"
      :class="['flex w-full flex-col items-center rounded-xl border border-dashed px-6 py-9 text-center transition-colors', dragging ? 'border-brand bg-indigo-50' : 'border-slate-300 bg-slate-50/60 hover:border-brand hover:bg-indigo-50/40']"
      @click="input?.click()"
      @dragover.prevent="dragging = true"
      @dragleave.prevent="dragging = false"
      @drop.prevent="dragging = false; selectFile($event.dataTransfer?.files[0])"
    >
      <span class="mb-3 flex size-11 items-center justify-center rounded-xl bg-white text-brand shadow-sm"><UploadCloud :size="22" /></span>
      <span class="text-sm font-semibold text-ink">点击选择或拖放文件到这里</span>
      <span class="mt-1.5 text-xs leading-5 text-muted">图片不超过 10 MB，PDF 不超过 15 MB</span>
    </button>
    <div v-if="selectedFile" class="mt-4 flex items-center gap-3 rounded-xl border border-line p-3.5">
      <FileText v-if="selectedFile.type === 'application/pdf'" class="text-danger" :size="22" />
      <FileImage v-else class="text-brand" :size="22" />
      <div class="min-w-0 flex-1"><p class="truncate text-sm font-medium text-ink">{{ selectedFile.name }}</p><p class="mt-0.5 text-xs text-muted">{{ formatFileSize(selectedFile.size) }} · 等待添加</p></div>
      <button class="text-xs font-medium text-muted hover:text-danger" @click="selectedFile = undefined">移除</button>
    </div>
    <p v-if="error" class="field-error" role="alert">{{ error }}</p>
    <div class="mt-4 rounded-lg bg-amber-50 px-3.5 py-3 text-xs leading-5 text-amber-800">图片和扫描 PDF 将在浏览器内 OCR，语言数据按需下载；文件内容不会发送给第三方。文本 PDF 优先读取文本层，识别后仍需你确认。</div>
    <template #footer>
      <button class="btn-secondary" @click="ui.uploadOpen = false">取消</button>
      <button class="btn-primary" :disabled="!selectedFile || processing" @click="submit"><span v-if="processing" class="size-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />{{ processing ? '正在读取文件…' : '添加并确认材料' }}</button>
    </template>
  </BaseModal>
</template>
