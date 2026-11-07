<script setup lang="ts">
import { reactive, ref } from 'vue'
import { BellOff, Check, Database, Download, FileJson, HardDrive, RefreshCcw, ShieldCheck, Trash2, TriangleAlert } from 'lucide-vue-next'
import PageHeader from '@/components/PageHeader.vue'
import BaseBadge from '@/components/BaseBadge.vue'
import BaseModal from '@/components/BaseModal.vue'
import { useDemoStore } from '@/stores/demo'
import { toDateInput } from '@/shared/ui/format'
import { useToast } from '@/shared/ui/useToast'
import { clearMaterialFiles } from '@/features/materials/recognitionRunner'

const store = useDemoStore()
const { notify } = useToast()
const form = reactive({ ...store.profile })
const errors = reactive({ name: '', email: '' })
const resetOpen = ref(false)
const clearOpen = ref(false)
const clearConfirmation = ref('')
function saveProfile() {
  errors.name = form.name.trim() ? '' : '请填写称呼'
  errors.email = !form.email || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email) ? '' : '请输入有效的邮箱格式'
  if (errors.name || errors.email) return
  store.saveProfile({ ...form, name: form.name.trim(), email: form.email.trim() })
  notify('偏好设置已保存', 'success', '仅保存在当前浏览器演示工作区。')
}
function exportData() {
  const payload = { exportedAt: new Date().toISOString(), mode: 'lifeguard-local-demo', profile: store.profile, matters: store.matters, actions: store.actions, materials: store.materials.map(({ previewUrl: _previewUrl, ...material }) => material), subscriptions: store.subscriptions, activities: store.activities, histories: store.histories }
  const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `lifeguard-demo-${toDateInput(new Date())}.json`
  anchor.click()
  URL.revokeObjectURL(url)
  notify('演示数据已导出', 'success', 'JSON 文件不包含原始附件或临时预览地址。')
}
function resetDemo() {
  clearMaterialFiles()
  store.resetDemo()
  Object.assign(form, store.profile)
  resetOpen.value = false
  notify('演示样例已重新载入')
}
function clearDemo() {
  if (clearConfirmation.value !== '清空') return
  clearMaterialFiles()
  store.clearDemo()
  clearConfirmation.value = ''
  clearOpen.value = false
  notify('工作区记录已清空', 'success', '基础偏好仍保留，可随时重新载入演示样例。')
}
</script>

