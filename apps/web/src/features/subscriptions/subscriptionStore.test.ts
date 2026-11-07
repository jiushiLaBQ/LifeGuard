import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'
import { useDemoStore } from '@/stores/demo'
import { emptyRecognition, recognitionToFields } from '@/features/materials/recognitionRules'
import type { MaterialItem, SubscriptionInput } from '@/types'

function input(overrides: Partial<SubscriptionInput> = {}): SubscriptionInput {
  return {
    service: '虚构季度订阅', category: '效率工具', amount: 90, currency: 'CNY', cycle: 'quarterly',
    nextRenewal: '2027-01-31', autoRenew: true, notes: '仅用于自动化测试', ...overrides,
  }
}

describe('订阅状态管理与材料确认', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  it('新增、编辑、暂停、恢复和删除会实时改变统计', () => {
    const store = useDemoStore()
    store.clearDemo()
    const subscription = store.addSubscription(input())
    expect(store.monthlySpending).toBe(30)

    store.updateSubscription(subscription.id, input({ amount: 180, cycle: 'yearly' }))
    expect(store.monthlySpending).toBe(15)

    store.pauseSubscription(subscription.id)
    expect(subscription.status).toBe('paused')
    expect(store.monthlySpending).toBe(0)

    store.resumeSubscription(subscription.id)
    expect(store.monthlySpending).toBe(15)

    store.updateSubscription(subscription.id, input({ amount: 180, cycle: 'yearly', autoRenew: false }))
    expect(store.monthlySpending).toBe(0)

    store.removeSubscription(subscription.id)
    expect(store.getSubscription(subscription.id)).toBeUndefined()
  })

  it('订阅来源、周期与原币金额会持久化', async () => {
    const store = useDemoStore()
    store.clearDemo()
    const subscription = store.addSubscription(input({ currency: 'USD', amount: 12.5 }))
    await nextTick()

    const saved = JSON.parse(localStorage.getItem('lifeguard.demo.workspace.v1')!)
    const record = saved.subscriptions.find((item: { id: string }) => item.id === subscription.id)
    expect(record).toMatchObject({ source: 'manual', currency: 'USD', cycle: 'quarterly', amount: 12.5, notes: '仅用于自动化测试' })
    expect(store.monthlySpending).toBe(0)
  })

  it('材料生成订阅前必须人工补齐不明确的周期', () => {
    const store = useDemoStore()
    store.clearDemo()
    const recognition = {
      ...emptyRecognition(), document_type: '订阅' as const, title: '虚构材料订阅', amount: '45', currency: 'CNY' as const,
      renewal_date: '2027-02-01', merchant: '虚构服务商',
    }
    const material: MaterialItem = {
      id: 'material-subscription-test', name: '虚构订阅订单.png', size: 100, mimeType: 'image/png', status: 'awaiting_confirmation',
      uploadedAt: new Date().toISOString(), source: 'local', recognition, fields: recognitionToFields(recognition),
    }
    store.addMaterial(material)

    expect(() => store.confirmMaterial(material.id, material.fields, 'subscription', 'CNY', '订阅', '效率工具')).toThrow('续费周期')
    expect(store.subscriptions).toHaveLength(0)

    const fields = material.fields.map((field) => field.key === 'billing_cycle' ? { ...field, value: 'quarterly' } : field)
    const matter = store.confirmMaterial(material.id, fields, 'subscription', 'CNY', '订阅', '效率工具')
    const subscription = store.subscriptions.find((item) => item.materialId === material.id)

    expect(matter.type).toBe('subscription')
    expect(subscription).toMatchObject({ service: '虚构材料订阅', source: 'material', amount: 45, cycle: 'quarterly', nextRenewal: '2027-02-01', category: '效率工具' })
    expect(material.status).toBe('ready')
    expect(store.monthlySpending).toBe(15)
  })

  it('无效金额和日期不会成为正式订阅记录', () => {
    const store = useDemoStore()
    store.clearDemo()
    expect(() => store.addSubscription(input({ amount: Number.NaN }))).toThrow('金额')
    expect(() => store.addSubscription(input({ nextRenewal: '2027-02-30' }))).toThrow('日期')
    expect(store.subscriptions).toHaveLength(0)
  })

  it('手动订阅的续费提醒随状态实时出现与消失', () => {
    const store = useDemoStore()
    store.clearDemo()
    const renewal = new Date()
    renewal.setDate(renewal.getDate() + 12)
    const date = `${renewal.getFullYear()}-${String(renewal.getMonth() + 1).padStart(2, '0')}-${String(renewal.getDate()).padStart(2, '0')}`
    const subscription = store.addSubscription(input({ cycle: 'monthly', amount: 40, nextRenewal: date }))

    const events = () => store.upcomingRenewals.filter((event) => event.subscriptionId === subscription.id)
    expect(events()).toHaveLength(1)
    expect(events()[0].date).toBe(date)

    store.pauseSubscription(subscription.id)
    expect(events()).toHaveLength(0)
    store.resumeSubscription(subscription.id)
    expect(events()).toHaveLength(1)
    store.updateSubscription(subscription.id, input({ cycle: 'monthly', amount: 40, nextRenewal: date, autoRenew: false }))
    expect(events()).toHaveLength(0)
    store.removeSubscription(subscription.id)
    expect(store.upcomingRenewals).toHaveLength(0)
  })

  it('材料关联事项抑制重复提醒，删除事项后提醒恢复且订阅保留', () => {
    const store = useDemoStore()
    store.clearDemo()
    const renewal = new Date()
    renewal.setDate(renewal.getDate() + 10)
    const date = `${renewal.getFullYear()}-${String(renewal.getMonth() + 1).padStart(2, '0')}-${String(renewal.getDate()).padStart(2, '0')}`
    const recognition = {
      ...emptyRecognition(), document_type: '订阅' as const, title: '虚构提醒订阅', amount: '40', currency: 'CNY' as const,
      renewal_date: date, merchant: '虚构服务商',
    }
    const material: MaterialItem = {
      id: 'material-reminder-test', name: '虚构提醒订单.png', size: 100, mimeType: 'image/png', status: 'awaiting_confirmation',
      uploadedAt: new Date().toISOString(), source: 'local', recognition,
      fields: recognitionToFields(recognition).map((field) => field.key === 'billing_cycle' ? { ...field, value: 'monthly' } : field),
    }
    store.addMaterial(material)

    const matter = store.confirmMaterial(material.id, material.fields, 'subscription', 'CNY', '订阅', '效率工具')
    const subscription = store.subscriptions.find((item) => item.materialId === material.id)!
    expect(matter.subscriptionId).toBe(subscription.id)
    expect(store.upcomingRenewals.some((event) => event.subscriptionId === subscription.id)).toBe(false)

    store.removeMatter(matter.id)

    expect(store.getMatter(matter.id)).toBeUndefined()
    expect(store.getPlan(matter.id)).toBeUndefined()
    expect(store.getHistories(matter.id)).toHaveLength(0)
    expect(store.subscriptions).toHaveLength(1)
    const events = store.upcomingRenewals.filter((event) => event.subscriptionId === subscription.id)
    expect(events).toHaveLength(1)
    expect(events[0].date).toBe(date)
  })
})
