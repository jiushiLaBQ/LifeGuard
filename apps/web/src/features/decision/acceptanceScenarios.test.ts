import { describe, expect, it } from 'vitest'
import { buildActionPlan } from '@/features/decision/actionEngine'
import { assessMatter } from '@/features/decision/riskEngine'
import {
  addBillingCycle, buildSavingSuggestions, buildSpendingTrend, calculateAnnualSpending, calculateMonthlySpending,
  findDuplicateCandidates, findHighCostSubscriptions, monthlyEquivalent, projectRenewals,
} from '@/features/subscriptions/subscriptionEngine'
import type { Matter, Subscription } from '@/types'

const TODAY = '2026-11-07'

function day(offset: number): string {
  const date = new Date(`${TODAY}T12:00:00Z`)
  date.setUTCDate(date.getUTCDate() + offset)
  return date.toISOString().slice(0, 10)
}

function confirmedProvenance(): Matter['provenance'] {
  return {
    dueDate: { source: 'user', confirmed: true },
    amount: { source: 'user', confirmed: true },
    importance: { source: 'user', confirmed: true },
    preparationDays: { source: 'user', confirmed: true },
  }
}

function matter(overrides: Partial<Matter> = {}): Matter {
  return {
    id: 'scenario', title: '虚构验收事项', merchant: '虚构商家', type: 'purchase', status: 'active', risk: 'low',
    amount: 100, currency: 'CNY', dueDate: day(7), description: '算法验收虚构场景，不对应真实材料。',
    nextAction: '核对并处理', source: 'manual', importance: 3, preparationDays: 2, provenance: confirmedProvenance(),
    ...overrides,
  }
}

function planOf(target: Matter) {
  return buildActionPlan(target, assessMatter(target, TODAY), undefined, TODAY)
}

function sub(overrides: Partial<Subscription> = {}): Subscription {
  return {
    id: 'sub-scenario', service: '虚构会员', category: '影音娱乐', amount: 25, currency: 'CNY', cycle: 'monthly',
    nextRenewal: day(2), status: 'active', autoRenew: true, source: 'manual', notes: '',
    createdAt: '', updatedAt: '', duplicateState: 'none', ...overrides,
  }
}

