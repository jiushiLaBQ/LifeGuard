import { FACT_LABELS, MATTER_RULES, RULE_VERSION, SOURCE_LABELS } from '@/features/decision/rules'
import { isValidDateString, toDateInput } from '@/shared/ui/format'
import type { FactProvenance, FactSource, Matter, MatterFactKey, MatterImportance, RiskAssessment, RiskFactor } from '@/types'

const SOURCE_RANK: Record<FactSource, number> = { user: 4, ocr: 3, inference: 2, unverified: 1 }

export function daysBetween(from: string, to: string | null): number {
  if (!to || !isValidDateString(from) || !isValidDateString(to)) return Number.POSITIVE_INFINITY
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000)
}

export function factProvenance(matter: Matter, key: MatterFactKey): FactProvenance {
  return matter.provenance?.[key] ?? { source: 'unverified', confirmed: false, note: '尚未记录来源，请核对原始材料。' }
}

export function resolvedImportance(matter: Matter): MatterImportance {
  return matter.importance ?? MATTER_RULES[matter.type].defaultImportance
}

export function resolvedPreparationDays(matter: Matter): number {
  return matter.preparationDays ?? MATTER_RULES[matter.type].defaultPreparationDays
}

function quality(provenance: FactProvenance, present: boolean): number {
  if (!present) return 0
  if (provenance.source === 'user') return provenance.confirmed ? 100 : 80
  if (provenance.source === 'ocr') return provenance.confirmed ? 90 : 50
  if (provenance.source === 'inference') return 30
  return 10
}

function amountScore(amount: number, floor: number, ceiling: number): number {
  if (amount <= 0) return 0
  if (amount >= ceiling) return 100
  if (amount <= floor) return 20
  const ratio = Math.log(amount / floor) / Math.log(ceiling / floor)
  return Math.round(20 + ratio * 80)
}

function timeScore(days: number, matter: Matter): number {
  if (!Number.isFinite(days)) return 0
  if (days < 0) return 100
  return MATTER_RULES[matter.type].timeCurve.find((threshold) => days <= threshold.maxDays)?.score ?? 0
}

function deadlineText(days: number): string {
  if (!Number.isFinite(days)) return '尚未提供'
  if (days < 0) return `所记录日期已过去 ${Math.abs(days)} 天`
  if (days === 0) return '今天到期'
  return `还有 ${days} 天`
}

function sourceNote(provenance: FactProvenance): string {
  return `${SOURCE_LABELS[provenance.source]}${provenance.confirmed ? '且已核对' : '，尚未核对'}`
}

function pendingText(key: MatterFactKey, provenance: FactProvenance, fallback?: string): string {
  if (provenance.source === 'inference') return `${FACT_LABELS[key]}未填写，暂按${fallback}计算，请确认`
  if (provenance.source === 'ocr' && !provenance.confirmed) return `${FACT_LABELS[key]}来自 OCR，仍需核对原始材料`
  return `${FACT_LABELS[key]}仍需你确认`
}

