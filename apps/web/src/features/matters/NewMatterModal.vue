<script setup lang="ts">
import { reactive } from 'vue'
import { useRouter } from 'vue-router'
import BaseModal from '@/components/BaseModal.vue'
import { matterTypeLabels, isValidDateString } from '@/shared/ui/format'
import { useDemoStore } from '@/stores/demo'
import { useUiStore } from '@/stores/ui'
import { useToast } from '@/shared/ui/useToast'
import type { MatterImportance, MatterType } from '@/types'

const store = useDemoStore()
const ui = useUiStore()
const router = useRouter()
const { notify } = useToast()
const types = Object.keys(matterTypeLabels) as MatterType[]
const form = reactive({ title: '', merchant: '', amount: '', dueDate: '', type: 'purchase' as MatterType, importance: '' as '' | MatterImportance, preparationDays: '', obligation: '', nextAction: '' })
const errors = reactive<Record<string, string>>({})

function submit() {
  errors.title = form.title.trim() ? '' : '请输入事项名称'
  errors.merchant = form.merchant.trim() ? '' : '请输入商家或办理机构'
  errors.amount = !form.amount || (/^\d+(\.\d{1,2})?$/.test(form.amount) && Number.isSafeInteger(Math.round(Number(form.amount) * 100))) ? '' : '请输入非负金额，最多两位小数'
  errors.dueDate = !form.dueDate || isValidDateString(form.dueDate) ? '' : '请选择有效的日历日期'
  errors.preparationDays = !form.preparationDays || (/^\d+$/.test(form.preparationDays) && Number(form.preparationDays) <= 90) ? '' : '准备时间需为 0—90 天的整数'
  errors.nextAction = form.nextAction.trim() ? '' : '请填写清晰的下一步行动'
  if (Object.values(errors).some(Boolean)) return
  const matter = store.addManualMatter({
    title: form.title.trim(), merchant: form.merchant.trim(),
    amount: form.amount ? Number(form.amount) : null, dueDate: form.dueDate || null,
    type: form.type, importance: form.importance || undefined,
    preparationDays: form.preparationDays ? Number(form.preparationDays) : undefined,
    obligation: form.obligation.trim() || undefined, nextAction: form.nextAction.trim(),
  })
  ui.matterOpen = false
  Object.assign(form, { title: '', merchant: '', amount: '', dueDate: '', type: 'purchase', importance: '', preparationDays: '', obligation: '', nextAction: '' })
  notify('事项已创建', 'success', '五维优先级和动态行动方案已生成')
  router.push(`/matters/${matter.id}`)
}
</script>

<template>
  <BaseModal :open="ui.matterOpen" title="新建生活事项" description="金额和日期可留空待核实；未填写的重要性与准备时间会由规则暂估并明确标记。" wide @close="ui.matterOpen = false">
    <form id="new-matter-form" class="space-y-4" novalidate @submit.prevent="submit">
      <div><label class="label" for="matter-title">事项名称</label><input id="matter-title" v-model="form.title" class="input" placeholder="例如：无线耳机退货" /><p v-if="errors.title" class="field-error">{{ errors.title }}</p></div>
      <div class="grid gap-4 sm:grid-cols-2">
        <div><label class="label" for="matter-type">事项类型</label><select id="matter-type" v-model="form.type" class="input"><option v-for="type in types" :key="type" :value="type">{{ matterTypeLabels[type] }}</option></select></div>
        <div><label class="label" for="matter-merchant">商家 / 机构</label><input id="matter-merchant" v-model="form.merchant" class="input" placeholder="例如：数码旗舰店" /><p v-if="errors.merchant" class="field-error">{{ errors.merchant }}</p></div>
      </div>
      <div class="grid gap-4 sm:grid-cols-2">
        <div><label class="label" for="matter-amount">涉及金额（CNY，可选）</label><input id="matter-amount" v-model="form.amount" class="input" inputmode="decimal" placeholder="留空则不估算损失" /><p v-if="errors.amount" class="field-error">{{ errors.amount }}</p></div>
        <div><label class="label" for="matter-date">办理截止日（可选）</label><input id="matter-date" v-model="form.dueDate" class="input" type="date" /><p v-if="errors.dueDate" class="field-error">{{ errors.dueDate }}</p></div>
      </div>
      <div class="grid gap-4 sm:grid-cols-2">
        <div><label class="label" for="matter-importance">重要程度</label><select id="matter-importance" v-model="form.importance" class="input"><option value="">由类型规则暂估</option><option v-for="value in [1, 2, 3, 4, 5]" :key="value" :value="value">{{ value }} / 5</option></select></div>
        <div><label class="label" for="matter-preparation">预计准备时间（天，可选）</label><input id="matter-preparation" v-model="form.preparationDays" class="input" inputmode="numeric" placeholder="由类型规则暂估" /><p v-if="errors.preparationDays" class="field-error">{{ errors.preparationDays }}</p></div>
      </div>
      <div v-if="form.type === 'lease'"><label class="label" for="matter-obligation">待履行义务（请核对合同原文）</label><textarea id="matter-obligation" v-model="form.obligation" class="input min-h-20 resize-none" placeholder="例如：提前书面通知、房屋交接和费用结算；不确定时可留空" /></div>
      <div><label class="label" for="matter-action">下一步行动</label><textarea id="matter-action" v-model="form.nextAction" class="input min-h-24 resize-none" placeholder="例如：提交退货申请并保存受理编号" /><p v-if="errors.nextAction" class="field-error">{{ errors.nextAction }}</p></div>
    </form>
    <template #footer><button class="btn-secondary" @click="ui.matterOpen = false">取消</button><button type="submit" form="new-matter-form" class="btn-primary">创建并生成行动清单</button></template>
  </BaseModal>
</template>
