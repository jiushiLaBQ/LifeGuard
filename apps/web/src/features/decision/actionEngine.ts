import { daysBetween, factProvenance, resolvedPreparationDays } from '@/features/decision/riskEngine'
import { RULE_VERSION } from '@/features/decision/rules'
import { formatCurrency, matterTypeLabels, toDateInput } from '@/shared/ui/format'
import type { ActionPlan, ActionStep, Matter, MatterType, RiskAssessment } from '@/types'

interface StepTemplate {
  key: string
  title: string
  detail: string
}

const TYPE_STEPS: Record<MatterType, StepTemplate[]> = {
  purchase: [
    { key: 'prepare-evidence', title: '整理订单与商品证据', detail: '准备订单、支付记录、商品现状和已有沟通内容，不覆盖原始文件。' },
    { key: 'submit-request', title: '向商家提交售后请求', detail: '通过订单或商家正式入口说明诉求，先核实适用规则、寄回要求和受理编号。' },
  ],
  warranty: [
    { key: 'backup-device', title: '备份资料并记录设备信息', detail: '完成个人数据备份，记录序列号和故障现象，核对送修前账号处理要求。' },
    { key: 'book-inspection', title: '预约检测并确认保修范围', detail: '向销售方或官方售后描述故障，依据购买凭证和保修条款确认检测安排。' },
  ],
  subscription: [
    { key: 'review-usage', title: '检查会员权益与续费渠道', detail: '确认当前周期、使用需求、续费金额以及管理自动续费的原始支付渠道。' },
    { key: 'manage-renewal', title: '按保留或取消决定处理续费', detail: '不再需要时，在会员或原支付渠道关闭自动续费；不要假设卸载应用等同于取消。' },
  ],
  lease: [
    { key: 'review-contract', title: '逐条核对合同义务与通知方式', detail: '确认到期日、通知期限、交接、费用和押金条款；口头承诺不能替代合同核对。' },
    { key: 'arrange-handover', title: '按合同方式通知并预约交接', detail: '使用合同约定的通知渠道保留送达记录，预约验房、抄表和钥匙交接。' },
  ],
  course: [
    { key: 'inventory-course', title: '盘点剩余课程与学习权益', detail: '核对剩余课时、直播安排、资料下载和有效期，记录仍未使用的部分。' },
    { key: 'schedule-course', title: '预约课程并保存学习资料', detail: '根据剩余时间安排可完成的课程；如有争议，先向机构核实其公示规则。' },
  ],
  payment: [
    { key: 'verify-payment', title: '核对缴费通知与官方入口', detail: '确认收款机构、金额、截止日和支付渠道，不通过来历不明的链接付款。' },
    { key: 'finish-payment', title: '完成办理并核对到账状态', detail: '在官方入口办理后检查状态，若未及时到账，使用回执联系办理机构。' },
  ],
}

const LEGACY_STEP_KEYS: Record<string, string> = {
  '拍摄商品与配件照片': 'prepare-evidence',
  '提交退货申请': 'submit-request',
  '保存受理与物流凭证': 'save-result',
  '检查当前会员权益': 'review-usage',
  '关闭自动续费': 'manage-renewal',
  '保存取消结果': 'save-result',
  '发送书面退租通知': 'arrange-handover',
  '确认押金结算明细': 'save-result',
  '备份设备资料': 'backup-device',
  '整理购买与故障证据': 'book-inspection',
  '预约官方检测': 'book-inspection',
}

const TYPE_MATERIALS: Record<MatterType, string[]> = {
  purchase: ['订单与支付凭证', '商品及配件照片', '商家规则与沟通记录', '售后受理或物流凭证'],
  warranty: ['购买发票或订单', '设备序列号', '故障照片或视频', '检测与维修记录'],
  subscription: ['会员账号与当前周期截图', '续费金额与扣款记录', '自动续费管理页面', '处理结果截图'],
  lease: ['完整租赁合同与补充协议', '通知及送达记录', '房屋照片与交接清单', '费用和押金结算明细'],
  course: ['课程订单与支付凭证', '课程目录及剩余课时', '机构有效期规则', '预约和学习记录'],
  payment: ['正式缴费通知', '官方办理入口', '支付凭证', '到账或办理回执'],
}

function shiftDate(date: string, days: number): string {
  const shifted = new Date(`${date}T12:00:00`)
  shifted.setDate(shifted.getDate() + days)
  return toDateInput(shifted)
}

function suggestedDate(matter: Matter, today: string): { date: string | null; reason: string } {
  if (!matter.dueDate) return { date: null, reason: '截止日尚未提供，因此不生成建议完成日期。' }
  const provenance = factProvenance(matter, 'dueDate')
  if (!provenance.confirmed) return { date: null, reason: '截止日期仍待核实，确认后再生成建议完成日期。' }
  const remaining = daysBetween(today, matter.dueDate)
  if (remaining <= 0) return { date: today, reason: '所记录期限已到期或已经过去，建议今天先联系相关方核实当前办理状态。' }
  const preparationDays = resolvedPreparationDays(matter)
  const leadDays = Math.min(remaining, Math.max(1, Math.ceil(preparationDays / 2)))
  return {
    date: shiftDate(matter.dueDate, -leadDays),
    reason: `按已核实的截止日期预留 ${leadDays} 天处理与补正时间；这只是安排建议，不改变原期限。`,
  }
}

