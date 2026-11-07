import type { BillingCycle, MatterType, RiskLevel } from '@/types'

export const matterTypeLabels: Record<MatterType, string> = {
  purchase: '退货售后',
  warranty: '保修',
  subscription: '订阅续费',
  lease: '租赁合同',
  course: '课程有效期',
  payment: '缴费办理',
}

export const riskLabels: Record<RiskLevel, string> = {
  urgent: '紧急',
  high: '高风险',
  medium: '需关注',
  low: '正常',
}

export function dateFromNow(days: number): string {
  const date = new Date()
  date.setHours(12, 0, 0, 0)
  date.setDate(date.getDate() + days)
  return toDateInput(date)
}

export function toDateInput(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function daysUntil(date: string | null): number {
  if (!date) return Number.POSITIVE_INFINITY
  const today = new Date()
  today.setHours(12, 0, 0, 0)
  const target = new Date(`${date}T12:00:00`)
  return Math.round((target.getTime() - today.getTime()) / 86400000)
}

export function formatDate(date: string | null | undefined, withYear = false): string {
  if (!date) return '日期待确认'
  return new Intl.DateTimeFormat('zh-CN', {
    ...(withYear ? { year: 'numeric' } : {}),
    month: 'short',
    day: 'numeric',
  }).format(new Date(`${date}T12:00:00`))
}

export function relativeDeadline(date: string | null): string {
  if (!date) return '日期待确认'
  const days = daysUntil(date)
  if (days < 0) return `已逾期 ${Math.abs(days)} 天`
  if (days === 0) return '今天截止'
  if (days === 1) return '明天截止'
  return `${days} 天后截止`
}

export function formatCurrency(value: number | null, currency = 'CNY'): string {
  if (value === null) return '金额待确认'
  return new Intl.NumberFormat('zh-CN', {
    style: 'currency',
    currency,
    minimumFractionDigits: value % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(value)
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export function formatTime(timestamp: string): string {
  return new Intl.DateTimeFormat('zh-CN', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(timestamp))
}

export const billingCycleLabels: Record<BillingCycle, string> = {
  monthly: '月付',
  quarterly: '季付',
  yearly: '年付',
}

export function isValidDateString(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T12:00:00`)
  return !Number.isNaN(date.getTime()) && toDateInput(date) === value
}
