import { isValidDateString } from '@/shared/ui/format'
import type { DocumentType, ExtractedField, MatterType, RecognitionFieldKey, RecognitionResult } from '@/types'

interface Candidate {
  value: string | null
  evidence: string
  confidence: number
}

const emptyCandidate: Candidate = { value: null, evidence: '', confidence: 0 }

function normalizeText(text: string) {
  return text.replace(/\r/g, '\n').replace(/[：]/g, ':').replace(/[￥]/g, '¥').replace(/(?<=[㐀-鿿])[ \t]+(?=[㐀-鿿])/g, '').replace(/(\d)[ \t]*([.,])[ \t]*(\d)/g, '$1$2$3').replace(/[ \t]+/g, ' ').replace(/\n{2,}/g, '\n').trim()
}

function findDate(text: string, labels: RegExp, occurrence = 0): Candidate {
  const context = text.match(new RegExp(`(?:${labels.source})\\s*:?\\s*([^\\n]{0,90})`, 'i'))
  if (!context) return emptyCandidate
  const dates = Array.from(context[1].matchAll(/(?<!\d)((?:19|20)\d{2})\s*[年./-]\s*(\d{1,2})\s*[月./-]\s*(\d{1,2})\s*日?(?!\d)/g))
  const match = dates[occurrence]
  if (!match) return emptyCandidate
  const value = `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`
  if (!isValidDateString(value)) return emptyCandidate
  return { value, evidence: context[0].trim(), confidence: 94 }
}

function findAmount(text: string): Candidate & { currency: RecognitionResult['currency'] } {
  const match = text.match(/(?:实付(?:款|金额)?|支付金额|订单金额|价税合计|课程费用|会员费|续费金额|租金|押金|金额)\s*:?\s*(?:(US\$|HK\$|USD|HKD|CNY|RMB|人民币|¥)\s*)?((?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{1,2})?)(?![\d.])\s*(元|人民币|美元|港币)?/i)
  if (!match) return { ...emptyCandidate, currency: null }
  const currencyToken = match[1]?.toUpperCase() ?? match[3]
  const currency = currencyToken === '¥' || currencyToken === '元' || currencyToken === '人民币' || currencyToken === 'CNY' || currencyToken === 'RMB' ? 'CNY' : currencyToken === 'USD' || currencyToken === 'US$' || currencyToken === '美元' ? 'USD' : currencyToken === 'HKD' || currencyToken === 'HK$' || currencyToken === '港币' ? 'HKD' : null
  return { value: match[2].replace(/,/g, ''), currency, evidence: match[0].trim(), confidence: currency ? 95 : 64 }
}

function findBillingCycle(text: string): Candidate {
  const rules = [
    { value: 'yearly', pattern: /按年|每年|年付|年度订阅|包年/ },
    { value: 'quarterly', pattern: /按季|每季|季付|季度订阅|包季/ },
    { value: 'monthly', pattern: /按月|每月|月付|月度订阅|连续包月|包月|(?:元|块)\s*\/\s*月/ },
  ]
  const matched = rules.find((rule) => rule.pattern.test(text))
  const evidence = matched?.pattern.exec(text)?.[0]
  return matched ? { value: matched.value, evidence: `周期依据：${evidence}`, confidence: 92 } : emptyCandidate
}

function findLabeledText(text: string, labels: RegExp, maxLength = 80): Candidate {
  const match = text.match(new RegExp(`(?:${labels.source})\\s*:?\\s*([^\\n]{1,${maxLength}})`, 'i'))
  if (!match) return emptyCandidate
  const value = match[1].trim().replace(/[|｜].*$/, '').trim()
  if (!value) return emptyCandidate
  return { value, evidence: match[0].trim(), confidence: 82 }
}

function detectDocumentType(text: string): { value: DocumentType; evidence: string; confidence: number } {
  const rules: Array<{ type: DocumentType; pattern: RegExp; label: string }> = [
    { type: '订阅', pattern: /自动续费|下次续费|会员订阅|续费管理/, label: '续费/订阅关键词' },
    { type: '保修', pattern: /保修凭证|保修卡|质保期|保修期/, label: '保修关键词' },
    { type: '合同', pattern: /租赁合同|出租方|承租方|房屋租赁/, label: '租赁合同关键词' },
    { type: '订单', pattern: /订单编号|订单截图|下单时间|实付款|退货/, label: '订单关键词' },
  ]
  const matched = rules.find((rule) => rule.pattern.test(text))
  return matched ? { value: matched.type, evidence: matched.label, confidence: 88 } : { value: '其他', evidence: '未匹配到明确材料类型', confidence: 45 }
}

function scaleConfidence(value: number, ocrConfidence: number | null) {
  return ocrConfidence === null ? value : Math.round(value * Math.max(ocrConfidence, 20) / 100)
}

