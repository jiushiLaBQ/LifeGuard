import { describe, expect, it } from 'vitest'
import { buildActionPlan } from '@/features/decision/actionEngine'
import { assessMatter } from '@/features/decision/riskEngine'
import { MATTER_RULES } from '@/features/decision/rules'
import type { Matter, MatterType, RiskFactor } from '@/types'

const TODAY = '2026-11-05'

function makeMatter(overrides: Partial<Matter> = {}): Matter {
  return {
    id: 'matter-test',
    title: '虚构测试事项',
    merchant: '虚构测试机构',
    type: 'purchase',
    status: 'active',
    risk: 'low',
    amount: 1299,
    currency: 'CNY',
    dueDate: TODAY,
    importance: 4,
    preparationDays: 2,
    obligation: '按虚构合同文本完成通知与交接',
    provenance: {
      dueDate: { source: 'user', confirmed: true },
      amount: { source: 'user', confirmed: true },
      importance: { source: 'user', confirmed: true },
      preparationDays: { source: 'user', confirmed: true },
      obligation: { source: 'user', confirmed: true },
    },
    description: '仅用于自动化测试的虚构数据。',
    nextAction: '核实规则并提交申请',
    source: 'manual',
    ...overrides,
  }
}

function factor(matter: Matter, key: RiskFactor['key']) {
  const result = assessMatter(matter, TODAY).factors.find((item) => item.key === key)
  if (!result) throw new Error(`缺少评分因素 ${key}`)
  return result
}