describe('竞赛验收算法场景矩阵', () => {
  it('A01 紧急但金额较低：时间主导评分，仍进入高优先级', () => {
    const target = matter({ dueDate: day(0), amount: 50, importance: 2, preparationDays: 1 })
    const assessment = assessMatter(target, TODAY)
    expect(assessment.factors.find((f) => f.key === 'time')!.points).toBe(40)
    expect(assessment.factors.find((f) => f.key === 'loss')!.points).toBe(5)
    expect(assessment.score).toBe(71)
    expect(assessment.level).toBe('high')
    expect(planOf(target).suggestedCompletionDate).toBe(TODAY)
  })

  it('A02 不紧急但损失较大：金额 alone 不会制造紧急', () => {
    const target = matter({ type: 'warranty', dueDate: day(60), amount: 8000, importance: 4, preparationDays: 3 })
    const assessment = assessMatter(target, TODAY)
    expect(assessment.factors.find((f) => f.key === 'loss')!.points).toBe(30)
    expect(assessment.factors.find((f) => f.key === 'time')!.points).toBe(4)
    expect(assessment.score).toBe(57)
    expect(assessment.level).toBe('medium')
    expect(planOf(target).suggestedCompletionDate).toBe(day(58))
  })

  it('A03 即将续费的会员：续费曲线计分并给出处置步骤', () => {
    const target = matter({ type: 'subscription', dueDate: day(2), amount: 25, preparationDays: 1 })
    const assessment = assessMatter(target, TODAY)
    expect(assessment.score).toBe(66)
    expect(assessment.level).toBe('high')
    const plan = planOf(target)
    expect(plan.steps.map((step) => step.key)).toContain('manage-renewal')
    expect(plan.suggestedCompletionDate).toBe(day(1))
  })

  it('A04 已过期事项：插入逾期核实步骤且建议今天联系', () => {
    const target = matter({ dueDate: day(-3), amount: 1299, importance: 4 })
    const assessment = assessMatter(target, TODAY)
    expect(assessment.score).toBe(92)
    expect(assessment.level).toBe('urgent')
    const plan = planOf(target)
    expect(plan.steps[1].key).toBe('resolve-overdue')
    expect(plan.suggestedCompletionDate).toBe(TODAY)
    expect((plan.risks ?? []).some((risk) => risk.includes('已过去 3 天'))).toBe(true)
  })

  it('A05 日期不明确的材料：时间计零且不伪造建议日期', () => {
    const target = matter({ dueDate: null, provenance: { ...confirmedProvenance(), dueDate: { source: 'unverified', confirmed: false } } })
    const assessment = assessMatter(target, TODAY)
    expect(assessment.factors.find((f) => f.key === 'time')!.score).toBe(0)
    expect(assessment.missingInformation).toContain('退货或售后截止日尚未提供')
    const plan = planOf(target)
    expect(plan.suggestedCompletionDate).toBeNull()
    expect((plan.risks ?? [])[0]).toContain('缺少截止日期')
  })

  it('A06 OCR 日期未核对：完整度降级且暂不生成建议日期', () => {
    const target = matter({ provenance: { ...confirmedProvenance(), dueDate: { source: 'ocr', confirmed: false } } })
    const assessment = assessMatter(target, TODAY)
    expect(assessment.factors.find((f) => f.key === 'completeness')!.score).toBe(88)
    expect(assessment.missingInformation.some((item) => item.includes('来自 OCR'))).toBe(true)
    expect(planOf(target).suggestedCompletionDate).toBeNull()
  })

  it('A07 多个待办并存：按综合分排序而非日期或金额单因素', () => {
    const a = matter({ id: 'a', dueDate: day(0), amount: 1299, importance: 4 })
    const b = matter({ id: 'b', type: 'warranty', dueDate: day(20), amount: 5000, importance: 5, preparationDays: 3 })
    const c = matter({ id: 'c', type: 'payment', dueDate: day(7), amount: 1200, importance: 4, preparationDays: 1 })
    const scores = [a, b, c].map((item) => assessMatter(item, TODAY).score)
    expect(scores).toEqual([92, 68, 78])
    expect([a, b, c].sort((x, y) => assessMatter(y, TODAY).score - assessMatter(x, TODAY).score).map((item) => item.id)).toEqual(['a', 'c', 'b'])
  })

  it('A08 信息缺失的合同：义务缺口进入缺失清单且评分保持低位', () => {
    const target = matter({ type: 'lease', dueDate: null, amount: null, importance: undefined, preparationDays: undefined, provenance: {} })
    const assessment = assessMatter(target, TODAY)
    expect(assessment.missingInformation).toContain('合同待履行义务尚未提供，请核对合同文本')
    expect(assessment.score).toBe(36)
    expect(assessment.level).toBe('low')
    const plan = planOf(target)
    expect(plan.steps.map((step) => step.key)).toContain('review-contract')
    expect((plan.risks ?? []).some((risk) => risk.includes('合同提示'))).toBe(true)
  })

  it('A09 合同义务已核对与待核实：完整度与总分区分来源可靠性', () => {
    const base = { type: 'lease' as const, dueDate: day(10), amount: 3500, importance: 5 as const, preparationDays: 7, obligation: '提前 30 天书面通知' }
    const confirmed = matter({ ...base, provenance: { ...confirmedProvenance(), obligation: { source: 'user', confirmed: true } } })
    const pending = matter({ ...base, provenance: { ...confirmedProvenance(), obligation: { source: 'unverified', confirmed: false } } })
    const confirmedAssessment = assessMatter(confirmed, TODAY)
    const pendingAssessment = assessMatter(pending, TODAY)
    expect(confirmedAssessment.score).toBe(83)
    expect(pendingAssessment.score).toBe(80)
    expect(pendingAssessment.missingInformation.some((item) => item.includes('待履行义务'))).toBe(true)
    expect(confirmedAssessment.missingInformation).toHaveLength(0)
  })

  it('A10 重复订阅：同分类同币种形成候选组并给出依据', () => {
    const subs = [
      sub({ id: 's1', service: '虚构笔记', category: '效率工具', amount: 18, duplicateGroup: 'notes' }),
      sub({ id: 's2', service: '虚构文档', category: '效率工具', amount: 108, cycle: 'yearly', duplicateGroup: 'notes' }),
    ]
    const groups = findDuplicateCandidates(subs, 'CNY')
    expect(groups).toHaveLength(1)
    expect(groups[0].reasons.some((reason) => reason.includes('相同的相似服务组标记'))).toBe(true)
    expect(groups[0].monthlyEquivalentTotal).toBe(27)
    const distinct = findDuplicateCandidates([subs[0], { ...subs[1], duplicateState: 'distinct' }], 'CNY')
    expect(distinct).toHaveLength(0)
  })

  it('A11 重复判断只给依据：建议文案不预判浪费', () => {
    const subs = [sub({ id: 's1', category: '效率工具' }), sub({ id: 's2', service: '虚构文档', category: '效率工具' })]
    const groups = findDuplicateCandidates(subs, 'CNY')
    expect(groups[0].reasons.some((reason) => reason.includes('分类相同不代表权益相同'))).toBe(true)
    const suggestion = buildSavingSuggestions(subs, TODAY, 'CNY').find((item) => item.kind === 'duplicate')!
    expect(suggestion.description).toContain('不预判浪费')
    expect(suggestion.referenceAmount).toBe(50)
  })

  it('A12 续费窗口边界：当天扣款计入第 0 天', () => {
    const events = projectRenewals([sub({ nextRenewal: TODAY })], TODAY, 0)
    expect(events).toHaveLength(1)
    expect(events[0].date).toBe(TODAY)
  })

  it('A13 暂停与关闭自动续费：不产生提醒也不计入月支出', () => {
    const subs = [sub({ id: 'p', status: 'paused' }), sub({ id: 'n', autoRenew: false })]
    expect(projectRenewals(subs, TODAY, 30)).toHaveLength(0)
    expect(calculateMonthlySpending(subs)).toBe(0)
  })

  it('A14 周期锚点：月末与闰年不会漂移出错误日期', () => {
    expect(addBillingCycle('2027-01-31', 'monthly')).toBe('2027-02-28')
    expect(addBillingCycle('2028-02-29', 'yearly')).toBe('2029-02-28')
    expect(addBillingCycle('2026-11-30', 'quarterly')).toBe('2027-02-28')
  })

  it('A15 月等值换算：季付除 3、年付除 12', () => {
    expect(monthlyEquivalent(sub({ cycle: 'quarterly', amount: 90 }))).toBe(30)
    expect(monthlyEquivalent(sub({ cycle: 'yearly', amount: 120 }))).toBe(10)
    expect(monthlyEquivalent(sub({ cycle: 'monthly', amount: 25 }))).toBe(25)
  })

  it('A16 年度预测保留零金额月份且总额等于排定扣款', () => {
    const subs = [sub({ cycle: 'yearly', amount: 120, nextRenewal: day(40) })]
    const trend = buildSpendingTrend(subs, TODAY)
    expect(trend).toHaveLength(12)
    expect(trend[0].amount).toBe(0)
    expect(calculateAnnualSpending(subs, TODAY)).toBe(120)
  })

  it('A17 高额提示线：取均值与中位数 1.5 倍的较高者', () => {
    const subs = [sub({ id: 'a', amount: 10 }), sub({ id: 'b', amount: 12 }), sub({ id: 'c', amount: 100 })]
    const high = findHighCostSubscriptions(subs)
    expect(high).toHaveLength(1)
    expect(high[0].subscription.id).toBe('c')
    expect(high[0].threshold).toBeCloseTo(122 / 3, 6)
    expect(high[0].reason).toContain('复核提示')
  })

  it('A18 已完成事项：评分归零且方案退出时间安排', () => {
    const target = matter({ status: 'completed', completedOn: day(-1), outcome: '已处理' })
    const assessment = assessMatter(target, TODAY)
    expect(assessment.score).toBe(0)
    expect(assessment.level).toBe('low')
    const plan = planOf(target)
    expect(plan.suggestedCompletionDate).toBeNull()
    expect(plan.recommendedAction).toContain('恢复待处理')
  })

  it('A19 重要性缺失：标记为规则暂估并进入待确认清单', () => {
    const target = matter({ importance: undefined, preparationDays: undefined, provenance: { dueDate: { source: 'user', confirmed: true }, amount: { source: 'user', confirmed: true } } })
    const assessment = assessMatter(target, TODAY)
    expect(assessment.factors.find((f) => f.key === 'importance')!.source).toBe('inference')
    expect(assessment.missingInformation.some((item) => item.includes('暂按'))).toBe(true)
    expect(assessment.factors.find((f) => f.key === 'importance')!.score).toBe(60)
  })

  it('A20 准备时间超过剩余窗口：准备风险显式提示', () => {
    const target = matter({ dueDate: day(3), preparationDays: 5 })
    const assessment = assessMatter(target, TODAY)
    expect(assessment.factors.find((f) => f.key === 'preparation')!.score).toBe(100)
    expect((planOf(target).risks ?? []).some((risk) => risk.includes('准备风险'))).toBe(true)
  })

  it('A21 金额缺失：损失计零且声明不猜测潜在损失', () => {
    const target = matter({ amount: null, provenance: { ...confirmedProvenance(), amount: { source: 'unverified', confirmed: false } } })
    const assessment = assessMatter(target, TODAY)
    const loss = assessment.factors.find((f) => f.key === 'loss')!
    expect(loss.score).toBe(0)
    expect(loss.explanation).toContain('缺失')
    expect(assessment.missingInformation.some((item) => item.includes('不猜测潜在损失'))).toBe(true)
  })

  it('A22 来源可靠性：全部已核对与全部待核实的完整度差', () => {
    const confirmed = matter()
    const unverified = matter({ provenance: {} })
    const difference = assessMatter(confirmed, TODAY).score - assessMatter(unverified, TODAY).score
    expect(difference).toBe(9)
    expect(assessMatter(unverified, TODAY).factors.find((f) => f.key === 'completeness')!.score).toBe(10)
  })

  it('A23 币种隔离：美元记录不混入人民币统计与预测', () => {
    const subs = [sub({ id: 'cny', amount: 25 }), sub({ id: 'usd', currency: 'USD', amount: 10 })]
    expect(calculateMonthlySpending(subs, 'CNY')).toBe(25)
    expect(calculateMonthlySpending(subs, 'USD')).toBe(10)
    expect(buildSpendingTrend(subs, TODAY, 'CNY').reduce((total, point) => total + point.amount, 0)).toBe(300)
  })

  it('A24 过期续费日向前滚动：保留扣款锚点日', () => {
    const events = projectRenewals([sub({ nextRenewal: '2026-09-28' })], TODAY, 30)
    expect(events[0].date).toBe('2026-11-28')
  })

  it('A25 节省建议的续费窗口：只提醒 7 天内扣款', () => {
    const subs = [sub({ id: 'soon', nextRenewal: day(5) }), sub({ id: 'later', nextRenewal: day(10) })]
    const upcoming = buildSavingSuggestions(subs, TODAY, 'CNY').filter((item) => item.kind === 'upcoming')
    expect(upcoming).toHaveLength(1)
    expect(upcoming[0]!.subscriptionIds).toEqual(['soon'])
    expect(upcoming[0]!.title).toContain(day(5))
  })
})