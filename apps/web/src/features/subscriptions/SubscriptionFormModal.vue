<script setup lang="ts">
import { reactive, ref, watch } from 'vue'
import BaseModal from '@/components/BaseModal.vue'
import { useDemoStore } from '@/stores/demo'
import { isValidDateString } from '@/shared/ui/format'
import { useToast } from '@/shared/ui/useToast'
import type { BillingCycle, Subscription } from '@/types'

const props = withDefaults(defineProps<{ open: boolean; subscription?: Subscription }>(), { subscription: undefined })
const emit = defineEmits<{ close: []; saved: [subscription: Subscription] }>()
const store = useDemoStore()
const { notify } = useToast()
const error = ref('')
const form = reactive({
  service: '', category: '其他', amount: '', currency: 'CNY' as Subscription['currency'],
  cycle: '' as BillingCycle | '', nextRenewal: '', autoRenew: true, notes: '',
})

watch(() => [props.open, props.subscription?.id] as const, ([open]) => {
  if (!open) return
  const item = props.subscription
  Object.assign(form, {
    service: item?.service ?? '', category: item?.category ?? '其他', amount: item ? String(item.amount) : '',
    currency: item?.currency ?? (store.profile.currency as Subscription['currency']), cycle: item?.cycle ?? '',
    nextRenewal: item?.nextRenewal ?? '', autoRenew: item?.autoRenew ?? true, notes: item?.notes ?? '',
  })
  error.value = ''
}, { immediate: true })

function save() {
  if (!form.service.trim() || !form.category.trim()) { error.value = '请填写服务名称和分类'; return }
  if (!/^\d+(\.\d{1,2})?$/.test(form.amount) || !Number.isSafeInteger(Math.round(Number(form.amount) * 100))) { error.value = '金额需为非负数字，最多两位小数'; return }
  if (!form.cycle) { error.value = '请选择实际续费周期'; return }
  if (!isValidDateString(form.nextRenewal)) { error.value = '请选择真实有效的下次续费日期'; return }
  try {
    const input = {
      service: form.service, category: form.category, amount: Number(form.amount), currency: form.currency,
      cycle: form.cycle, nextRenewal: form.nextRenewal, autoRenew: form.autoRenew, notes: form.notes,
    }
    const saved = props.subscription ? store.updateSubscription(props.subscription.id, input) : store.addSubscription(input)
    emit('saved', saved)
    emit('close')
    notify(props.subscription ? '订阅记录已更新' : '订阅记录已新增', 'success', '所有费用摘要、趋势和续费时间轴已按记录重新计算。')
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : '保存失败，请检查填写内容'
  }
}
</script>

<template>
  <BaseModal :open="open" :title="subscription ? '编辑订阅记录' : '新增订阅记录'" description="只记录你已核实的扣款信息；保存不会更改第三方服务商的订阅状态。" wide @close="emit('close')">
    <form id="subscription-form" class="grid gap-4 sm:grid-cols-2" @submit.prevent="save">
      <label class="block"><span class="label">服务名称</span><input v-model="form.service" class="input" placeholder="例如：虚构视频会员" /></label>
      <label class="block"><span class="label">分类</span><input v-model="form.category" class="input" list="subscription-categories" placeholder="例如：影音娱乐" /><datalist id="subscription-categories"><option value="影音娱乐" /><option value="效率工具" /><option value="创意工具" /><option value="运动健康" /><option value="教育学习" /><option value="生活服务" /><option value="其他" /></datalist></label>
      <label class="block"><span class="label">每次扣款金额</span><input v-model="form.amount" class="input" inputmode="decimal" placeholder="0.00" /></label>
      <label class="block"><span class="label">货币单位</span><select v-model="form.currency" class="input"><option value="CNY">CNY · 人民币</option><option value="USD">USD · 美元</option><option value="HKD">HKD · 港币</option></select></label>
      <label class="block"><span class="label">续费周期</span><select v-model="form.cycle" class="input"><option value="">请选择，不猜测</option><option value="monthly">月付</option><option value="quarterly">季付</option><option value="yearly">年付</option></select></label>
      <label class="block"><span class="label">下次续费日期</span><input v-model="form.nextRenewal" class="input" type="date" /></label>
      <label class="flex items-start gap-3 rounded-xl border border-line p-4 sm:col-span-2"><input v-model="form.autoRenew" type="checkbox" class="mt-1 size-4 accent-[#4056d6]" /><span><span class="block text-sm font-medium text-ink">记录为自动续费</span><span class="mt-1 block text-xs leading-5 text-muted">关闭后保留记录，但不计入未来扣款预测。这里不会操作服务商账户。</span></span></label>
      <label class="block sm:col-span-2"><span class="label">权益与备注</span><textarea v-model="form.notes" class="input min-h-24 resize-y" placeholder="记录实际功能、账号或使用场景，帮助判断相似服务是否真正重复" /></label>
      <p v-if="error" class="field-error sm:col-span-2" role="alert">{{ error }}</p>
    </form>
    <template #footer><button class="btn-secondary" @click="emit('close')">取消</button><button type="submit" form="subscription-form" class="btn-primary">保存订阅</button></template>
  </BaseModal>
</template>
