/**
 * 鄰食轉運站（wiring only）- 合約 docs/system/11-meal-relay.md §9。
 *   ui/     MR-P01～MR-P08 頁面（T-107 先放佔位頁，各工單換成正式頁面）
 *   logic/  各頁面的邏輯（T-114、T-116～T-120）
 *   data/   每個端點一個函數（T-107）
 */
import { HandPlatter } from 'lucide-vue-next'
import { defineFeature } from '@/framework'

export default defineFeature({
  id: 'meal-relay',
  code: 'MR',
  title: '鄰食轉運站',
  description: '把多出來的食物轉給附近需要的長者：找食物、申請自取或送餐、志工報到送餐關懷',
  icon: HandPlatter,
  order: 1,
  keywords: ['食物', '剩食', '惜食', '便當', '送餐', '長者', '關懷', '志工', '據點'],

  routes: [
    { path: '', name: 'home', component: () => import('./ui/HomePage.vue') },
    { path: 'elder', name: 'elder', component: () => import('./ui/ElderPage.vue') },
    { path: 'food/:id', name: 'food', component: () => import('./ui/FoodDetailPage.vue') },
    { path: 'volunteer', name: 'volunteer', component: () => import('./ui/VolunteerPage.vue') },
    { path: 'volunteer/tasks', name: 'tasks', component: () => import('./ui/TaskPage.vue') },
    { path: 'supplier', name: 'supplier', component: () => import('./ui/SupplierPage.vue') },
    { path: 'station', name: 'station', component: () => import('./ui/StationPage.vue') },
    { path: 'admin', name: 'admin', component: () => import('./ui/AdminPage.vue') },
  ],

  // TODO(T-115)：匯入開放資料（社區照顧關懷據點等）後，在這裡登記資料來源，並同步 data/SOURCES.md 與頁面 SourceNote
  sources: [],
})
