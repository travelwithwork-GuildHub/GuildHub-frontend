import type { FurnitureKind } from '../environment/furnitureProps'

// Guild Hall 的配置。規格 `FE-W11-S01`／`S02`／`S05`。
//
// ⚠️⚠️ **配置是資料，不是散在 JSX 裡的座標。**
// 渲染出來的東西與註冊進物理世界的碰撞體吃**同一份** —— 兩份會漂，
// 而漂掉的症狀是「看起來走得過去卻卡住」。
// `world-environment` 花了整個 change 讓碰撞尺寸從視覺推導出來，
// 在這一層再寫第二份座標的話，那件事就白做了。
//
// ⚠️ **這個模組不碰 Rapier、不渲染。** 幾何算錯與 React 沒掛載混在一起的話，
// 紅燈說不出是哪一個。

/** 90° 的整數倍。`world-environment` 的碰撞描述只支援四分之一圈。 */
export type QuarterTurn = 0 | 1 | 2 | 3

interface Placement {
  /**
   * 穩定且唯一的識別字。**不是陣列索引** —— 插一段牆進去，
   * 後面每一項的身分都變了，而失敗訊息會說不出是哪一個。
   */
  readonly id: string
  readonly x: number
  readonly z: number
  /** 省略＝不旋轉。 */
  readonly turns?: QuarterTurn
}

/** 語意元件的種類。**跟家具分開** —— 它們各自是一個元件，不是 definition 表裡的一筆。 */
export const SEMANTIC_KINDS = ['sign', 'guildBanner', 'projectBoard', 'talentBoard', 'door'] as const

export type SemanticKind = (typeof SEMANTIC_KINDS)[number]

/**
 * 一個擺在世界裡的東西。
 *
 * **是 discriminated union 不是共用一組欄位** —— 牆要 `length`、地毯要
 * `width`／`depth`、家具什麼都不要。硬塞一組共用參數只會讓呼叫端猜哪幾個有效。
 */
export type LayoutItem =
  | (Placement & {
      readonly kind: 'wall'
      readonly length: number
      /**
       * 這面牆是**遊玩區域的邊界**。
       *
       * ⚠️ 有讀取者：邊界牆本來就跨在區域的邊上（內側面貼齊邊界、外側面在外面），
       * 所以「東西不得擺到區域外面」那條檢查對它不成立 —— 它**定義**了那條邊。
       * 用 `id` 開頭去猜是字串比對，改個名字就靜默失效。
       */
      readonly role?: 'boundary'
    })
  | (Placement & { readonly kind: 'carpet'; readonly width: number; readonly depth: number })
  | (Placement & {
      readonly kind: 'platform'
      readonly width: number
      readonly depth: number
      readonly height: number
    })
  | (Placement & { readonly kind: FurnitureKind })
  | (Placement & { readonly kind: SemanticKind })

export type LayoutKind = LayoutItem['kind']

/** 分區的識別字。**封閉列舉** —— `FE-W12` 靠它拿走廊的矩形。 */
export const ZONE_IDS = ['boards', 'social', 'corridor'] as const

export type ZoneId = (typeof ZONE_IDS)[number]

/**
 * 一個具名的矩形範圍。
 *
 * ⚠️ **只有矩形。** 間距、容量、朝向那些是 `FE-W12` 真的要排門的時候才知道的事
 *（見 change 的 design D4）—— 今天沒有讀取者的欄位不寫進來。
 *
 * ⚠️ **不建立 sensor。** 「玩家走進某一區時系統知道」是互動語意，
 * 今天沒有任何產品需求要它。
 */
export interface Zone {
  readonly id: ZoneId
  readonly x: number
  readonly z: number
  readonly halfWidth: number
  readonly halfDepth: number
}