export function emptyRecognition(): RecognitionResult {
  return { document_type: '其他', title: '', amount: null, currency: null, billing_cycle: null, purchase_date: null, effective_date: null, expiry_date: null, renewal_date: null, merchant: '', description: '', confidence: {}, need_confirmation: ['document_type', 'title'] }
}

export function recognizeFields(sourceText: string, ocrConfidence: number | null): RecognitionResult {
  const text = normalizeText(sourceText)
  if (!text) return emptyRecognition()
  const documentType = detectDocumentType(text)
  const title = findLabeledText(text, /商品名称|课程名称|会员名称|租赁房屋|房屋地址|服务项目|商品/, 60)
  const merchant = findLabeledText(text, /店铺名称|商家|商户|销售方|出租方|甲方|平台|培训机构|学校|店铺/, 50)
  const description = findLabeledText(text, /事项描述|说明|备注/, 140)
  const amount = findAmount(text)
  const billingCycle = findBillingCycle(text)
  const purchaseDate = findDate(text, /下单时间|付款时间|购买日期|订单日期|交易时间/)
  const effectiveDate = findDate(text, /起租日期|租赁开始|生效日期|开通日期|租赁期限/)
  const rangeExpiry = findDate(text, /租赁期限|合同期限/, 1)
  const expiryDate = findDate(text, /退货截止日|退货截止|退货期限|售后截止|保修截止|保修期至|保修到期|有效期至|课程截止|合同到期|租赁到期/)
  const renewalDate = findDate(text, /下次续费日期|下次续费|续费日期|自动续费日|下次扣款日/)
  const candidates: Record<Exclude<RecognitionFieldKey, 'document_type'>, Candidate> = {
    title, amount, billing_cycle: billingCycle, purchase_date: purchaseDate, effective_date: effectiveDate, expiry_date: expiryDate.value ? expiryDate : rangeExpiry,
    renewal_date: renewalDate, merchant, description,
  }
  const confidence: RecognitionResult['confidence'] = { document_type: scaleConfidence(documentType.confidence, ocrConfidence) }
  const needConfirmation = new Set<RecognitionFieldKey>()
  if (documentType.value === '其他') needConfirmation.add('document_type')
  Object.entries(candidates).forEach(([key, candidate]) => {
    if (!candidate.value) return
    confidence[key as RecognitionFieldKey] = scaleConfidence(candidate.confidence, ocrConfidence)
    if ((confidence[key as RecognitionFieldKey] ?? 0) < 70) needConfirmation.add(key as RecognitionFieldKey)
  })
  if (!title.value) needConfirmation.add('title')
  if (amount.value && !amount.currency) needConfirmation.add('amount')
  if (documentType.value === '订阅' && !billingCycle.value) needConfirmation.add('billing_cycle')
  return {
    document_type: documentType.value,
    title: title.value ?? '',
    amount: amount.value,
    currency: amount.currency,
    billing_cycle: billingCycle.value as RecognitionResult['billing_cycle'],
    purchase_date: purchaseDate.value,
    effective_date: effectiveDate.value,
    expiry_date: expiryDate.value ?? rangeExpiry.value,
    renewal_date: renewalDate.value,
    merchant: merchant.value ?? '',
    description: description.value ?? '',
    confidence,
    need_confirmation: Array.from(needConfirmation),
  }
}

export function recognitionToFields(result: RecognitionResult): ExtractedField[] {
  const definitions: Array<{ key: Exclude<ExtractedField['key'], 'dueDate'>; label: string }> = [
    { key: 'title', label: '事项名称' },
    { key: 'merchant', label: '商家 / 机构' },
    { key: 'amount', label: '金额' },
    { key: 'billing_cycle', label: '续费周期' },
    { key: 'purchase_date', label: '购买 / 下单日期' },
    { key: 'effective_date', label: '生效日期' },
    { key: 'expiry_date', label: '到期 / 退货截止日期' },
    { key: 'renewal_date', label: '下次续费日期' },
    { key: 'description', label: '描述 / 备注' },
  ]
  return definitions.map(({ key, label }) => ({
    key, label, value: result[key] ?? '', confidence: result.confidence[key] ?? null,
    status: 'pending', evidence: result[key] ? '来自材料中的对应字段或明确日期标签' : '未找到明确依据，请保持为空或手工补充',
  }))
}

export function suggestedMatterType(result: RecognitionResult): MatterType {
  if (/课程|直播课|学习|训练营|培训/.test(`${result.title}${result.description}`)) return 'course'
  if (result.document_type === '订单') return 'purchase'
  if (result.document_type === '保修') return 'warranty'
  if (result.document_type === '订阅') return 'subscription'
  if (result.document_type === '合同') return 'lease'
  return 'payment'
}
