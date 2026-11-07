import type { BillingCycle, Subscription } from '@/types'

export interface RenewalEvent {
  id: string
  subscriptionId: string
  service: string
  date: string
  amount: number
  currency: Subscription['currency']
  cycle: BillingCycle
}

export interface SpendingTrendPoint {
  month: string
  amount: number
  renewalCount: number
}

export interface DuplicateCandidateGroup {
  id: string
  category: string
  currency: Subscription['currency']
  subscriptions: Subscription[]
  reasons: string[]
  monthlyEquivalentTotal: number
}

export interface HighCostSubscription {
  subscription: Subscription
  monthlyEquivalent: number
  threshold: number
  average: number
  reason: string
}

export interface SavingSuggestion {
  id: string
  kind: 'duplicate' | 'high-cost' | 'upcoming'
  title: string
  description: string
  subscriptionIds: string[]
  referenceAmount?: number
  currency?: Subscription['currency']
  referenceLabel?: string
}

function utcDate(value: string): Date {
  return new Date(`${value}T00:00:00Z`)
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function addDays(value: string, days: number): string {
  const date = utcDate(value)
  date.setUTCDate(date.getUTCDate() + days)
  return isoDate(date)
}

function daysBetween(start: string, end: string): number {
  return Math.round((utcDate(end).getTime() - utcDate(start).getTime()) / 86400000)
}

export function monthlyEquivalent(subscription: Subscription): number {
  if (subscription.cycle === 'yearly') return subscription.amount / 12
  if (subscription.cycle === 'quarterly') return subscription.amount / 3
  return subscription.amount
}

export function addBillingCycle(value: string, cycle: BillingCycle, anchorDay = Number(value.slice(8, 10))): string {
  const date = utcDate(value)
  const months = cycle === 'yearly' ? 12 : cycle === 'quarterly' ? 3 : 1
  const firstOfTargetMonth = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1))
  const lastDay = new Date(Date.UTC(firstOfTargetMonth.getUTCFullYear(), firstOfTargetMonth.getUTCMonth() + 1, 0)).getUTCDate()
  firstOfTargetMonth.setUTCDate(Math.min(anchorDay, lastDay))
  return isoDate(firstOfTargetMonth)
}

function isForecastable(subscription: Subscription): boolean {
  return subscription.status === 'active' && subscription.autoRenew
}

export function projectRenewals(
  subscriptions: Subscription[],
  today: string,
  days: number,
  currency?: Subscription['currency'],
): RenewalEvent[] {
  if (days < 0) return []
  const end = addDays(today, days)
  const events: RenewalEvent[] = []
  for (const subscription of subscriptions) {
    if (!isForecastable(subscription) || (currency && subscription.currency !== currency)) continue
    const anchorDay = Number(subscription.nextRenewal.slice(8, 10))
    let date = subscription.nextRenewal
    while (date < today) date = addBillingCycle(date, subscription.cycle, anchorDay)
    while (date <= end) {
      events.push({
        id: `${subscription.id}:${date}`,
        subscriptionId: subscription.id,
        service: subscription.service,
        date,
        amount: subscription.amount,
        currency: subscription.currency,
        cycle: subscription.cycle,
      })
      date = addBillingCycle(date, subscription.cycle, anchorDay)
    }
  }
  return events.sort((a, b) => a.date.localeCompare(b.date) || a.service.localeCompare(b.service))
}

export function calculateMonthlySpending(subscriptions: Subscription[], currency: Subscription['currency'] = 'CNY'): number {
  return subscriptions
    .filter((subscription) => isForecastable(subscription) && subscription.currency === currency)
    .reduce((total, subscription) => total + monthlyEquivalent(subscription), 0)
}

export function buildSpendingTrend(
  subscriptions: Subscription[],
  today: string,
  currency: Subscription['currency'] = 'CNY',
): SpendingTrendPoint[] {
  const firstMonth = `${today.slice(0, 7)}-01`
  const endExclusive = addBillingCycle(firstMonth, 'yearly', 1)
  const events = projectRenewals(subscriptions, today, daysBetween(today, endExclusive) - 1, currency)
  let month = firstMonth
  return Array.from({ length: 12 }, () => {
    const key = month.slice(0, 7)
    const monthEvents = events.filter((event) => event.date.startsWith(key))
    const point = {
      month: key,
      amount: monthEvents.reduce((total, event) => total + event.amount, 0),
      renewalCount: monthEvents.length,
    }
    month = addBillingCycle(month, 'monthly', 1)
    return point
  })
}

export function calculateAnnualSpending(subscriptions: Subscription[], today: string, currency: Subscription['currency'] = 'CNY'): number {
  return buildSpendingTrend(subscriptions, today, currency).reduce((total, point) => total + point.amount, 0)
}

