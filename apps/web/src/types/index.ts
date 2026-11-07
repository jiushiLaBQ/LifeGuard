export type MatterType = 'purchase' | 'warranty' | 'subscription' | 'lease' | 'course' | 'payment'
export type MatterStatus = 'active' | 'pending' | 'completed' | 'dismissed'
export type RiskLevel = 'urgent' | 'high' | 'medium' | 'low'
export type MatterImportance = 1 | 2 | 3 | 4 | 5
export type MatterFactKey = 'dueDate' | 'amount' | 'importance' | 'preparationDays' | 'obligation'
export type FactSource = 'user' | 'ocr' | 'inference' | 'unverified'

export interface FactProvenance {
  source: FactSource
  confirmed: boolean
  note?: string
}

export interface RiskFactor {
  key: 'time' | 'loss' | 'importance' | 'preparation' | 'completeness'
  label: string
  weight: number
  score: number
  points: number
  explanation: string
  source: FactSource
}

export interface RiskAssessment {
  score: number
  level: RiskLevel
  factors: RiskFactor[]
  summary: string
  missingInformation: string[]
  ruleVersion: string
}

export interface Matter {
  id: string
  title: string
  merchant: string
  type: MatterType
  status: MatterStatus
  risk: RiskLevel
  amount: number | null
  currency: string
  exposure?: number
  dueDate: string | null
  purchasedOn?: string
  importance?: MatterImportance
  preparationDays?: number
  obligation?: string
  provenance?: Partial<Record<MatterFactKey, FactProvenance>>
  assessment?: RiskAssessment
  description: string
  nextAction: string
  source: 'demo' | 'manual' | 'material'
  subscriptionId?: string
  completedOn?: string
  outcome?: string
  savedAmount?: number
}

export interface ActionStep {
  id: string
  key?: string
  title: string
  detail: string
  required: boolean
  done: boolean
}

export interface ActionPlan {
  id: string
  matterId: string
  title: string
  summary: string
  steps: ActionStep[]
  materials: string[]
  script: string
  generationMode: 'rule'
  updatedAt: string
  analysis?: string
  risks?: string[]
  recommendedAction?: string
  suggestedCompletionDate?: string | null
  recommendationReason?: string
  ruleVersion?: string
}

export interface MatterChange {
  field: string
  label: string
  before: string
  after: string
}

export interface MatterHistory {
  id: string
  matterId: string
  timestamp: string
  kind: 'created' | 'loaded' | 'updated' | 'reassessed' | 'step' | 'completed' | 'reopened'
  title: string
  description: string
  score: number
  changes: MatterChange[]
}

export type BillingCycle = 'monthly' | 'quarterly' | 'yearly'
export type DocumentType = '订单' | '保修' | '订阅' | '合同' | '其他'
export type RecognitionFieldKey = 'document_type' | 'title' | 'amount' | 'billing_cycle' | 'purchase_date' | 'effective_date' | 'expiry_date' | 'renewal_date' | 'merchant' | 'description'

export interface RecognitionResult {
  document_type: DocumentType
  title: string
  amount: string | null
  currency: 'CNY' | 'USD' | 'HKD' | null
  billing_cycle: BillingCycle | null
  purchase_date: string | null
  effective_date: string | null
  expiry_date: string | null
  renewal_date: string | null
  merchant: string
  description: string
  confidence: Partial<Record<RecognitionFieldKey, number>>
  need_confirmation: RecognitionFieldKey[]
}

export interface ExtractedField {
  key: Exclude<RecognitionFieldKey, 'document_type'> | 'dueDate'
  label: string
  value: string
  confidence: number | null
  status: 'pending' | 'confirmed'
  evidence: string
}

export interface MaterialItem {
  id: string
  name: string
  size: number
  mimeType: string
  status: 'processing' | 'awaiting_confirmation' | 'ready' | 'error'
  uploadedAt: string
  source: 'demo' | 'local'
  previewUrl?: string
  hash?: string
  fields: ExtractedField[]
  recognition?: RecognitionResult
  recognitionEngine?: 'pdf-text' | 'browser-ocr' | 'pdf-ocr' | 'manual' | 'demo'
  recognitionProgress?: number
  recognitionStage?: string
  extractionNote?: string
  message?: string
}

export interface Subscription {
  id: string
  service: string
  category: string
  amount: number
  currency: 'CNY' | 'USD' | 'HKD'
  cycle: BillingCycle
  nextRenewal: string
  status: 'active' | 'paused' | 'cancelled'
  autoRenew: boolean
  source: 'demo' | 'manual' | 'material'
  materialId?: string
  notes: string
  createdAt: string
  updatedAt: string
  duplicateGroup?: string
  duplicateState: 'none' | 'candidate' | 'distinct'
}

export type SubscriptionInput = Pick<Subscription, 'service' | 'category' | 'amount' | 'currency' | 'cycle' | 'nextRenewal' | 'autoRenew' | 'notes'>

export interface Activity {
  id: string
  title: string
  description: string
  timestamp: string
  kind: 'confirm' | 'complete' | 'upload' | 'action' | 'settings'
}

export interface Profile {
  name: string
  email: string
  timezone: string
  currency: string
  weeklySummary: boolean
}