export function assessMatter(matter: Matter, today = toDateInput(new Date())): RiskAssessment {
  const rule = MATTER_RULES[matter.type]
  const dueDate = matter.dueDate && isValidDateString(matter.dueDate) ? matter.dueDate : null
  const amount = matter.amount !== null && Number.isFinite(matter.amount) && matter.amount >= 0 ? matter.amount : null
  const exposure = matter.exposure !== undefined && Number.isFinite(matter.exposure) && matter.exposure >= 0 ? matter.exposure : amount
  const importance = resolvedImportance(matter)
  const preparationDays = resolvedPreparationDays(matter)
  const days = daysBetween(today, dueDate)

  const dueProvenance = dueDate ? factProvenance(matter, 'dueDate') : { source: 'unverified' as const, confirmed: false }
  const amountProvenance = amount !== null ? factProvenance(matter, 'amount') : { source: 'unverified' as const, confirmed: false }
  const importanceProvenance = matter.importance === undefined
    ? { source: 'inference' as const, confirmed: false }
    : factProvenance(matter, 'importance')
  const preparationProvenance = matter.preparationDays === undefined
    ? { source: 'inference' as const, confirmed: false }
    : factProvenance(matter, 'preparationDays')

  const missingInformation: string[] = []
  if (!dueDate) missingInformation.push(`${rule.deadlineLabel}尚未提供`)
  else if (!dueProvenance.confirmed) missingInformation.push(pendingText('dueDate', dueProvenance))
  if (amount === null) missingInformation.push(`${rule.amountLabel}尚未提供，不猜测潜在损失`)
  else if (!amountProvenance.confirmed) missingInformation.push(pendingText('amount', amountProvenance))
  if (!importanceProvenance.confirmed) missingInformation.push(pendingText('importance', importanceProvenance, `${importance}/5`))
  if (!preparationProvenance.confirmed) missingInformation.push(pendingText('preparationDays', preparationProvenance, `${preparationDays} 天`))
  if (rule.requiresObligation) {
    if (!matter.obligation?.trim()) missingInformation.push('合同待履行义务尚未提供，请核对合同文本')
    else if (!factProvenance(matter, 'obligation').confirmed) missingInformation.push(pendingText('obligation', factProvenance(matter, 'obligation')))
  }

  const rawTimeScore = timeScore(days, matter)
  const preparationScore = !Number.isFinite(days)
    ? Math.min(60, preparationDays * 10)
    : days < 0 || preparationDays >= days + 1
      ? 100
      : Math.min(100, Math.round(preparationDays / (days + 1) * 100))

  const facts: Array<{ key: MatterFactKey; present: boolean; provenance: FactProvenance }> = [
    { key: 'dueDate', present: dueDate !== null, provenance: dueProvenance },
    { key: 'amount', present: amount !== null, provenance: amountProvenance },
    { key: 'importance', present: true, provenance: importanceProvenance },
    { key: 'preparationDays', present: true, provenance: preparationProvenance },
  ]
  if (rule.requiresObligation) {
    facts.push({
      key: 'obligation',
      present: Boolean(matter.obligation?.trim()),
      provenance: factProvenance(matter, 'obligation'),
    })
  }
  const completenessScore = Math.round(facts.reduce((total, fact) => total + quality(fact.provenance, fact.present), 0) / facts.length)
  const weakestSource = facts.reduce<FactSource>((weakest, fact) => {
    const source = fact.present ? fact.provenance.source : 'unverified'
    return SOURCE_RANK[source] < SOURCE_RANK[weakest] ? source : weakest
  }, 'user')

  const factors: RiskFactor[] = [
    {
      key: 'time', label: '时间紧迫程度', weight: rule.weights.time, score: rawTimeScore,
      points: 0, source: dueProvenance.source,
      explanation: dueDate
        ? `${rule.deadlineLabel}${deadlineText(days)}，按${matter.type === 'lease' ? '合同' : '该事项'}期限曲线计 ${rawTimeScore} 分；${sourceNote(dueProvenance)}。`
        : `缺少${rule.deadlineLabel}，时间因素计 0 分，不用猜测日期补齐。`,
    },
    {
      key: 'loss', label: '潜在经济损失', weight: rule.weights.loss, score: amountScore(exposure ?? 0, rule.amountFloor, rule.amountCeiling),
      points: 0, source: amountProvenance.source,
      explanation: exposure === null
        ? `${rule.amountLabel}缺失，损失因素计 0 分。`
        : `按${rule.amountLabel} ${exposure} ${matter.currency} 与分类型金额尺度计分；这是排序依据，不是实际损失或赔付承诺。`,
    },
    {
      key: 'importance', label: '事项重要程度', weight: rule.weights.importance, score: importance * 20,
      points: 0, source: importanceProvenance.source,
      explanation: `重要程度为 ${importance}/5，映射为 ${importance * 20} 分；${matter.importance === undefined ? '该值由事项类型规则暂估。' : sourceNote(importanceProvenance) + '。'}`,
    },
    {
      key: 'preparation', label: '处理准备时间', weight: rule.weights.preparation, score: preparationScore,
      points: 0, source: preparationProvenance.source,
      explanation: Number.isFinite(days)
        ? `预计准备 ${preparationDays} 天，${deadlineText(days)}；准备时间越接近或超过剩余时间，得分越高。`
        : `预计准备 ${preparationDays} 天，但截止日缺失，无法比较时间余量，仅按准备工作量计分。`,
    },
    {
      key: 'completeness', label: '信息完整程度', weight: rule.weights.completeness, score: completenessScore,
      points: 0, source: weakestSource,
      explanation: `综合期限、金额、重要性、准备时间${rule.requiresObligation ? '和合同义务' : ''}的来源与确认状态；用户核对的信息得分最高，推断和未核实信息会降低本项得分。`,
    },
  ]
  factors.forEach((factor) => { factor.points = Math.round(factor.score * factor.weight / 100) })

  if (matter.status === 'completed' || matter.status === 'dismissed') {
    factors.forEach((factor) => {
      factor.score = 0
      factor.points = 0
      factor.explanation = '事项当前不参与待处理优先级排序，原评估因素保留在历史记录中。'
    })
    return {
      score: 0, level: 'low', factors, ruleVersion: RULE_VERSION, missingInformation,
      summary: matter.status === 'completed' ? '事项已完成，优先级归零；可恢复待处理后重新计算。' : '事项已忽略，不参与当前优先级排序。',
    }
  }

  const score = Math.min(100, factors.reduce((total, factor) => total + factor.points, 0))
  const level = score >= 80 ? 'urgent' : score >= 65 ? 'high' : score >= 40 ? 'medium' : 'low'
  const strongest = [...factors].sort((a, b) => b.points - a.points).slice(0, 2).map((factor) => factor.label).join('、')
  return {
    score, level, factors, missingInformation, ruleVersion: RULE_VERSION,
    summary: `当前优先级主要由${strongest}贡献。${missingInformation.length ? `仍有 ${missingInformation.length} 项信息需要补充或核实。` : '关键信息均已核对。'}`,
  }
}
