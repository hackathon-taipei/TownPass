/**
 * DATA LAYER - 鄰食轉運站資料層的入口（T-107）。邏輯層 `logic/*.ts` 從 '../data' 引用。
 * 每個端點（合約 §8）一個函數，名稱＝「動作」欄。
 */
export * from './types'
export { MealApiError, currentAccountId, imageSrc, setAccountId } from './client'
export * from './account'
export { listPoints, createPoint, listFoods, getFood, createFood, updateFood, uploadImage, getImage } from './foods'
export * from './claims'
export * from './elders'
export * from './dispatch'
export * from './board'
