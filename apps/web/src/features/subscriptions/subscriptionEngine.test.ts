import { describe, expect, it } from 'vitest'
import { recognizeFields } from '@/features/materials/recognitionRules'
import { addBillingCycle, buildSavingSuggestions, buildSpendingTrend, calculateAnnualSpending, calculateMonthlySpending, findDuplicateCandidates, findHighCostSubscriptions, monthlyEquivalent, projectRenewals } from './subscriptionEngine'
import type { BillingCycle, Subscription } from '@/types'

const TODAY = '2026-11-05'

function makeSubscription(overrides: Partial<Subscription> = {}): Subscription {
  return {
    id: 'sub-test', service: '虚构订阅', category: '效率工具', amount: 30, currency: 'CNY', cycle: 'monthly',
    nextRenewal: '2026-11-10', status: 'active', autoRenew: true, source: 'manual', notes: '虚构功能说明',
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', duplicateState: 'none',
    ...overrides,
  }
}

function withCycle(cycle: BillingCycle, amount: number): Subscription {
  return makeSubscription({ cycle, amount })
}

describe('订阅周期与费用预测', () => {
  it('01 月季年周期分别按 1、3、12 个月折算', () => {
    expect(monthlyEquivalent(withCycle('monthly', 30))).toBe(30)
    expect(monthlyEquivalent(withCycle('quarterly', 90))).toBe(30)
    expect(monthlyEquivalent(withCycle('yearly', 360))).toBe(30)
  })

  it('02 未来 30 天包含今天和第 30 天', () => {
    const events = projectRenewals([
      makeSubscription({ id: 'today', nextRenewal: TODAY, cycle: 'yearly' }),
      makeSubscription({ id: 'boundary', nextRenewal: '2026-12-05' }),
    ], TODAY, 30)
    expect(events.map((event) => event.date)).toEqual([TODAY, '2026-12-05'])
  })

  it('03 第 31 天不会进入 30 天预测', () => {
    expect(projectRenewals([makeSubscription({ nextRenewal: '2026-12-06', cycle: 'yearly' })], TODAY, 30)).toEqual([])
  })

  it('04 月付会在预测窗口内逐次展开而不是只取下一笔', () => {
    const events = projectRenewals([makeSubscription()], TODAY, 45)
    expect(events.map((event) => event.date)).toEqual(['2026-11-10', '2026-12-10'])
    expect(events.every((event) => event.amount === 30)).toBe(true)
  })

  it('05 暂停、取消和未开启自动续费都不产生未来扣款', () => {
    const records = [
      makeSubscription({ id: 'paused', status: 'paused' }),
      makeSubscription({ id: 'cancelled', status: 'cancelled' }),
      makeSubscription({ id: 'manual', autoRenew: false }),
    ]
    expect(projectRenewals(records, TODAY, 365)).toEqual([])
    expect(calculateMonthlySpending(records)).toBe(0)
  })

  it('06 已过期的下次日期按真实周期推进到当前之后', () => {
    const events = projectRenewals([makeSubscription({ nextRenewal: '2026-10-10' })], TODAY, 40)
    expect(events.map((event) => event.date)).toEqual(['2026-11-10', '2026-12-10'])
  })

  it('07 月末锚点跨二月后仍保留，不会永久缩成 28 日', () => {
    const february = addBillingCycle('2026-01-31', 'monthly')
    expect(february).toBe('2026-02-28')
    expect(addBillingCycle(february, 'monthly', 31)).toBe('2026-03-31')
  })

  it('08 闰年日按目标年份真实日历处理', () => {
    expect(addBillingCycle('2024-02-29', 'yearly')).toBe('2025-02-28')
    expect(addBillingCycle('2027-02-28', 'yearly', 29)).toBe('2028-02-29')
  })

  it('09 季付月末同样按目标月天数收敛', () => {
    expect(addBillingCycle('2026-01-31', 'quarterly')).toBe('2026-04-30')
    expect(addBillingCycle('2026-04-30', 'quarterly', 31)).toBe('2026-07-31')
  })

  it('10 年度预测按月付实际排定日期求和', () => {
    expect(calculateAnnualSpending([makeSubscription({ amount: 10 })], TODAY)).toBe(120)
  })

  it('11 年度预测不会把季付误算成每月扣款', () => {
    const annual = calculateAnnualSpending([makeSubscription({ cycle: 'quarterly', amount: 100, nextRenewal: '2026-11-30' })], TODAY)
    expect(annual).toBe(400)
  })

  it('12 趋势包含 12 个自然月和真实零扣款月份', () => {
    const trend = buildSpendingTrend([makeSubscription({ cycle: 'quarterly', nextRenewal: '2026-12-10' })], TODAY)
    expect(trend).toHaveLength(12)
    expect(trend[0]).toMatchObject({ month: '2026-11', amount: 0, renewalCount: 0 })
    expect(trend[1]).toMatchObject({ month: '2026-12', amount: 30, renewalCount: 1 })
    expect(trend.reduce((total, point) => total + point.amount, 0)).toBe(120)
  })

  it('13 不同币种不混合汇总，也不使用固定汇率', () => {
    const records = [makeSubscription({ id: 'cny', amount: 30 }), makeSubscription({ id: 'usd', amount: 10, currency: 'USD' })]
    expect(calculateMonthlySpending(records, 'CNY')).toBe(30)
    expect(calculateMonthlySpending(records, 'USD')).toBe(10)
    expect(projectRenewals(records, TODAY, 30, 'USD').map((event) => event.subscriptionId)).toEqual(['usd'])
  })

  it('14 修改金额或周期后统计随记录变化', () => {
    const monthly = makeSubscription({ amount: 30 })
    expect(calculateAnnualSpending([monthly], TODAY)).toBe(360)
    expect(calculateAnnualSpending([{ ...monthly, amount: 60 }], TODAY)).toBe(720)
    expect(calculateAnnualSpending([{ ...monthly, cycle: 'yearly' }], TODAY)).toBe(30)
  })

  it('15 空记录的所有预测均为零', () => {
    expect(calculateMonthlySpending([])).toBe(0)
    expect(calculateAnnualSpending([], TODAY)).toBe(0)
    expect(buildSpendingTrend([], TODAY).every((point) => point.amount === 0)).toBe(true)
  })
})

