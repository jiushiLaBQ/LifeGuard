import { computed, ref, watch } from 'vue'
import { defineStore } from 'pinia'
import { createDemoState } from '@/features/demo/seed'
import { buildActionPlan } from '@/features/decision/actionEngine'
import { assessMatter } from '@/features/decision/riskEngine'
import { FACT_LABELS } from '@/features/decision/rules'
import { calculateMonthlySpending } from '@/features/subscriptions/subscriptionEngine'
import { daysUntil, isValidDateString, matterTypeLabels, toDateInput } from '@/shared/ui/format'
import type { ActionPlan, BillingCycle, DocumentType, ExtractedField, MaterialItem, Matter, MatterChange, MatterFactKey, MatterHistory, MatterType, Profile, RecognitionResult, Subscription, SubscriptionInput } from '@/types'

const STORAGE_KEY = 'lifeguard.demo.workspace.v1'

function loadDemoState() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) {
      const parsed = JSON.parse(saved) as ReturnType<typeof createDemoState>
      if (Array.isArray(parsed.matters) && Array.isArray(parsed.subscriptions)) {
        parsed.materials.forEach((material) => {
          if (material.status === 'processing') {
            material.status = 'awaiting_confirmation'
            material.recognitionStage = '解析已中断'
            material.message = '页面刷新中断了本地解析，请重新识别或手工录入。'
          }
        })
        parsed.histories = Array.isArray(parsed.histories) ? parsed.histories : []
        const migratedAt = new Date().toISOString()
        parsed.subscriptions.forEach((subscription) => {
          subscription.currency = subscription.currency ?? 'CNY'
          subscription.source = subscription.source ?? 'demo'
          subscription.notes = subscription.notes ?? ''
          subscription.createdAt = subscription.createdAt ?? migratedAt
          subscription.updatedAt = subscription.updatedAt ?? subscription.createdAt
          subscription.duplicateState = subscription.duplicateState ?? 'none'
        })
        return parsed
      }
    }
  } catch {
    localStorage.removeItem(STORAGE_KEY)
  }
  return createDemoState()
}

function initializeProvenance(matter: Matter) {
  matter.provenance = { ...matter.provenance }
  for (const key of ['dueDate', 'amount', 'importance', 'preparationDays', 'obligation'] as const) {
    if (matter[key] !== null && matter[key] !== undefined && matter[key] !== '' && !matter.provenance[key]) {
      matter.provenance[key] = { source: 'user', confirmed: true, note: '既有工作区记录，已由用户确认或属于虚构演示数据。' }
    }
  }
}

function displayValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '未填写'
  return String(value)
}

function validateSubscription(input: SubscriptionInput) {
  if (!input.service.trim() || !input.category.trim()) throw new Error('请填写服务名称和分类')
  if (!Number.isFinite(input.amount) || input.amount < 0 || !Number.isSafeInteger(Math.round(input.amount * 100))) throw new Error('金额需为非负数字，最多两位小数')
  if (!['monthly', 'quarterly', 'yearly'].includes(input.cycle)) throw new Error('请选择有效的续费周期')
  if (!['CNY', 'USD', 'HKD'].includes(input.currency)) throw new Error('请选择有效的货币单位')
  if (!isValidDateString(input.nextRenewal)) throw new Error('请选择真实有效的下次续费日期')
}

