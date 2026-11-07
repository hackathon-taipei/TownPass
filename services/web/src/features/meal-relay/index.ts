/**
 * 鄰食轉運站（wiring only）- 合約 docs/system/11-meal-relay.md §9。
 *   ui/     MR-P01～MR-P08 頁面（T-107 先放佔位頁，各工單換成正式頁面；MR-P02 已取消 ADR-026、MR-P03 已取消 ADR-025）
 *   logic/  各頁面的邏輯（T-114、T-116～T-120）
 *   data/   每個端點一個函數（T-107）
 */
import { HandPlatter } from 'lucide-vue-next'
import { defineFeature } from '@/framework'

export default defineFeature({
  id: 'meal-relay',
  code: 'MR',
  title: '鄰食轉運站',
  description: '把多出來的食物轉給附近需要的長者：志工到據點報到，系統自動派送餐點與關懷',
  icon: HandPlatter,
  order: 1,
  keywords: ['食物', '剩食', '惜食', '便當', '送餐', '長者', '關懷', '志工', '據點'],

  routes: [
    { path: '', name: 'home', component: () => import('./ui/HomePage.vue') },
    { path: 'volunteer', name: 'volunteer', component: () => import('./ui/VolunteerPage.vue') },
    { path: 'volunteer/tasks', name: 'tasks', component: () => import('./ui/TaskPage.vue') },
    { path: 'supplier', name: 'supplier', component: () => import('./ui/SupplierPage.vue') },
    { path: 'station', name: 'station', component: () => import('./ui/StationPage.vue') },
    { path: 'admin', name: 'admin', component: () => import('./ui/AdminPage.vue') },
  ],

  // 據點與食物點的種子（T-115，docs/meal-relay/T-115.md）；與 data/SOURCES.md 同步
  sources: [
    {
      name: '臺北市銀髮族服務_社區照顧關懷據點',
      provider: '臺北市政府社會局',
      url: 'https://data.gov.tw/dataset/121285',
      licence: '政府資料開放授權條款 1.0',
    },
    {
      name: '臺北市各級學校分布圖(含國小.國中.高中職.特教學校.市立大專院校)',
      provider: '臺北市政府教育局',
      url: 'https://data.gov.tw/dataset/121225',
      licence: '政府資料開放授權條款 1.0',
    },
    {
      name: '臺北市固定里民活動場所資料',
      provider: '臺北市政府民政局',
      url: 'https://data.gov.tw/dataset/121174',
      licence: '政府資料開放授權條款 1.0',
    },
    {
      name: '臺北市門牌位置數值資料',
      provider: '臺北市政府民政局',
      url: 'https://data.gov.tw/dataset/155472',
      licence: '政府資料開放授權條款 1.0',
    },
  ],
})