describe('重复候选、高额提示与节省建议', () => {
  it('16 同分类有效记录形成候选并给出可解释依据', () => {
    const groups = findDuplicateCandidates([
      makeSubscription({ id: 'a', service: '笔记 A', amount: 18 }),
      makeSubscription({ id: 'b', service: '文档 B', amount: 120, cycle: 'yearly', duplicateGroup: 'notes' }),
    ])
    expect(groups).toHaveLength(1)
    expect(groups[0].monthlyEquivalentTotal).toBe(28)
    expect(groups[0].reasons.join('')).toContain('效率工具')
    expect(groups[0].reasons.join('')).toContain('不代表权益相同')
  })

  it('17 用户确认不同、暂停或币种不同的记录不凑成重复组', () => {
    const base = makeSubscription({ id: 'a' })
    expect(findDuplicateCandidates([base, makeSubscription({ id: 'b', duplicateState: 'distinct' })])).toEqual([])
    expect(findDuplicateCandidates([base, makeSubscription({ id: 'b', status: 'paused' })])).toEqual([])
    expect(findDuplicateCandidates([base, makeSubscription({ id: 'b', currency: 'USD' })], 'CNY')).toEqual([])
  })

  it('18 高额提示阈值由当前记录计算', () => {
    const records = [10, 12, 14, 100].map((amount, index) => makeSubscription({ id: String(index), amount }))
    const result = findHighCostSubscriptions(records)
    expect(result.map((item) => item.subscription.amount)).toEqual([100])
    expect(result[0].average).toBe(34)
    expect(result[0].threshold).toBe(34)
  })

  it('19 金额一致时不制造高额异常', () => {
    expect(findHighCostSubscriptions([makeSubscription({ id: 'a' }), makeSubscription({ id: 'b' })])).toEqual([])
  })

  it('20 建议提供核对方向与参考金额，但不伪造已节省结果', () => {
    const records = [makeSubscription({ id: 'a', service: '笔记 A', nextRenewal: '2026-11-08' }), makeSubscription({ id: 'b', service: '文档 B' })]
    const suggestions = buildSavingSuggestions(records, TODAY)
    expect(suggestions.some((item) => item.kind === 'duplicate')).toBe(true)
    expect(suggestions.some((item) => item.kind === 'upcoming')).toBe(true)
    expect(suggestions.every((item) => !item.title.includes('已节省') && !item.description.includes('已经节省'))).toBe(true)
    expect(suggestions.find((item) => item.kind === 'duplicate')?.referenceAmount).toBe(60)
  })
})

describe('材料周期识别边界', () => {
  it('21 明确的按月依据可提取为月付候选', () => {
    const result = recognizeFields('会员名称：虚构云笔记\n平台：虚构平台\n续费金额：¥30.00\n续费周期：按月\n下次续费日期：2026年12月1日\n自动续费', null)
    expect(result.document_type).toBe('订阅')
    expect(result.billing_cycle).toBe('monthly')
    expect(result.need_confirmation).not.toContain('billing_cycle')
  })

  it('22 订阅材料缺少周期时保留为空并要求确认', () => {
    const result = recognizeFields('会员名称：虚构云笔记\n续费金额：¥30.00\n下次续费日期：2026年12月1日\n自动续费', null)
    expect(result.billing_cycle).toBeNull()
    expect(result.need_confirmation).toContain('billing_cycle')
  })
})