export const useDemoStore = defineStore('demo', () => {
  const initial = loadDemoState()
  const matters = ref<Matter[]>(initial.matters)
  const actions = ref<ActionPlan[]>(initial.actions)
  const materials = ref<MaterialItem[]>(initial.materials)
  const subscriptions = ref(initial.subscriptions)
  const activities = ref(initial.activities)
  const histories = ref<MatterHistory[]>(initial.histories ?? [])
  const profile = ref<Profile>(initial.profile)

  matters.value.forEach((matter) => {
    initializeProvenance(matter)
    syncDecision(matter)
  })
  if (!histories.value.length) {
    matters.value.forEach((matter) => recordHistory(matter, 'loaded', '已生成可解释评估', `规则引擎已计算 ${matter.assessment?.score ?? 0} 分并生成动态行动方案。`))
  }

  watch([matters, actions, materials, subscriptions, activities, histories, profile], () => {
    const serializableMaterials = materials.value.map((material) => ({ ...material, previewUrl: undefined }))
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ matters: matters.value, actions: actions.value, materials: serializableMaterials, subscriptions: subscriptions.value, activities: activities.value, histories: histories.value, profile: profile.value }))
  }, { deep: true })

  const activeMatters = computed(() => matters.value.filter((matter) => matter.status === 'active').sort((a, b) => (b.assessment?.score ?? 0) - (a.assessment?.score ?? 0) || (a.dueDate ?? '9999-12-31').localeCompare(b.dueDate ?? '9999-12-31')))
  const weekDue = computed(() => activeMatters.value.filter((matter) => daysUntil(matter.dueDate) >= 0 && daysUntil(matter.dueDate) <= 7))
  const riskMatters = computed(() => activeMatters.value.filter((matter) => matter.risk === 'urgent' || matter.risk === 'high'))
  const completedMatters = computed(() => matters.value.filter((matter) => matter.status === 'completed').sort((a, b) => (b.completedOn ?? '').localeCompare(a.completedOn ?? '')))
  const monthlySpending = computed(() => calculateMonthlySpending(subscriptions.value, profile.value.currency as Subscription['currency']))
  const totalSaved = computed(() => completedMatters.value.reduce((total, item) => total + (item.savedAmount ?? 0), 0))
  const pendingMaterials = computed(() => materials.value.filter((material) => material.status === 'awaiting_confirmation' || material.status === 'error'))

  function addActivity(title: string, description: string, kind: 'confirm' | 'complete' | 'upload' | 'action' | 'settings') {
    activities.value.unshift({ id: crypto.randomUUID(), title, description, timestamp: new Date().toISOString(), kind })
    activities.value = activities.value.slice(0, 30)
  }

  function getMatter(id: string) {
    return matters.value.find((matter) => matter.id === id)
  }

  function getPlan(matterId: string) {
    return actions.value.find((plan) => plan.matterId === matterId)
  }

  function getHistories(matterId: string) {
    return histories.value.filter((history) => history.matterId === matterId).sort((a, b) => b.timestamp.localeCompare(a.timestamp))
  }

  function recordHistory(matter: Matter, kind: MatterHistory['kind'], title: string, description: string, changes: MatterChange[] = []) {
    histories.value.unshift({
      id: crypto.randomUUID(), matterId: matter.id, timestamp: new Date().toISOString(), kind,
      title, description, score: matter.assessment?.score ?? 0, changes,
    })
    histories.value = histories.value.slice(0, 300)
  }

  function syncDecision(matter: Matter) {
    const previousScore = matter.assessment?.score ?? 0
    const assessment = assessMatter(matter)
    matter.assessment = assessment
    matter.risk = assessment.level
    const existingPlan = getPlan(matter.id)
    const nextPlan = buildActionPlan(matter, assessment, existingPlan)
    if (existingPlan) Object.assign(existingPlan, nextPlan)
    else actions.value.unshift(nextPlan)
    return { previousScore, assessment }
  }

  function confirmFact(id: string, key: MatterFactKey) {
    const matter = getMatter(id)
    if (!matter || matter[key] === null || matter[key] === undefined || matter[key] === '') return
    const previousScore = matter.assessment?.score ?? 0
    matter.provenance = { ...matter.provenance, [key]: { source: 'user', confirmed: true, note: '由你在事项详情中核对确认。' } }
    const { assessment } = syncDecision(matter)
    recordHistory(matter, 'updated', `已确认${FACT_LABELS[key]}`, `该字段已标记为用户提供并核对；优先级 ${previousScore} → ${assessment.score}。`)
    addActivity('确认事项信息', `${matter.title} · ${FACT_LABELS[key]}已核对`, 'confirm')
  }

  function toggleStep(planId: string, stepId: string) {
    const plan = actions.value.find((item) => item.id === planId)
    const step = plan?.steps.find((item) => item.id === stepId)
    const matter = plan ? getMatter(plan.matterId) : undefined
    if (!step || !plan || !matter) return
    step.done = !step.done
    plan.updatedAt = new Date().toISOString()
    recordHistory(matter, 'step', step.done ? '完成一个行动步骤' : '恢复一个行动步骤', step.title)
    if (step.done) addActivity('完成一个行动步骤', step.title, 'action')
  }

  function completeMatter(id: string, outcome: string, savedAmount?: number) {
    const matter = getMatter(id)
    if (!matter) return
    const previousScore = matter.assessment?.score ?? 0
    matter.status = 'completed'
    matter.completedOn = toDateInput(new Date())
    matter.outcome = outcome
    matter.savedAmount = savedAmount
    syncDecision(matter)
    recordHistory(matter, 'completed', '事项已完成', `${outcome}；优先级 ${previousScore} → 0，行动方案保留用于追溯。`)
    addActivity('事项已完成', `${matter.title} · ${outcome}`, 'complete')
  }

  function reopenMatter(id: string) {
    const matter = getMatter(id)
    if (!matter) return
    matter.status = 'active'
    matter.completedOn = undefined
    matter.outcome = undefined
    matter.savedAmount = undefined
    const { assessment } = syncDecision(matter)
    recordHistory(matter, 'reopened', '恢复待处理并重新评估', `事项已重新进入优先级队列，当前 ${assessment.score} 分。`)
    addActivity('恢复待处理事项', `${matter.title}已重新计算优先级`, 'confirm')
  }

  function updateMatter(id: string, patch: Pick<Matter, 'title' | 'merchant' | 'amount' | 'dueDate' | 'type' | 'nextAction'> & Partial<Pick<Matter, 'importance' | 'preparationDays' | 'obligation'>>) {
    const matter = getMatter(id)
    if (!matter) return
    const previousScore = matter.assessment?.score ?? 0
    const previousType = matter.type
    const changes: MatterChange[] = []
    if (matter.title !== patch.title) changes.push({ field: 'title', label: '事项名称', before: matter.title, after: patch.title })
    if (matter.merchant !== patch.merchant) changes.push({ field: 'merchant', label: '商家 / 机构', before: matter.merchant, after: patch.merchant })
    if (matter.amount !== patch.amount) changes.push({ field: 'amount', label: '涉及金额', before: displayValue(matter.amount), after: displayValue(patch.amount) })
    if (matter.dueDate !== patch.dueDate) changes.push({ field: 'dueDate', label: '截止日期', before: displayValue(matter.dueDate), after: displayValue(patch.dueDate) })
    if (matter.type !== patch.type) changes.push({ field: 'type', label: '事项类型', before: matterTypeLabels[previousType], after: matterTypeLabels[patch.type] })
    if (matter.nextAction !== patch.nextAction) changes.push({ field: 'nextAction', label: '下一步行动', before: matter.nextAction, after: patch.nextAction })
    for (const key of ['importance', 'preparationDays', 'obligation'] as const) {
      if (key in patch && matter[key] !== patch[key]) changes.push({ field: key, label: FACT_LABELS[key], before: displayValue(matter[key]), after: displayValue(patch[key]) })
    }
    const provenance = { ...matter.provenance }
    for (const key of ['dueDate', 'amount', 'importance', 'preparationDays', 'obligation'] as const) {
      if (key in patch && matter[key] !== patch[key]) provenance[key] = { source: 'user', confirmed: true, note: '由你在编辑事项时提供并确认。' }
    }
    matter.provenance = provenance
    Object.assign(matter, patch)
    const { assessment } = syncDecision(matter)
    recordHistory(matter, 'updated', '事项信息与决策方案已更新', `优先级 ${previousScore} → ${assessment.score}；已完成步骤按稳定标识保留。`, changes)
    addActivity('更新事项信息', `${matter.title}的评分与行动建议已重算`, 'confirm')
  }

  function addManualMatter(input: Pick<Matter, 'title' | 'merchant' | 'amount' | 'dueDate' | 'type' | 'nextAction'> & Partial<Pick<Matter, 'importance' | 'preparationDays' | 'obligation'>>) {
    const matter: Matter = { ...input, id: crypto.randomUUID(), currency: 'CNY', status: 'active', risk: 'low', description: '由你手工创建并确认的生活事项。', source: 'manual' }
    initializeProvenance(matter)
    matters.value.unshift(matter)
    const { assessment } = syncDecision(matter)
    recordHistory(matter, 'created', '创建事项并生成决策方案', `初始优先级 ${assessment.score} 分，使用可维护规则计算。`)
    addActivity('创建生活事项', `${matter.title}${matter.dueDate ? '已进入优先级队列' : '已保存，日期待确认'}`, 'confirm')
    return matter
  }

  function addMaterial(material: MaterialItem) {
    materials.value.unshift(material)
    addActivity('材料已保存在本次演示', `${material.name}等待手工确认`, 'upload')
  }

  function confirmMaterial(id: string, fields: ExtractedField[], type: MatterType, currency: string, documentType: DocumentType, subscriptionCategory = '其他') {
    const material = materials.value.find((item) => item.id === id)
    if (!material) throw new Error('材料不存在或已被清除')
    const value = (key: ExtractedField['key']) => fields.find((field) => field.key === key)?.value.trim() ?? ''
    const rawAmount = value('amount')
    if (!value('title')) throw new Error('请填写事项名称')
    if (rawAmount && (!/^\d+(\.\d{1,2})?$/.test(rawAmount) || !Number.isSafeInteger(Math.round(Number(rawAmount) * 100)))) throw new Error('请填写有效金额，最多两位小数')
    for (const key of ['purchase_date', 'effective_date', 'expiry_date', 'renewal_date', 'dueDate'] as const) {
      const date = value(key)
      if (date && !isValidDateString(date)) throw new Error('请检查日期是否为真实日历日期')
    }
    const amount = rawAmount ? Number(rawAmount) : null
    const dueDate = value('expiry_date') || value('renewal_date') || value('dueDate') || null
    const billingCycle = value('billing_cycle') as BillingCycle
    if (type === 'subscription') {
      if (amount === null) throw new Error('订阅记录需要确认每次扣款金额')
      if (!value('renewal_date')) throw new Error('订阅记录需要确认下次续费日期')
      if (!['monthly', 'quarterly', 'yearly'].includes(billingCycle)) throw new Error('材料未明确续费周期，请人工选择后再确认')
      if (!subscriptionCategory.trim()) throw new Error('请选择或填写订阅分类')
    }
    material.fields = fields.map((field) => ({ ...field, status: 'confirmed' }))
    material.status = 'ready'
    material.recognitionStage = '已确认'
    material.recognitionProgress = 100
    material.message = '已由你确认并生成生活事项。'
    const confidence: RecognitionResult['confidence'] = {}
    const documentConfidence = material.recognition?.confidence.document_type
    if (material.recognition?.document_type === documentType && documentConfidence !== undefined) confidence.document_type = documentConfidence
    fields.forEach((field) => {
      const key = field.key === 'dueDate' ? 'expiry_date' : field.key
      if (field.confidence !== null) confidence[key] = field.confidence
    })
    material.recognition = {
      document_type: documentType, title: value('title'), amount: rawAmount || null,
      currency: rawAmount ? currency as RecognitionResult['currency'] : null,
      billing_cycle: ['monthly', 'quarterly', 'yearly'].includes(billingCycle) ? billingCycle : null,
      purchase_date: value('purchase_date') || null, effective_date: value('effective_date') || null,
      expiry_date: value('expiry_date') || value('dueDate') || null, renewal_date: value('renewal_date') || null,
      merchant: value('merchant'), description: value('description'), confidence, need_confirmation: [],
    }
    const matter = addManualMatter({ title: value('title'), merchant: value('merchant') || '未填写商家', amount, dueDate, type, nextAction: '查看行动清单并处理下一步' })
    matter.source = 'material'
    matter.currency = currency
    matter.description = value('description') || '由你核对材料字段并确认生成的生活事项。'
    const amountField = fields.find((field) => field.key === 'amount')
    const dueField = fields.find((field) => field.value.trim() && field.value.trim() === dueDate && ['expiry_date', 'renewal_date', 'dueDate'].includes(field.key))
    matter.provenance = {
      ...matter.provenance,
      ...(amount !== null ? { amount: { source: amountField?.confidence !== null && amountField?.confidence !== undefined ? 'ocr' as const : 'user' as const, confirmed: true, note: '材料字段已由你核对确认。' } } : {}),
      ...(dueDate ? { dueDate: { source: dueField?.confidence !== null && dueField?.confidence !== undefined ? 'ocr' as const : 'user' as const, confirmed: true, note: '期限字段已由你核对确认。' } } : {}),
    }
    syncDecision(matter)
    recordHistory(matter, 'reassessed', '材料字段来源已关联', '保留 OCR 与用户录入的来源区别；确认状态已更新，评分和行动方案已同步。')
    if (type === 'subscription') {
      addSubscription({
        service: value('title'), category: subscriptionCategory.trim(), amount: amount!, currency: currency as Subscription['currency'],
        cycle: billingCycle, nextRenewal: value('renewal_date'), autoRenew: true, notes: value('description'),
      }, 'material', id)
      material.message = '已由你确认并生成订阅记录与续费事项。'
    }
    addActivity('确认识别字段', `${material.name}已生成“${matter.title}”`, 'confirm')
    return matter
  }

  function beginRecognition(id: string) {
    const material = materials.value.find((item) => item.id === id)
    if (!material) throw new Error('材料不存在或已被清除')
    material.status = 'processing'
    material.recognitionProgress = 0
    material.recognitionStage = '等待本地解析'
    material.message = '文件仅在当前浏览器中解析，不会上传到第三方服务。'
  }

  function updateRecognitionProgress(id: string, progress: number, stage: string) {
    const material = materials.value.find((item) => item.id === id)
    if (!material || material.status !== 'processing') return
    material.recognitionProgress = progress
    material.recognitionStage = stage
  }

  function finishRecognition(id: string, recognition: RecognitionResult, fields: ExtractedField[], engine: NonNullable<MaterialItem['recognitionEngine']>, note: string) {
    const material = materials.value.find((item) => item.id === id)
    if (!material) return
    material.recognition = recognition
    material.fields = fields
    material.recognitionEngine = engine
    material.extractionNote = note
    material.recognitionProgress = 100
    material.recognitionStage = '等待你确认'
    material.status = 'awaiting_confirmation'
    material.message = '识别结果仅为候选，请核对后再生成正式事项。'
  }

  function failRecognition(id: string, message: string, fields: ExtractedField[]) {
    const material = materials.value.find((item) => item.id === id)
    if (!material) return
    material.status = 'error'
    material.recognition = undefined
    material.recognitionStage = '识别未完成'
    material.recognitionEngine = 'manual'
    material.extractionNote = undefined
    material.message = message
    material.fields = fields
  }

  function clearRecognition(id: string) {
    const material = materials.value.find((item) => item.id === id)
    if (!material) return
    material.recognition = undefined
    material.fields = []
    material.status = 'awaiting_confirmation'
    material.recognitionEngine = 'manual'
    material.recognitionProgress = undefined
    material.recognitionStage = '手工录入'
    material.extractionNote = undefined
    material.message = '识别结果已清除，可手工录入或重新识别。'
  }

  function removeMaterial(id: string) {
    const material = materials.value.find((item) => item.id === id)
    if (material?.previewUrl?.startsWith('blob:')) URL.revokeObjectURL(material.previewUrl)
    materials.value = materials.value.filter((item) => item.id !== id)
  }

  function getSubscription(id: string) {
    return subscriptions.value.find((item) => item.id === id)
  }

  function addSubscription(input: SubscriptionInput, source: Subscription['source'] = 'manual', materialId?: string) {
    validateSubscription(input)
    const timestamp = new Date().toISOString()
    const subscription: Subscription = {
      ...input,
      service: input.service.trim(), category: input.category.trim(), notes: input.notes.trim(),
      id: crypto.randomUUID(), status: 'active', source, materialId,
      createdAt: timestamp, updatedAt: timestamp, duplicateState: 'none',
    }
    subscriptions.value.unshift(subscription)
    addActivity('新增订阅记录', `${subscription.service} · ${subscription.nextRenewal} 下次续费`, 'confirm')
    return subscription
  }

  function updateSubscription(id: string, input: SubscriptionInput) {
    const subscription = getSubscription(id)
    if (!subscription) throw new Error('订阅记录不存在或已删除')
    validateSubscription(input)
    Object.assign(subscription, input, {
      service: input.service.trim(), category: input.category.trim(), notes: input.notes.trim(), updatedAt: new Date().toISOString(),
    })
    addActivity('更新订阅记录', `${subscription.service}的金额、周期或续费信息已重新计算`, 'confirm')
    return subscription
  }

  function pauseSubscription(id: string) {
    const subscription = getSubscription(id)
    if (!subscription || subscription.status !== 'active') return
    subscription.status = 'paused'
    subscription.updatedAt = new Date().toISOString()
    addActivity('暂停订阅跟踪', `${subscription.service}不再计入未来支出，历史记录仍保留`, 'settings')
  }

  function resumeSubscription(id: string) {
    const subscription = getSubscription(id)
    if (!subscription || subscription.status === 'active') return
    subscription.status = 'active'
    subscription.updatedAt = new Date().toISOString()
    addActivity('恢复订阅跟踪', `${subscription.service}已恢复，预测仍取决于自动续费开关`, 'confirm')
  }

  function removeSubscription(id: string) {
    const subscription = getSubscription(id)
    if (!subscription) return
    subscriptions.value = subscriptions.value.filter((item) => item.id !== id)
    addActivity('删除本地订阅记录', `${subscription.service}已从 LifeGuard 工作区移除`, 'settings')
  }

  function setDuplicateState(id: string, state: 'distinct' | 'candidate') {
    const subscription = getSubscription(id)
    if (!subscription) return
    subscription.duplicateState = state
    subscription.updatedAt = new Date().toISOString()
  }

  function saveProfile(patch: Profile) {
    profile.value = { ...patch }
    addActivity('保存隐私与偏好设置', '基础信息已保存在本地演示工作区', 'settings')
  }

  function resetDemo() {
    const fresh = createDemoState()
    matters.value = fresh.matters
    actions.value = fresh.actions
    materials.value = fresh.materials
    subscriptions.value = fresh.subscriptions
    activities.value = fresh.activities
    histories.value = []
    fresh.matters.forEach((matter) => {
      initializeProvenance(matter)
      syncDecision(matter)
      recordHistory(matter, 'loaded', '已生成可解释评估', `规则引擎已计算 ${matter.assessment?.score ?? 0} 分并生成动态行动方案。`)
    })
    profile.value = fresh.profile
  }

  function clearDemo() {
    matters.value = []
    actions.value = []
    materials.value = []
    subscriptions.value = []
    activities.value = []
    histories.value = []
  }

  return { matters, actions, materials, subscriptions, activities, histories, profile, activeMatters, weekDue, riskMatters, completedMatters, monthlySpending, totalSaved, pendingMaterials, getMatter, getPlan, getHistories, confirmFact, toggleStep, completeMatter, reopenMatter, updateMatter, addManualMatter, addMaterial, confirmMaterial, beginRecognition, updateRecognitionProgress, finishRecognition, failRecognition, clearRecognition, removeMaterial, getSubscription, addSubscription, updateSubscription, pauseSubscription, resumeSubscription, removeSubscription, setDuplicateState, saveProfile, resetDemo, clearDemo }
})