function communicationScript(matter: Matter): string {
  const subject = `你好，我需要处理“${matter.title}”相关事项。`
  const scripts: Record<MatterType, string> = {
    purchase: `${subject}请依据订单内容和贵方现行售后规则，协助确认可申请的处理方式、所需材料、办理期限及结果凭证。我的诉求以双方后续确认记录为准，谢谢。`,
    warranty: `${subject}请依据购买凭证和保修条款，协助确认故障检测安排、保修范围、所需材料及数据处理注意事项，并提供检测或受理记录，谢谢。`,
    subscription: `${subject}请协助确认当前会员周期、下次续费时间和金额，以及管理自动续费的正式入口。若我提交取消操作，请提供可保存的结果凭证，谢谢。`,
    lease: `${subject}请依据完整租赁合同及补充协议，协助确认通知方式、交接安排、费用结算和押金处理流程。具体权利义务以合同文本、事实情况及适用规则为准，谢谢。`,
    course: `${subject}请依据课程订单和贵方公示规则，协助确认剩余课时、有效期、预约方式及可下载资料，并提供可保存的确认记录，谢谢。`,
    payment: `${subject}请协助核对缴费金额、截止日期、官方办理入口和回执获取方式；如已办理，请确认到账状态，谢谢。`,
  }
  return scripts[matter.type]
}

export function buildActionPlan(
  matter: Matter,
  assessment: RiskAssessment,
  existingPlan?: ActionPlan,
  today = toDateInput(new Date()),
): ActionPlan {
  const suggestion = suggestedDate(matter, today)
  const days = daysBetween(today, matter.dueDate)
  const preparationDays = resolvedPreparationDays(matter)
  const missing = assessment.missingInformation
  const verificationDetail = missing.length
    ? `先处理这些信息缺口：${missing.join('；')}。核实前不要把候选值当作确定事实。`
    : '关键信息已经核对，仍需保存原始材料和后续处理凭证。'
  const verifyStep: StepTemplate = {
    key: 'verify-facts',
    title: missing.length ? '核实关键信息与适用规则' : '复核关键信息与适用规则',
    detail: verificationDetail,
  }
  const saveStep: StepTemplate = {
    key: 'save-result',
    title: '保存处理结果并更新记录',
    detail: '记录实际结果、日期和相关凭证；只有你明确确认的金额才计入少支出统计。',
  }
  const templates = [verifyStep, ...TYPE_STEPS[matter.type], saveStep]
  if (matter.status === 'active' && days < 0) {
    templates.splice(1, 0, {
      key: 'resolve-overdue',
      title: '核实逾期后的当前办理状态',
      detail: '所记录日期已经过去。先联系相关方确认是否仍可办理、是否需要补办，不假设原权利或义务必然延续或消失。',
    })
  }

  const steps: ActionStep[] = templates.map((template) => {
    const previous = existingPlan?.steps.find((step) => step.key === template.key || LEGACY_STEP_KEYS[step.title] === template.key)
      ?? existingPlan?.steps.find((step) => step.title === template.title)
    return {
      id: previous?.id ?? crypto.randomUUID(),
      key: template.key,
      title: template.title,
      detail: template.detail,
      required: true,
      done: previous?.done ?? false,
    }
  })

  const risks: string[] = []
  if (!matter.dueDate) risks.push('期限风险：缺少截止日期，无法判断剩余办理窗口。')
  else if (days < 0) risks.push(`期限风险：所记录日期已过去 ${Math.abs(days)} 天，需要核实当前办理状态。`)
  else if (days <= 2) risks.push(`期限风险：${days === 0 ? '今天就是所记录截止日' : `仅剩 ${days} 天`}，应先完成关键动作并留存受理凭证。`)
  else risks.push(`期限安排：按当前记录还有 ${days} 天，仍需为材料补正和沟通等待留出时间。`)
  if (matter.amount !== null) risks.push(`金额提示：当前记录 ${formatCurrency(matter.exposure ?? matter.amount, matter.currency)} 仅用于优先级排序，不代表确定损失、退款或赔付结果。`)
  else risks.push('金额风险：涉及金额尚未提供，当前评分不包含确定的经济损失估计。')
  if (preparationDays >= days + 1 && Number.isFinite(days)) risks.push(`准备风险：预计准备 ${preparationDays} 天，已接近或超过剩余时间，可能需要并行准备材料。`)
  if (missing.length) risks.push(`信息可靠性：${missing.join('；')}。`)
  if (matter.type === 'lease') risks.push('合同提示：通知、交接、违约与押金安排必须结合合同文本、实际履行情况和适用规则核实。')

  const analysis = `${matterTypeLabels[matter.type]}“${matter.title}”当前优先级为 ${assessment.score}/100。${assessment.summary} 建议完成时间只依据已核实的期限生成，规则版本为 ${RULE_VERSION}。`
  const inactive = matter.status === 'completed' || matter.status === 'dismissed'
  return {
    id: existingPlan?.id ?? crypto.randomUUID(),
    matterId: matter.id,
    title: `${matter.title}决策方案`,
    summary: inactive ? '事项已退出待处理队列，以下方案保留用于追溯。' : `优先级 ${assessment.score}/100，先核实信息，再按“${matter.nextAction}”推进并保存结果。`,
    generationMode: 'rule',
    updatedAt: new Date().toISOString(),
    analysis,
    risks,
    recommendedAction: inactive ? '查看已记录的处理结果；如需继续办理，请恢复待处理后重新评估。' : matter.nextAction,
    suggestedCompletionDate: inactive ? null : suggestion.date,
    recommendationReason: inactive ? '事项当前不参与待处理时间安排。' : suggestion.reason,
    ruleVersion: RULE_VERSION,
    steps,
    materials: TYPE_MATERIALS[matter.type],
    script: communicationScript(matter),
  }
}
