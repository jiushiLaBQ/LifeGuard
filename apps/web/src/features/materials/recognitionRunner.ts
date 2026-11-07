import { useDemoStore } from '@/stores/demo'
import { extractDocument } from './documentRecognition'
import { emptyRecognition, recognitionToFields, recognizeFields } from './recognitionRules'

const materialFiles = new Map<string, File>()
const extractedTexts = new Map<string, string>()

export async function calculateFileHash(file: File) {
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer())
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

export function registerMaterialFile(id: string, file: File) {
  materialFiles.set(id, file)
}

export function releaseMaterialFile(id: string) {
  materialFiles.delete(id)
  extractedTexts.delete(id)
}

export function clearMaterialFiles() {
  materialFiles.clear()
  extractedTexts.clear()
}

export function getExtractedText(id: string) {
  return extractedTexts.get(id) ?? ''
}

export async function runMaterialRecognition(id: string, replacementFile?: File) {
  const store = useDemoStore()
  const file = replacementFile ?? materialFiles.get(id)
  if (!file) {
    store.failRecognition(id, '当前没有可读取的原始文件。请重新选择文件，或直接手工录入。', recognitionToFields(emptyRecognition()))
    return false
  }
  registerMaterialFile(id, file)
  store.beginRecognition(id)
  try {
    const extracted = await extractDocument(file, (progress, stage) => store.updateRecognitionProgress(id, progress, stage))
    if (!store.materials.some((item) => item.id === id)) {
      releaseMaterialFile(id)
      return false
    }
    store.updateRecognitionProgress(id, 96, '正在生成候选字段')
    const recognition = recognizeFields(extracted.text, extracted.ocrConfidence)
    extractedTexts.set(id, extracted.text)
    store.finishRecognition(id, recognition, recognitionToFields(recognition), extracted.engine, extracted.note)
    return true
  } catch {
    extractedTexts.delete(id)
    store.failRecognition(id, '本地文字提取未完成，可能是文件损坏、加密或浏览器资源不足。你仍可手工填写全部字段。', recognitionToFields(emptyRecognition()))
    return false
  }
}
