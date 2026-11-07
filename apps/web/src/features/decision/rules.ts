import type { MatterImportance, MatterType, RiskFactor } from '@/types'

export const RULE_VERSION = 'lifeguard-rules-1.0'

export interface TimeThreshold {
  maxDays: number
  score: number
}

export interface MatterRule {
  weights: Record<RiskFactor['key'], number>
  timeCurve: TimeThreshold[]
  amountFloor: number
  amountCeiling: number
  defaultImportance: MatterImportance
  defaultPreparationDays: number
  deadlineLabel: string
  amountLabel: string
  requiresObligation?: boolean
}

export const MATTER_RULES: Record<MatterType, MatterRule> = {
  purchase: {
    weights: { time: 40, loss: 25, importance: 15, preparation: 10, completeness: 10 },
    timeCurve: [
      { maxDays: 0, score: 100 }, { maxDays: 2, score: 95 }, { maxDays: 7, score: 80 },
      { maxDays: 14, score: 55 }, { maxDays: 30, score: 25 }, { maxDays: Number.POSITIVE_INFINITY, score: 10 },
    ],
    amountFloor: 100,
    amountCeiling: 3000,
    defaultImportance: 3,
    defaultPreparationDays: 2,
    deadlineLabel: '退货或售后截止日',
    amountLabel: '商品金额或预计损失',
  },
  subscription: {
    weights: { time: 40, loss: 20, importance: 15, preparation: 10, completeness: 15 },
    timeCurve: [
      { maxDays: 0, score: 100 }, { maxDays: 1, score: 95 }, { maxDays: 3, score: 85 },
      { maxDays: 7, score: 60 }, { maxDays: 14, score: 30 }, { maxDays: Number.POSITIVE_INFINITY, score: 10 },
    ],
    amountFloor: 20,
    amountCeiling: 500,
    defaultImportance: 3,
    defaultPreparationDays: 1,
    deadlineLabel: '下次续费日',
    amountLabel: '续费金额',
  },
  warranty: {
    weights: { time: 35, loss: 30, importance: 15, preparation: 10, completeness: 10 },
    timeCurve: [
      { maxDays: 0, score: 100 }, { maxDays: 3, score: 90 }, { maxDays: 7, score: 75 },
      { maxDays: 14, score: 60 }, { maxDays: 30, score: 35 }, { maxDays: Number.POSITIVE_INFINITY, score: 10 },
    ],
    amountFloor: 500,
    amountCeiling: 5000,
    defaultImportance: 4,
    defaultPreparationDays: 3,
    deadlineLabel: '保修结束日',
    amountLabel: '商品价值或预计维修损失',
  },
  lease: {
    weights: { time: 30, loss: 15, importance: 25, preparation: 15, completeness: 15 },
    timeCurve: [
      { maxDays: 0, score: 100 }, { maxDays: 7, score: 90 }, { maxDays: 15, score: 75 },
      { maxDays: 30, score: 55 }, { maxDays: 60, score: 30 }, { maxDays: Number.POSITIVE_INFINITY, score: 10 },
    ],
    amountFloor: 1000,
    amountCeiling: 10000,
    defaultImportance: 5,
    defaultPreparationDays: 7,
    deadlineLabel: '合同到期或通知截止日',
    amountLabel: '押金或相关履约金额',
    requiresObligation: true,
  },
  course: {
    weights: { time: 35, loss: 20, importance: 20, preparation: 10, completeness: 15 },
    timeCurve: [
      { maxDays: 0, score: 100 }, { maxDays: 3, score: 90 }, { maxDays: 7, score: 75 },
      { maxDays: 14, score: 55 }, { maxDays: 30, score: 30 }, { maxDays: Number.POSITIVE_INFINITY, score: 10 },
    ],
    amountFloor: 300,
    amountCeiling: 5000,
    defaultImportance: 3,
    defaultPreparationDays: 2,
    deadlineLabel: '课程有效期截止日',
    amountLabel: '课程金额或未使用权益价值',
  },
  payment: {
    weights: { time: 40, loss: 15, importance: 20, preparation: 10, completeness: 15 },
    timeCurve: [
      { maxDays: 0, score: 100 }, { maxDays: 2, score: 95 }, { maxDays: 7, score: 85 },
      { maxDays: 14, score: 60 }, { maxDays: 30, score: 35 }, { maxDays: Number.POSITIVE_INFINITY, score: 10 },
    ],
    amountFloor: 100,
    amountCeiling: 3000,
    defaultImportance: 4,
    defaultPreparationDays: 1,
    deadlineLabel: '缴费或办理截止日',
    amountLabel: '待办理金额',
  },
}

export const FACT_LABELS = {
  dueDate: '截止日期',
  amount: '涉及金额',
  importance: '重要程度',
  preparationDays: '准备时间',
  obligation: '待履行义务',
} as const

export const SOURCE_LABELS = {
  user: '用户提供',
  ocr: 'OCR 识别',
  inference: '规则暂估',
  unverified: '待核实',
} as const