describe('生活风险评分场景', () => {
  it('01 退货截止今天时，时间因素满分且优先级紧急', () => {
    const assessment = assessMatter(makeMatter(), TODAY)
    expect(assessment.score).toBe(92)
    expect(assessment.level).toBe('urgent')
    expect(factor(makeMatter(), 'time').score).toBe(100)
  })

  it('02 退货期限从今天改为三天后，分数下降而非仍按固定档位处理', () => {
    const today = assessMatter(makeMatter(), TODAY)
    const later = assessMatter(makeMatter({ dueDate: '2026-11-08' }), TODAY)
    expect(later.score).toBeLessThan(today.score)
    expect(later.level).toBe('high')
    expect(factor(makeMatter({ dueDate: '2026-11-08' }), 'time').score).toBe(80)
  })

  it('03 会员明天续费时生成续费管理行动', () => {
    const matter = makeMatter({ type: 'subscription', amount: 25, dueDate: '2026-11-06', importance: 3, preparationDays: 1 })
    const assessment = assessMatter(matter, TODAY)
    const plan = buildActionPlan(matter, assessment, undefined, TODAY)
    expect(assessment.level).toBe('high')
    expect(plan.steps.some((step) => step.key === 'manage-renewal')).toBe(true)
    expect(plan.script).toContain('自动续费')
  })

  it('04 保修事项使用商品价值尺度并生成检测准备步骤', () => {
    const matter = makeMatter({ type: 'warranty', amount: 4299, exposure: 500, dueDate: '2026-11-23', preparationDays: 3 })
    const assessment = assessMatter(matter, TODAY)
    const plan = buildActionPlan(matter, assessment, undefined, TODAY)
    expect(factor(matter, 'loss').score).toBe(20)
    expect(plan.steps.some((step) => step.key === 'book-inspection')).toBe(true)
  })

  it('05 租赁合同结合到期日、押金和重要程度获得高优先级', () => {
    const matter = makeMatter({ type: 'lease', amount: 3500, dueDate: '2026-11-10', importance: 5, preparationDays: 7 })
    const assessment = assessMatter(matter, TODAY)
    expect(assessment.score).toBeGreaterThanOrEqual(80)
    expect(factor(matter, 'importance').weight).toBe(25)
  })

  it('06 课程事项生成剩余权益盘点和预约步骤', () => {
    const matter = makeMatter({ type: 'course', amount: 2399, dueDate: '2026-11-17', importance: 3 })
    const plan = buildActionPlan(matter, assessMatter(matter, TODAY), undefined, TODAY)
    expect(plan.steps.map((step) => step.key)).toContain('inventory-course')
    expect(plan.steps.map((step) => step.key)).toContain('schedule-course')
  })

  it('07 缴费事项生成官方入口核对与回执保存建议', () => {
    const matter = makeMatter({ type: 'payment', amount: 1200, dueDate: '2026-11-12', preparationDays: 1 })
    const plan = buildActionPlan(matter, assessMatter(matter, TODAY), undefined, TODAY)
    expect(plan.steps.map((step) => step.key)).toContain('verify-payment')
    expect(plan.materials).toContain('到账或办理回执')
  })

  it('08 缺少截止日期时时间分为零且不生成建议完成日期', () => {
    const matter = makeMatter({ dueDate: null })
    const assessment = assessMatter(matter, TODAY)
    const plan = buildActionPlan(matter, assessment, undefined, TODAY)
    expect(factor(matter, 'time').score).toBe(0)
    expect(plan.suggestedCompletionDate).toBeNull()
    expect(assessment.missingInformation.join('')).toContain('截止日')
  })

  it('09 缺少金额时不猜测经济损失', () => {
    const matter = makeMatter({ amount: null })
    const assessment = assessMatter(matter, TODAY)
    expect(factor(matter, 'loss').score).toBe(0)
    expect(assessment.missingInformation.join('')).toContain('不猜测潜在损失')
  })

  it('10 OCR 未核实的信息完整度低于 OCR 已核实的信息', () => {
    const pending = makeMatter({ provenance: { dueDate: { source: 'ocr', confirmed: false }, amount: { source: 'ocr', confirmed: false } } })
    const confirmed = makeMatter({ provenance: { dueDate: { source: 'ocr', confirmed: true }, amount: { source: 'ocr', confirmed: true } } })
    expect(factor(pending, 'completeness').score).toBeLessThan(factor(confirmed, 'completeness').score)
    expect(factor(pending, 'time').source).toBe('ocr')
  })

  it('11 OCR 期限未核实前不生成确定建议完成时间', () => {
    const matter = makeMatter({ dueDate: '2026-11-15', provenance: { dueDate: { source: 'ocr', confirmed: false } } })
    const plan = buildActionPlan(matter, assessMatter(matter, TODAY), undefined, TODAY)
    expect(plan.suggestedCompletionDate).toBeNull()
    expect(plan.recommendationReason).toContain('待核实')
  })

  it('12 重要性和准备时间缺失时明确标记规则暂估', () => {
    const matter = makeMatter({ importance: undefined, preparationDays: undefined })
    const assessment = assessMatter(matter, TODAY)
    expect(factor(matter, 'importance').source).toBe('inference')
    expect(factor(matter, 'preparation').source).toBe('inference')
    expect(assessment.missingInformation).toHaveLength(2)
  })

  it('13 租赁合同缺少待履行义务时进入待核实清单', () => {
    const matter = makeMatter({ type: 'lease', obligation: '' })
    const assessment = assessMatter(matter, TODAY)
    expect(assessment.missingInformation.join('')).toContain('待履行义务')
    expect(factor(matter, 'completeness').score).toBeLessThan(100)
  })

  it('14 已逾期事项增加当前办理状态核实步骤', () => {
    const matter = makeMatter({ dueDate: '2026-11-01' })
    const plan = buildActionPlan(matter, assessMatter(matter, TODAY), undefined, TODAY)
    expect(plan.steps.some((step) => step.key === 'resolve-overdue')).toBe(true)
    expect(plan.suggestedCompletionDate).toBe(TODAY)
  })

  it('15 金额为零时损失因素为零，不制造成本', () => {
    expect(factor(makeMatter({ amount: 0 }), 'loss').score).toBe(0)
  })

  it('16 超过类型金额上限时损失因素封顶一百分', () => {
    expect(factor(makeMatter({ amount: 999999 }), 'loss').score).toBe(100)
  })

  it('17 用户提高重要程度后评分相应提高', () => {
    const low = assessMatter(makeMatter({ importance: 1 }), TODAY)
    const high = assessMatter(makeMatter({ importance: 5 }), TODAY)
    expect(high.score).toBeGreaterThan(low.score)
    expect(factor(makeMatter({ importance: 5 }), 'importance').score).toBe(100)
  })

  it('18 准备时间接近剩余期限时准备因素提高', () => {
    const short = makeMatter({ dueDate: '2026-11-15', preparationDays: 1 })
    const long = makeMatter({ dueDate: '2026-11-15', preparationDays: 9 })
    expect(factor(long, 'preparation').score).toBeGreaterThan(factor(short, 'preparation').score)
  })

  it('19 已完成事项优先级归零且保留待核实信息说明', () => {
    const matter = makeMatter({ status: 'completed', dueDate: null })
    const assessment = assessMatter(matter, TODAY)
    expect(assessment.score).toBe(0)
    expect(assessment.level).toBe('low')
    expect(assessment.factors.every((item) => item.points === 0)).toBe(true)
    expect(assessment.missingInformation.length).toBeGreaterThan(0)
  })

  it('20 已忽略事项不参与风险排序', () => {
    const assessment = assessMatter(makeMatter({ status: 'dismissed' }), TODAY)
    expect(assessment.score).toBe(0)
    expect(assessment.summary).toContain('不参与')
  })

  it('21 已确认十天期限与六天准备时间时提前三天建议完成', () => {
    const matter = makeMatter({ dueDate: '2026-11-15', preparationDays: 6 })
    const plan = buildActionPlan(matter, assessMatter(matter, TODAY), undefined, TODAY)
    expect(plan.suggestedCompletionDate).toBe('2026-11-12')
    expect(plan.recommendationReason).toContain('预留 3 天')
  })

  it('22 日期、金额和下一步变化会更新分析与建议', () => {
    const updated = makeMatter({ dueDate: '2026-11-20', amount: 20, nextAction: '先核对新的售后入口' })
    const plan = buildActionPlan(updated, assessMatter(updated, TODAY), undefined, TODAY)
    expect(plan.recommendedAction).toBe('先核对新的售后入口')
    expect(plan.analysis).toContain('优先级')
    expect(plan.risks?.join('')).toContain('20')
  })

  it('23 重算保留相同稳定步骤的完成进度和方案编号', () => {
    const original = makeMatter()
    const firstPlan = buildActionPlan(original, assessMatter(original, TODAY), undefined, TODAY)
    firstPlan.steps[0].done = true
    firstPlan.steps[1].done = true
    const updated = makeMatter({ dueDate: '2026-11-08', amount: 1999 })
    const nextPlan = buildActionPlan(updated, assessMatter(updated, TODAY), firstPlan, TODAY)
    expect(nextPlan.id).toBe(firstPlan.id)
    expect(nextPlan.steps.find((step) => step.key === 'verify-facts')?.done).toBe(true)
    expect(nextPlan.steps.find((step) => step.key === 'prepare-evidence')?.done).toBe(true)
  })

  it('24 类型变化时保留通用步骤进度并替换类型专属材料', () => {
    const original = makeMatter()
    const firstPlan = buildActionPlan(original, assessMatter(original, TODAY), undefined, TODAY)
    firstPlan.steps[0].done = true
    const changed = makeMatter({ type: 'warranty' })
    const nextPlan = buildActionPlan(changed, assessMatter(changed, TODAY), firstPlan, TODAY)
    expect(nextPlan.steps.find((step) => step.key === 'verify-facts')?.done).toBe(true)
    expect(nextPlan.steps.some((step) => step.key === 'book-inspection')).toBe(true)
    expect(nextPlan.materials).toContain('设备序列号')
  })

  it('25 合同与售后沟通文本不承诺退款、退租或法律责任结论', () => {
    for (const type of ['purchase', 'lease'] as MatterType[]) {
      const matter = makeMatter({ type })
      const plan = buildActionPlan(matter, assessMatter(matter, TODAY), undefined, TODAY)
      expect(plan.script).toContain('确认')
      expect(plan.script).not.toMatch('保证退款|必然退租|依法必须赔偿')
      expect(plan.steps[0].key).toBe('verify-facts')
    }
  })

  it('26 六类事项权重均合计一百且总分等于分项贡献之和', () => {
    for (const type of Object.keys(MATTER_RULES) as MatterType[]) {
      const weights = Object.values(MATTER_RULES[type].weights).reduce((sum, weight) => sum + weight, 0)
      const matter = makeMatter({ type })
      const assessment = assessMatter(matter, TODAY)
      expect(weights).toBe(100)
      expect(assessment.score).toBe(assessment.factors.reduce((sum, item) => sum + item.points, 0))
      expect(assessment.score).toBeGreaterThanOrEqual(0)
      expect(assessment.score).toBeLessThanOrEqual(100)
    }
  })

  it('33 旧版步骤标题升级时保留原完成进度', () => {
    const matter = makeMatter()
    const legacyPlan = buildActionPlan(matter, assessMatter(matter, TODAY), undefined, TODAY)
    legacyPlan.steps = [
      { id: 'legacy-1', title: '拍摄商品与配件照片', detail: '旧版步骤', required: true, done: true },
      { id: 'legacy-2', title: '提交退货申请', detail: '旧版步骤', required: true, done: false },
    ]
    const migrated = buildActionPlan(matter, assessMatter(matter, TODAY), legacyPlan, TODAY)
    expect(migrated.steps.find((step) => step.key === 'prepare-evidence')?.done).toBe(true)
    expect(migrated.steps.find((step) => step.key === 'prepare-evidence')?.id).toBe('legacy-1')
  })
})
