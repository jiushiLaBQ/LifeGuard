import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'
import { useDemoStore } from '@/stores/demo'
import { toDateInput } from '@/shared/ui/format'
import type { MatterImportance, MatterType } from '@/types'

function future(days: number): string {
  const date = new Date()
  date.setHours(12, 0, 0, 0)
  date.setDate(date.getDate() + days)
  return toDateInput(date)
}

function input(overrides: {
  title?: string
  amount?: number | null
  dueDate?: string | null
  type?: MatterType
  importance?: MatterImportance
  preparationDays?: number
  nextAction?: string
} = {}) {
  return {
    title: '虚构退货事项', merchant: '虚构商家', amount: 1000, dueDate: future(3),
    type: 'purchase' as MatterType, importance: 4 as MatterImportance, preparationDays: 2,
    nextAction: '提交售后申请', ...overrides,
  }
}

describe('事项决策状态集成场景', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  it('27 编辑日期、金额和类型后重算，且不清空已完成步骤', () => {
    const store = useDemoStore()
    const matter = store.addManualMatter(input())
    const plan = store.getPlan(matter.id)!
    const originalPlanId = plan.id
    store.toggleStep(plan.id, plan.steps[0].id)
    const previousScore = matter.assessment!.score

    store.updateMatter(matter.id, {
      ...input({ title: matter.title, type: 'warranty', amount: 4999, dueDate: future(1), importance: 5, preparationDays: 4 }),
      nextAction: '预约官方检测',
    })

    expect(matter.assessment!.score).not.toBe(previousScore)
    expect(store.getPlan(matter.id)!.id).toBe(originalPlanId)
    expect(store.getPlan(matter.id)!.steps[0].done).toBe(true)
    expect(store.getPlan(matter.id)!.steps.some((step) => step.key === 'book-inspection')).toBe(true)
    expect(store.getHistories(matter.id)[0].changes.map((change) => change.field)).toContain('type')
  })

  it('28 完成和恢复事项会退出再进入优先队列，并留下评分历史', () => {
    const store = useDemoStore()
    const matter = store.addManualMatter(input())
    const activeScore = matter.assessment!.score

    store.completeMatter(matter.id, '已提交并受理')
    expect(matter.assessment!.score).toBe(0)
    expect(store.activeMatters.some((item) => item.id === matter.id)).toBe(false)

    store.reopenMatter(matter.id)
    expect(matter.assessment!.score).toBe(activeScore)
    expect(store.activeMatters.some((item) => item.id === matter.id)).toBe(true)
    expect(store.getHistories(matter.id).map((history) => history.kind)).toEqual(expect.arrayContaining(['completed', 'reopened']))
  })

  it('29 用户确认 OCR 期限后来源、完整度和建议完成日期同步更新', () => {
    const store = useDemoStore()
    const matter = store.addManualMatter(input())
    matter.provenance!.dueDate = { source: 'ocr', confirmed: false }
    store.updateMatter(matter.id, input({ title: matter.title }))
    const pendingScore = matter.assessment!.score
    expect(store.getPlan(matter.id)!.suggestedCompletionDate).toBeNull()

    store.confirmFact(matter.id, 'dueDate')

    expect(matter.provenance!.dueDate).toMatchObject({ source: 'user', confirmed: true })
    expect(matter.assessment!.score).toBeGreaterThan(pendingScore)
    expect(store.getPlan(matter.id)!.suggestedCompletionDate).not.toBeNull()
  })

  it('30 优先队列按综合分排序，而不是机械地按更早日期排序', () => {
    const store = useDemoStore()
    store.clearDemo()
    const soonLow = store.addManualMatter(input({ title: '近期低优先级', dueDate: future(0), amount: 0, importance: 1, preparationDays: 0 }))
    const laterHigh = store.addManualMatter(input({ title: '远期高优先级', dueDate: future(7), amount: 3000, importance: 5, preparationDays: 2 }))

    expect(laterHigh.assessment!.score).toBeGreaterThan(soonLow.assessment!.score)
    expect(store.activeMatters[0].id).toBe(laterHigh.id)
  })

  it('31 无日期和无金额的新事项仍可创建，但不会伪造建议完成时间', () => {
    const store = useDemoStore()
    const matter = store.addManualMatter(input({ amount: null, dueDate: null, importance: undefined, preparationDays: undefined }))

    expect(matter.assessment!.factors.find((item) => item.key === 'time')!.score).toBe(0)
    expect(matter.assessment!.factors.find((item) => item.key === 'loss')!.score).toBe(0)
    expect(store.getPlan(matter.id)!.suggestedCompletionDate).toBeNull()
    expect(matter.assessment!.missingInformation.length).toBeGreaterThanOrEqual(4)
  })

  it('32 评分、行动方案和历史会持久化到本地工作区', async () => {
    const store = useDemoStore()
    const matter = store.addManualMatter(input())
    await nextTick()

    const saved = JSON.parse(localStorage.getItem('lifeguard.demo.workspace.v1')!)
    const savedMatter = saved.matters.find((item: { id: string }) => item.id === matter.id)
    expect(savedMatter.assessment.score).toBe(matter.assessment!.score)
    expect(saved.actions.find((plan: { matterId: string }) => plan.matterId === matter.id).analysis).toContain('优先级')
    expect(saved.histories.some((history: { matterId: string }) => history.matterId === matter.id)).toBe(true)
  })

  it('33 删除事项后统计、行动方案与历史同步清理', () => {
    const store = useDemoStore()
    store.clearDemo()
    const matter = store.addManualMatter(input({ dueDate: future(2) }))
    expect(store.activeMatters).toHaveLength(1)
    expect(store.weekDue).toHaveLength(1)

    store.removeMatter(matter.id)

    expect(store.getMatter(matter.id)).toBeUndefined()
    expect(store.getPlan(matter.id)).toBeUndefined()
    expect(store.getHistories(matter.id)).toHaveLength(0)
    expect(store.activeMatters).toHaveLength(0)
    expect(store.weekDue).toHaveLength(0)
    expect(store.activities[0].title).toBe('删除生活事项')
  })
})
