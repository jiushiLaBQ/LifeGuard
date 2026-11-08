import { createRouter, createWebHistory } from 'vue-router'

export const router = createRouter({
  history: createWebHistory(),
  scrollBehavior: () => ({ top: 0 }),
  routes: [
    { path: '/', redirect: '/welcome' },
    { path: '/welcome', component: () => import('@/features/demo/WelcomePage.vue'), meta: { title: '欢迎' } },
    {
      path: '/',
      component: () => import('./AppShell.vue'),
      children: [
        { path: 'dashboard', component: () => import('@/features/dashboard/DashboardPage.vue'), meta: { title: '今日概览' } },
        { path: 'materials', component: () => import('@/features/materials/MaterialsPage.vue'), meta: { title: '材料中心' } },
        { path: 'radar', component: () => import('@/features/deadlines/RadarPage.vue'), meta: { title: '期限雷达' } },
        { path: 'actions', component: () => import('@/features/actions/ActionsPage.vue'), meta: { title: '行动中心' } },
        { path: 'spending', component: () => import('@/features/subscriptions/SpendingPage.vue'), meta: { title: '消费分析' } },
        { path: 'subscriptions/:id', component: () => import('@/features/subscriptions/SubscriptionDetailPage.vue'), meta: { title: '订阅详情' } },
        { path: 'settings', component: () => import('@/features/settings/SettingsPage.vue'), meta: { title: '隐私与设置' } },
        { path: 'matters/:id', component: () => import('@/features/matters/MatterDetailPage.vue'), meta: { title: '事项详情' } },
      ],
    },
    { path: '/:pathMatch(.*)*', component: () => import('@/features/demo/NotFoundPage.vue'), meta: { title: '页面不存在' } },
  ],
})

router.afterEach((to) => {
  document.title = `${to.meta.title ?? '知悉'} · 知悉 LifeGuard`
})