<template>
  <div>
    <PageHeader eyebrow="隐私与设置" title="你的数据边界，应该看得见" description="当前是免登录本地演示。资料、记录与偏好只保存在此浏览器，不代表已接入云端账户或跨设备同步。" />

    <div class="grid items-start gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,1fr)]">
      <div class="space-y-5">
        <section class="card p-5 sm:p-6" aria-labelledby="profile-title"><div class="flex items-center justify-between"><div><h2 id="profile-title" class="section-title">基础信息与偏好</h2><p class="mt-1 text-xs text-muted">用于本地界面显示，不会创建真实账户。</p></div><BaseBadge label="本地保存" /></div><form class="mt-5 grid gap-4 sm:grid-cols-2" @submit.prevent="saveProfile"><label class="block"><span class="label">称呼</span><input v-model="form.name" class="input" autocomplete="name" /><span v-if="errors.name" class="field-error" role="alert">{{ errors.name }}</span></label><label class="block"><span class="label">邮箱（可选，仅作资料展示）</span><input v-model="form.email" class="input" type="email" autocomplete="email" /><span v-if="errors.email" class="field-error" role="alert">{{ errors.email }}</span></label><label class="block"><span class="label">显示时区</span><select v-model="form.timezone" class="input"><option value="Asia/Shanghai">Asia/Shanghai（UTC+8）</option><option value="Asia/Tokyo">Asia/Tokyo（UTC+9）</option><option value="UTC">UTC</option></select><span class="mt-1.5 block text-xs text-muted">首版日期按浏览器本地日历计算，跨时区同步尚未接入。</span></label><label class="block"><span class="label">默认币种</span><select v-model="form.currency" class="input"><option value="CNY">CNY · 人民币</option></select></label><label class="flex cursor-pointer items-start gap-3 rounded-xl border border-line p-4 sm:col-span-2"><input v-model="form.weeklySummary" type="checkbox" class="mt-1 size-4 accent-[#4056d6]" /><span><span class="block text-sm font-medium text-ink">记录每周摘要偏好</span><span class="mt-1 block text-xs leading-5 text-muted">仅保存开关状态。邮件、系统推送和后台定时提醒尚未接入。</span></span></label><div class="sm:col-span-2"><button type="submit" class="btn-primary"><Check :size="16" />保存设置</button></div></form></section>

        <section class="card p-5 sm:p-6" aria-labelledby="data-title"><h2 id="data-title" class="section-title">数据管理</h2><p class="mt-1 text-xs leading-5 text-muted">导出内容包含事项、行动、字段与订阅记录，不包含原始附件。清除浏览器站点数据也可能删除本地记录。</p><div class="mt-5 space-y-3"><div class="flex flex-col gap-3 rounded-xl border border-line p-4 sm:flex-row sm:items-center"><span class="flex size-10 shrink-0 items-center justify-center rounded-[10px] bg-indigo-50 text-brand"><FileJson :size="19" /></span><div class="flex-1"><p class="text-sm font-semibold text-ink">导出演示工作区</p><p class="mt-1 text-xs text-muted">下载可读的 JSON 备份。</p></div><button class="btn-secondary" @click="exportData"><Download :size="15" />导出 JSON</button></div><div class="flex flex-col gap-3 rounded-xl border border-line p-4 sm:flex-row sm:items-center"><span class="flex size-10 shrink-0 items-center justify-center rounded-[10px] bg-canvas text-muted"><RefreshCcw :size="19" /></span><div class="flex-1"><p class="text-sm font-semibold text-ink">重新载入演示样例</p><p class="mt-1 text-xs text-muted">用初始虚构样例替换当前全部记录。</p></div><button class="btn-secondary" @click="resetOpen = true"><RefreshCcw :size="15" />重新载入</button></div><div class="flex flex-col gap-3 rounded-xl border border-red-100 bg-red-50/40 p-4 sm:flex-row sm:items-center"><span class="flex size-10 shrink-0 items-center justify-center rounded-[10px] bg-red-50 text-danger"><Trash2 :size="19" /></span><div class="flex-1"><p class="text-sm font-semibold text-ink">清空工作区记录</p><p class="mt-1 text-xs text-muted">删除本地事项、材料字段、行动和订阅，保留基础偏好。</p></div><button class="btn-danger" @click="clearOpen = true"><Trash2 :size="15" />清空记录</button></div></div></section>
      </div>

      <div class="space-y-5">
        <section class="card overflow-hidden" aria-labelledby="capability-title"><div class="border-b border-line px-5 py-4"><h2 id="capability-title" class="section-title">当前能力状态</h2><p class="mt-1 text-xs text-muted">不可用能力明确展示，不显示虚假进度。</p></div><div class="divide-y divide-line px-5"><div class="flex gap-3 py-4"><HardDrive :size="18" class="mt-0.5 shrink-0 text-success" /><div><p class="text-sm font-medium text-ink">本地记录与 JSON 导出</p><p class="mt-1 text-xs leading-5 text-muted">可用 · 保存在 localStorage</p></div></div><div class="flex gap-3 py-4"><Database :size="18" class="mt-0.5 shrink-0 text-muted" /><div><p class="text-sm font-medium text-ink">账户、云同步与私密附件存储</p><p class="mt-1 text-xs leading-5 text-muted">未接入 · 当前无服务端数据库</p></div></div><div class="flex gap-3 py-4"><ShieldCheck :size="18" class="mt-0.5 shrink-0 text-muted" /><div><p class="text-sm font-medium text-ink">浏览器 OCR、PDF 解析与规则字段候选</p><p class="mt-1 text-xs leading-5 text-muted">可用 · 文件不离开设备，OCR 语言数据按需下载；外部模型未接入</p></div></div><div class="flex gap-3 py-4"><BellOff :size="18" class="mt-0.5 shrink-0 text-muted" /><div><p class="text-sm font-medium text-ink">邮件与系统通知</p><p class="mt-1 text-xs leading-5 text-muted">未接入 · 打开应用可查看站内期限</p></div></div></div></section>
        <section class="rounded-[14px] border border-indigo-100 bg-indigo-50/60 p-5"><ShieldCheck :size="21" class="text-brand" /><h2 class="mt-3 text-sm font-semibold text-ink">私人材料处理原则</h2><ul class="mt-3 space-y-2.5 text-xs leading-5 text-muted"><li>· 本阶段文件只在浏览器内读取，不会自动上传。</li><li>· 请勿在公开设备或公开演示中上传真实订单、合同与身份信息。</li><li>· 后续云端版本必须由服务端验证身份与对象所有权，密钥只保存在服务端。</li><li>· 演示金额、日期和节省记录均为虚构样例。</li></ul></section>
      </div>
    </div>

    <BaseModal :open="resetOpen" title="重新载入演示样例？" description="当前新增、编辑与完成记录都会被初始虚构样例替换，此操作无法撤销。" @close="resetOpen = false"><div class="flex gap-3 rounded-xl bg-orange-50 p-4"><TriangleAlert :size="19" class="shrink-0 text-warning" /><p class="text-sm leading-6 text-muted">如需保留当前记录，请先导出 JSON。</p></div><template #footer><button class="btn-secondary" @click="resetOpen = false">取消</button><button class="btn-primary" @click="resetDemo">重新载入</button></template></BaseModal>
    <BaseModal :open="clearOpen" title="清空全部工作区记录？" description="此操作会移除当前浏览器中的全部演示业务记录，无法撤销。" @close="clearOpen = false; clearConfirmation = ''"><label class="block"><span class="label">输入“清空”以确认</span><input v-model="clearConfirmation" class="input" autocomplete="off" placeholder="清空" /></label><template #footer><button class="btn-secondary" @click="clearOpen = false; clearConfirmation = ''">取消</button><button class="btn-danger" :disabled="clearConfirmation !== '清空'" @click="clearDemo"><Trash2 :size="15" />永久清空</button></template></BaseModal>
  </div>
</template>
