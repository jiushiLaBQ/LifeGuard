import type { ActionPlan, Activity, MaterialItem, Matter, MatterHistory, Profile, Subscription } from '@/types'
import { dateFromNow } from '@/shared/ui/format'

export interface DemoState {
  matters: Matter[]
  actions: ActionPlan[]
  materials: MaterialItem[]
  subscriptions: Subscription[]
  activities: Activity[]
  histories: MatterHistory[]
  profile: Profile
}

export function createDemoState(): DemoState {
  const now = new Date()
  const ago = (hours: number) => new Date(now.getTime() - hours * 3600000).toISOString()

  return {
    matters: [
      {
        id: 'matter-headphones', title: '降噪耳机退货', merchant: '声浪数码旗舰店', type: 'purchase', status: 'active', risk: 'urgent',
        amount: 1299, exposure: 1299, currency: 'CNY', dueDate: dateFromNow(0), purchasedOn: dateFromNow(-6),
        description: '订单截图显示七天无理由退货期限今天截止，商品与配件已整理。', nextAction: '提交退货申请并上传商品照片', source: 'demo',
      },
      {
        id: 'matter-video', title: '云享视频会员续费', merchant: '云享视频', type: 'subscription', status: 'active', risk: 'high',
        amount: 25, exposure: 25, currency: 'CNY', dueDate: dateFromNow(2), subscriptionId: 'sub-video',
        description: '月度自动续费将在两天后扣款，当前不常使用。', nextAction: '确认是否保留，不需要则取消自动续费', source: 'demo',
      },
      {
        id: 'matter-lease', title: '青年公寓退租通知', merchant: '青年公寓', type: 'lease', status: 'active', risk: 'high',
        amount: 3500, exposure: 3500, currency: 'CNY', dueDate: dateFromNow(5),
        description: '合同约定退租需提前通知，押金退还以完成房屋交接为前提。', nextAction: '发送退租通知并预约验房', source: 'demo',
      },
      {
        id: 'matter-tablet', title: '平板电脑保修到期', merchant: '星河数码', type: 'warranty', status: 'active', risk: 'medium',
        amount: 4299, exposure: 500, currency: 'CNY', dueDate: dateFromNow(18), purchasedOn: dateFromNow(-347),
        description: '设备偶尔无法充电，保修期内可先做检测。', nextAction: '备份设备并预约售后检测', source: 'demo',
      },
      {
        id: 'matter-course', title: '英语进阶课程有效期', merchant: '启程英语', type: 'course', status: 'active', risk: 'medium',
        amount: 2399, currency: 'CNY', dueDate: dateFromNow(12),
        description: '已购买课程将在 12 天后结束有效期，还有 4 节直播课未使用。', nextAction: '预约剩余课程并导出学习资料', source: 'demo',
      },
      {
        id: 'matter-payment', title: '下学期住宿费缴纳', merchant: '学生事务中心', type: 'payment', status: 'active', risk: 'low',
        amount: 1200, exposure: 1200, currency: 'CNY', dueDate: dateFromNow(7),
        description: '缴费通知已确认，需在学校服务大厅完成缴纳并保存回执。', nextAction: '完成缴费并上传回执', source: 'demo',
      },
      {
        id: 'matter-refund', title: '保温杯质量问题退款', merchant: '日用优选', type: 'purchase', status: 'completed', risk: 'low',
        amount: 159, currency: 'CNY', dueDate: dateFromNow(-8), completedOn: dateFromNow(-9), outcome: '已退款', savedAmount: 159,
        description: '售后退款已原路退回。', nextAction: '已完成', source: 'demo',
      },
      {
        id: 'matter-cancelled', title: '音乐会员重复订阅取消', merchant: '知音音乐', type: 'subscription', status: 'completed', risk: 'low',
        amount: 15, currency: 'CNY', dueDate: dateFromNow(-15), completedOn: dateFromNow(-16), outcome: '已取消续费', savedAmount: 180,
        description: '已取消重复会员，按剩余年度周期记录预计少支出金额。', nextAction: '已完成', source: 'demo',
      },
    ],
    actions: [
      {
        id: 'action-return', matterId: 'matter-headphones', title: '退货申请行动清单', summary: '今天优先提交申请，保留商品和沟通证据。',
        generationMode: 'rule', updatedAt: ago(1),
        steps: [
          { id: 'return-1', title: '拍摄商品与配件照片', detail: '包含商品全貌、序列号、配件和原包装。', required: true, done: true },
          { id: 'return-2', title: '提交退货申请', detail: '在订单售后入口选择七天无理由退货，说明商品完好。', required: true, done: false },
          { id: 'return-3', title: '保存受理与物流凭证', detail: '记录售后编号，寄出后保留面单和物流轨迹。', required: true, done: false },
        ],
        materials: ['订单号与支付凭证', '商品及配件照片', '原包装', '售后受理记录'],
        script: '你好，我在贵店购买的降噪耳机订单仍在七天无理由退货期限内，商品及配件保存完整。请协助确认退货地址和寄回要求，我会保留物流凭证。谢谢。',
      },
      {
        id: 'action-subscription', matterId: 'matter-video', title: '会员续费处置清单', summary: '先确认使用需求，再决定是否取消自动续费。',
        generationMode: 'rule', updatedAt: ago(4),
        steps: [
          { id: 'sub-1', title: '检查当前会员权益', detail: '确认是否仍有需要保留的会员内容或共享权益。', required: true, done: false },
          { id: 'sub-2', title: '关闭自动续费', detail: '在会员管理或原支付渠道中关闭，不影响已支付周期。', required: true, done: false },
          { id: 'sub-3', title: '保存取消结果', detail: '截图保留关闭状态与下次不再扣款提示。', required: true, done: false },
        ],
        materials: ['会员账号', '当前续费周期截图', '取消结果截图'],
        script: '我希望关闭当前会员的自动续费，保留已支付周期内的权益。请协助确认关闭成功，并告知当前权益有效期。',
      },
      {
        id: 'action-lease', matterId: 'matter-lease', title: '退租交接行动清单', summary: '按合同时间发出通知，并将房屋状况与费用结算留痕。',
        generationMode: 'rule', updatedAt: ago(8),
        steps: [
          { id: 'lease-1', title: '发送书面退租通知', detail: '使用合同约定方式发送，保留送达记录。', required: true, done: false },
          { id: 'lease-2', title: '预约验房与费用抄表', detail: '确认交接时间，记录水电燃气读数。', required: true, done: false },
          { id: 'lease-3', title: '检查房屋并拍照', detail: '覆盖家具、电器、墙面、门锁和钥匙。', required: true, done: false },
          { id: 'lease-4', title: '确认押金结算明细', detail: '核对费用后签署交接记录，保留押金退还凭证。', required: true, done: false },
        ],
        materials: ['租赁合同', '退租通知记录', '房屋照片与视频', '水电表读数', '押金结算单'],
        script: '你好，根据合同约定，我计划于合同结束日退租，现提前发送书面通知。请协助确认验房时间、费用结算方式及押金退还安排，谢谢。',
      },
      {
        id: 'action-warranty', matterId: 'matter-tablet', title: '保修检测准备清单', summary: '在保修截止前复现问题并保留检测记录。',
        generationMode: 'rule', updatedAt: ago(26),
        steps: [
          { id: 'warranty-1', title: '备份设备资料', detail: '完成数据备份并了解送修前的账号退出要求。', required: true, done: false },
          { id: 'warranty-2', title: '整理购买与故障证据', detail: '准备发票、序列号和故障视频。', required: true, done: false },
          { id: 'warranty-3', title: '预约官方检测', detail: '描述故障现象，保留检测单和维修记录。', required: true, done: false },
        ],
        materials: ['购买发票', '设备序列号', '故障视频', '数据备份'],
        script: '设备近期偶尔无法正常充电，故障视频已保存，目前仍在保修期内。希望预约检测并确认检测、维修及数据处理的注意事项。',
      },
    ],
    materials: [
      {
        id: 'material-keyboard', name: '键盘订单截图.png', size: 1843200, mimeType: 'image/png', status: 'awaiting_confirmation',
        uploadedAt: ago(2), source: 'demo', recognitionEngine: 'demo', message: '预置识别样例，仅用于体验字段确认流程。',
        recognition: { document_type: '订单', title: '机械键盘退货', amount: '499', currency: 'CNY', billing_cycle: null, purchase_date: null, effective_date: null, expiry_date: dateFromNow(4), renewal_date: null, merchant: '键物外设店', description: '', confidence: { document_type: 88, title: 94, amount: 97, merchant: 91 }, need_confirmation: ['expiry_date'] },
        fields: [
          { key: 'title', label: '事项名称', value: '机械键盘退货', confidence: 94, status: 'pending', evidence: '商品：87 键机械键盘' },
          { key: 'merchant', label: '商家', value: '键物外设店', confidence: 91, status: 'pending', evidence: '店铺：键物外设店' },
          { key: 'amount', label: '实付金额', value: '499', confidence: 97, status: 'pending', evidence: '实付款 ¥499.00' },
          { key: 'expiry_date', label: '退货截止日', value: dateFromNow(4), confidence: null, status: 'pending', evidence: '材料未包含明确期限，请人工确认' },
        ],
      },
      {
        id: 'material-invoice', name: '平板电子发票.pdf', size: 862400, mimeType: 'application/pdf', status: 'ready',
        uploadedAt: ago(27), source: 'demo', recognitionEngine: 'demo', message: '已确认并关联“平板电脑保修到期”。',
        recognition: { document_type: '保修', title: '平板电脑保修到期', amount: '4299', currency: 'CNY', billing_cycle: null, purchase_date: null, effective_date: null, expiry_date: dateFromNow(18), renewal_date: null, merchant: '星河数码', description: '', confidence: { document_type: 92, title: 96, amount: 98, merchant: 95 }, need_confirmation: [] },
        fields: [
          { key: 'title', label: '事项名称', value: '平板电脑保修到期', confidence: 96, status: 'confirmed', evidence: '平板电脑 256G' },
          { key: 'merchant', label: '商家', value: '星河数码', confidence: 95, status: 'confirmed', evidence: '销售方：星河数码' },
          { key: 'amount', label: '实付金额', value: '4299', confidence: 98, status: 'confirmed', evidence: '价税合计 ¥4299.00' },
          { key: 'expiry_date', label: '保修截止日', value: dateFromNow(18), confidence: null, status: 'confirmed', evidence: '用户根据保修规则人工确认' },
        ],
      },
    ],
    subscriptions: [
      { id: 'sub-video', service: '云享视频', category: '影音娱乐', amount: 25, currency: 'CNY', cycle: 'monthly', nextRenewal: dateFromNow(2), status: 'active', autoRenew: true, source: 'demo', notes: '视频会员，按月自动续费。', createdAt: ago(720), updatedAt: ago(2), duplicateState: 'none' },
      { id: 'sub-notes', service: '灵感笔记 Pro', category: '效率工具', amount: 18, currency: 'CNY', cycle: 'monthly', nextRenewal: dateFromNow(5), status: 'active', autoRenew: true, source: 'demo', notes: '笔记同步与知识整理功能。', createdAt: ago(700), updatedAt: ago(3), duplicateGroup: 'notes', duplicateState: 'candidate' },
      { id: 'sub-docs', service: '知墨文档', category: '效率工具', amount: 108, currency: 'CNY', cycle: 'yearly', nextRenewal: dateFromNow(16), status: 'active', autoRenew: true, source: 'demo', notes: '在线文档与协作功能，可能与笔记工具存在部分交集。', createdAt: ago(650), updatedAt: ago(4), duplicateGroup: 'notes', duplicateState: 'candidate' },
      { id: 'sub-design', service: '匠心设计 Cloud', category: '创意工具', amount: 588, currency: 'CNY', cycle: 'yearly', nextRenewal: dateFromNow(28), status: 'active', autoRenew: true, source: 'demo', notes: '云端设计工具年度方案。', createdAt: ago(500), updatedAt: ago(5), duplicateState: 'none' },
      { id: 'sub-gym', service: '律动健身', category: '运动健康', amount: 199, currency: 'CNY', cycle: 'monthly', nextRenewal: dateFromNow(12), status: 'active', autoRenew: true, source: 'demo', notes: '线下健身空间月度会员。', createdAt: ago(400), updatedAt: ago(6), duplicateState: 'none' },
    ],
    activities: [
      { id: 'activity-1', title: '完成退货准备', description: '已拍摄降噪耳机商品与配件照片', timestamp: ago(1), kind: 'action' },
      { id: 'activity-2', title: '材料等待确认', description: '键盘订单截图的 4 个字段需要确认', timestamp: ago(2), kind: 'upload' },
      { id: 'activity-3', title: '更新退租计划', description: '已生成 4 步退租交接清单', timestamp: ago(8), kind: 'action' },
      { id: 'activity-4', title: '记录取消续费', description: '知音音乐已取消，记录年度少支出 ¥180', timestamp: ago(16), kind: 'complete' },
      { id: 'activity-5', title: '确认电子发票', description: '平板电脑保修事项已进入期限雷达', timestamp: ago(27), kind: 'confirm' },
    ],
    histories: [],
    profile: {
      name: '林晓', email: 'demo@lifeguard.local', timezone: 'Asia/Shanghai', currency: 'CNY', weeklySummary: false,
    },
  }
}
