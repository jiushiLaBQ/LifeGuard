import type { MaterialItem } from '@/types'

export interface ExtractedDocument {
  text: string
  engine: NonNullable<MaterialItem['recognitionEngine']>
  ocrConfidence: number | null
  note: string
}

type Progress = (progress: number, stage: string) => void

async function recognizeImage(input: File | HTMLCanvasElement, onProgress: Progress, range = { start: 5, end: 95 }) {
  const { recognize } = await import('tesseract.js')
  const result = await recognize(input, 'chi_sim+eng', {
    logger: (message) => {
      if (message.status === 'recognizing text') {
        const progress = range.start + message.progress * (range.end - range.start)
        onProgress(Math.round(progress), '正在浏览器内识别文字')
      }
    },
  })
  return { text: result.data.text, confidence: Math.round(result.data.confidence) }
}

async function extractPdf(file: File, onProgress: Progress): Promise<ExtractedDocument> {
  const pdfjs = await import('pdfjs-dist')
  pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString()
  const loadingTask = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) })
  const document = await loadingTask.promise
  const pageCount = Math.min(document.numPages, 10)
  const texts: string[] = []
  const confidences: number[] = []
  let usedOcr = false
  try {
    for (let index = 1; index <= pageCount; index += 1) {
      onProgress(Math.round(index / pageCount * 70), `正在读取 PDF 第 ${index}/${pageCount} 页`)
      const page = await document.getPage(index)
      const content = await page.getTextContent()
      const pageText = content.items.map((item) => 'str' in item ? `${item.str}${item.hasEOL ? '\n' : ' '}` : '').join('').replace(/[ \t]+\n/g, '\n').trim()
      if (pageText.length >= 12) {
        texts.push(pageText)
        page.cleanup()
        continue
      }
      usedOcr = true
      onProgress(Math.round(index / pageCount * 70), `第 ${index} 页无文本层，正在本地 OCR`)
      const viewport = page.getViewport({ scale: 1.8 })
      const canvas = window.document.createElement('canvas')
      canvas.width = Math.ceil(viewport.width)
      canvas.height = Math.ceil(viewport.height)
      const context = canvas.getContext('2d')
      if (!context) throw new Error('浏览器无法创建 PDF 图像画布')
      await page.render({ canvasContext: context, viewport, canvas: null }).promise
      const result = await recognizeImage(canvas, onProgress, { start: 10 + (index - 1) / pageCount * 85, end: 10 + index / pageCount * 85 })
      texts.push(result.text)
      confidences.push(result.confidence)
      canvas.width = 0
      canvas.height = 0
      page.cleanup()
    }
  } finally {
    await loadingTask.destroy()
  }
  return {
    text: texts.join('\n'),
    engine: usedOcr ? 'pdf-ocr' : 'pdf-text',
    ocrConfidence: confidences.length ? Math.round(confidences.reduce((sum, value) => sum + value, 0) / confidences.length) : null,
    note: `${usedOcr ? '扫描页已在浏览器内完成 OCR' : '已从 PDF 文本层提取'}${document.numPages > 10 ? '；为控制耗时，仅处理前 10 页' : ''}`,
  }
}

export async function extractDocument(file: File, onProgress: Progress): Promise<ExtractedDocument> {
  onProgress(2, '正在准备本地解析')
  if (file.type === 'application/pdf') return extractPdf(file, onProgress)
  onProgress(5, '正在加载中英文 OCR 组件')
  const result = await recognizeImage(file, onProgress)
  return { text: result.text, engine: 'browser-ocr', ocrConfidence: result.confidence, note: '图片已在浏览器内完成中英文 OCR' }
}