export function findDuplicateCandidates(subscriptions: Subscription[], currency?: Subscription['currency']): DuplicateCandidateGroup[] {
  const groups = new Map<string, Subscription[]>()
  for (const subscription of subscriptions) {
    if (subscription.status !== 'active' || subscription.duplicateState === 'distinct') continue
    if (currency && subscription.currency !== currency) continue
    const key = `${subscription.category.trim().toLocaleLowerCase()}:${subscription.currency}`
    groups.set(key, [...(groups.get(key) ?? []), subscription])
  }
  return Array.from(groups, ([id, items]) => {
    const sharedGroup = items.every((item) => item.duplicateGroup && item.duplicateGroup === items[0].duplicateGroup)
    const reasons = [`${items.length} 条有效记录同属「${items[0].category}」分类`]
    if (sharedGroup) reasons.push('这些记录已带有相同的相似服务组标记')
    reasons.push('分类相同不代表权益相同，请对照功能、账号、使用频率与实际合同')
    return {
      id,
      category: items[0].category,
      currency: items[0].currency,
      subscriptions: items.sort((a, b) => monthlyEquivalent(b) - monthlyEquivalent(a)),
      reasons,
      monthlyEquivalentTotal: items.reduce((total, item) => total + monthlyEquivalent(item), 0),
    }
  }).filter((group) => group.subscriptions.length > 1)
}

export function findHighCostSubscriptions(subscriptions: Subscription[], currency: Subscription['currency'] = 'CNY'): HighCostSubscription[] {
  const items = subscriptions
    .filter((subscription) => isForecastable(subscription) && subscription.currency === currency)
    .map((subscription) => ({ subscription, monthlyEquivalent: monthlyEquivalent(subscription) }))
    .sort((a, b) => b.monthlyEquivalent - a.monthlyEquivalent)
  if (items.length < 2) return []
  const sortedCosts = items.map((item) => item.monthlyEquivalent).sort((a, b) => a - b)
  const middle = Math.floor(sortedCosts.length / 2)
  const median = sortedCosts.length % 2 ? sortedCosts[middle] : (sortedCosts[middle - 1] + sortedCosts[middle]) / 2
  const average = sortedCosts.reduce((total, value) => total + value, 0) / sortedCosts.length
  const threshold = Math.max(average, median * 1.5)
  return items.filter((item) => item.monthlyEquivalent > threshold).map((item) => ({
    ...item,
    threshold,
    average,
    reason: `每月等值高于当前同币种有效自动续费记录的平均值，且超过动态提示线；这只是复核提示，不代表该服务不值得保留。`,
  }))
}

export function buildSavingSuggestions(
  subscriptions: Subscription[],
  today: string,
  currency: Subscription['currency'] = 'CNY',
): SavingSuggestion[] {
  const suggestions: SavingSuggestion[] = []
  for (const group of findDuplicateCandidates(subscriptions, currency)) {
    suggestions.push({
      id: `duplicate:${group.id}`,
      kind: 'duplicate',
      title: `核对 ${group.subscriptions.map((item) => item.service).join(' 与 ')} 的实际权益`,
      description: '先确认功能是否重叠、是否分别使用。只有你在服务商处实际停止续费后，才能记录真实少支出；此处不预判浪费。',
      subscriptionIds: group.subscriptions.map((item) => item.id),
      referenceAmount: group.monthlyEquivalentTotal,
      currency: group.currency,
      referenceLabel: '候选记录每月等值合计',
    })
  }
  const firstMonth = `${today.slice(0, 7)}-01`
  const annualDays = daysBetween(today, addBillingCycle(firstMonth, 'yearly', 1)) - 1
  for (const item of findHighCostSubscriptions(subscriptions, currency)) {
    const scheduled = projectRenewals([item.subscription], today, annualDays, currency).reduce((total, event) => total + event.amount, 0)
    suggestions.push({
      id: `high-cost:${item.subscription.id}`,
      kind: 'high-cost',
      title: `复核 ${item.subscription.service} 的使用频率与档位`,
      description: '可核对近几个周期是否使用、是否有更符合需求的官方档位。不要仅因金额较高就停止仍需使用的服务。',
      subscriptionIds: [item.subscription.id],
      referenceAmount: scheduled,
      currency,
      referenceLabel: '未来 12 个自然月排定扣款',
    })
  }
  for (const event of projectRenewals(subscriptions, today, 7, currency)) {
    suggestions.push({
      id: `upcoming:${event.id}`,
      kind: 'upcoming',
      title: `在 ${event.date} 前确认是否保留 ${event.service}`,
      description: '核对下次扣款日期和官方取消入口；若决定停止，请在服务商或支付渠道操作并保存结果。',
      subscriptionIds: [event.subscriptionId],
      referenceAmount: event.amount,
      currency: event.currency,
      referenceLabel: '本次预计扣款',
    })
  }
  return suggestions
}
