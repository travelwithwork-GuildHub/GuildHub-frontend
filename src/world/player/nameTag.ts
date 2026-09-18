// 名字牌的常數與唯一一份「有沒有名字」的判斷。規格 `name-tag`（`FE-W08`）。
//
// ⚠️ **這些數字只寫在這裡。** `NameTags` 的 inline style 與 `RemotePlayer` 的投影都從這裡讀；
// 測試也從這裡讀（除了手算的像素期望值 —— 那些刻意不呼叫投影函式）。

/**
 * 牌子的固定尺寸（CSS 像素）。規格〈牌子的寬度固定、名字過長截字〉、design D4。
 *
 * 固定寬的理由跟門標籤 `FE-W12-S12` 一樣：名字的長度由後端決定，讓它影響版面等於把版面交給不可控的輸入。
 * 高 28 ＝ `CAPTION` 行高 20 ＋ 上下各 4；牌子自己 `leading-7`（28 px）撐滿高度，邊界 1 px 各裁掉一點 line box（字看不出來）。
 */
export const NAME_TAG_SIZE = { width: 176, height: 28 } as const

/**
 * 頭頂錨點的高度（世界單位）。design D3：`ChibiPlayer` 的頭 `y=1.15` 高 `0.58` → 頭頂 `1.44`，再往上 `0.16`。
 * 牌子的底邊中點對到這一點。`FE-W08` 正式版換頭的高度時改這一個數字。
 */
export const NAME_TAG_ANCHOR_Y = 1.6

/**
 * 這個人有沒有名字可以畫。**只有這一份**（design D5）：`NameTags` 用它決定要不要渲染節點，
 * `RemotePlayer` 查不到節點就跳過 —— 不在兩處各判一次。
 *
 * 不是字串、或去掉頭尾空白後是空字串 → 沒有牌子；**不顯示任何替代字**（規格：`BE-G02` 那一片「訪客」的教訓）。
 * 畫出來的字仍然是原字串（不 trim）—— trim 只用來判「有沒有」。
 */
export function hasName(name: unknown): name is string {
  return typeof name === 'string' && name.trim() !== ''
}
