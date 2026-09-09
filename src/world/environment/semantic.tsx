'use client'

import type {} from '@react-three/fiber'
import type { PartDefinition, PropDefinition } from './definition'
import { PropParts } from './PropParts'

// 有產品語意的場景元件。規格 `FE-W10-S03`。
//
// **它們各自是一個元件，不進家具的 definition 表** —— 產品差異該由 TypeScript
// 表達，全部降級成 `<SceneProp kind="projectBoard">` 是把型別能表達的東西
// 換成執行期的字串約定（change 的 design D1）。
//
// ⚠️⚠️ **這個 repo 今天沒有任何在 3D 裡畫字的能力**
//（`dependencies` 沒有 drei、沒有 troika-three-text）。而加上去會建立 GPU texture
// 與 material，**直接違反 `FE-W10-S08`**。所以這五個上面**沒有字** ——
// 名稱與在線數由既有的 React DOM 呈現（`CONTEXT.md`：提示是 DOM 不是 3D text）。
//
// **「3D 裡要不要有字」是 `FE-W12` 的待答問題，不是這裡宣告「永遠在 DOM」。**
// 要畫字的話必須另外修改資源所有權契約，MUST NOT 偷渡進來。
//
// ⚠️ **沒有字，就得靠幾何語彙分得出來**（`FE-W10-S03`）：
// 立柱＋小板、縱向布旗＋頂桿、框架＋卡片、圓徽章、門框＋門板＋把手。
// **顏色只能輔助，不得是唯一差異** —— 玩家在 3D 裡分不出哪塊板子是什麼的話，
// 3D 就只是一條很貴的導覽列（`CONTEXT.md`〈3D 憑什麼存在〉）。
//
// ⚠️ **只宣告今天就有作用的 props。** `title`／`onlineCount` 這類今天沒有輸出的
// 欄位不寫進來 —— 型別上存在但被忽略的 props 是「有 API 的外觀」。`FE-W12` 再加。

const POST = { kind: 'standard', color: 'woodDark', roughness: 0.8 } as const
const METAL = { kind: 'standard', color: 'metal', roughness: 0.4, metalness: 0.6 } as const

/** 立在地上的柱子。五種語意元件都靠它落地（`FE-W10-S13`）。 */
function post(x: number, height: number, radius = 0.05): PartDefinition {
  return {
    geometry: { shape: 'Cylinder', radius, height },
    material: POST,
    position: [x, height / 2, 0],
    blocks: true,
  }
}

/** 招牌：**一根立柱頂著一塊小板**。板子不擋路（它在頭上）。 */
export function signDefinition(width = 0.7): PropDefinition {
  return {
    parts: [
      post(0, 1.6),
      {
        geometry: { shape: 'RoundedBox', width, height: 0.34, depth: 0.05, radius: 0.04 },
        material: { kind: 'standard', color: 'board', roughness: 0.8 },
        position: [0, 1.5, 0],
      },
    ],
  }
}

/** 公會旗：**縱向的布旗掛在頂桿上**。輪廓是直的、長的，跟招牌的橫板分得開。 */
export function guildBannerDefinition(height = 2.6): PropDefinition {
  return {
    parts: [
      post(0, height, 0.04),
      // 頂桿與旗面**掛在旗桿的一側**。置中的話旗桿會從旗面正中間穿過去
      // —— 目視才看得出來，而那看起來像穿模不像旗子。
      {
        geometry: { shape: 'RoundedBox', width: 0.94, height: 0.06, depth: 0.06, radius: 0.02 },
        material: METAL,
        position: [0.45, height - 0.1, 0],
      },
      {
        geometry: { shape: 'RoundedBox', width: 0.8, height: height * 0.62, depth: 0.03, radius: 0.02 },
        material: { kind: 'standard', color: 'cloth', roughness: 1 },
        position: [0.45, height - 0.13 - (height * 0.62) / 2, 0],
      },
    ],
  }
}

function boardFrame(width: number, height: number): PartDefinition[] {
  return [
    post(-width / 2 + 0.1, 0.9),
    post(width / 2 - 0.1, 0.9),
    {
      geometry: { shape: 'RoundedBox', width, height, depth: 0.07, radius: 0.04 },
      material: { kind: 'standard', color: 'board', roughness: 0.9 },
      position: [0, 0.9 + height / 2 - 0.1, 0],
    },
  ]
}

/** 專案看板：**兩隻腳撐著一片橫板，上面釘著一排方形卡片**。 */
export function projectBoardDefinition(items = 4): PropDefinition {
  const width = 1.8
  const height = 1.1
  const cards: PartDefinition[] = Array.from({ length: items }, (_, i) => ({
    geometry: { shape: 'RoundedBox', width: 0.3, height: 0.38, depth: 0.02, radius: 0.02 },
    material: { kind: 'standard', color: 'card', roughness: 0.9 },
    // 沿著板面排開；`items` 改變時看得出來。
    position: [(i - (items - 1) / 2) * 0.38, 1.45, 0.05],
  }))
  return { parts: [...boardFrame(width, height), ...cards] }
}

/** 人才看板：**直立的窄板，上面是圓形的徽章** —— 跟專案看板的方形卡片分得開。 */
export function talentBoardDefinition(items = 3): PropDefinition {
  const width = 1
  const height = 1.5
  // ⚠️ 徽章是**球**不是圓盤。第一版用了平躺的 `Cylinder`，目視才發現它是
  // 「躺在板子上的碟子」而不是「貼在板面上的徽章」——
  // `PartDefinition` 只有 `rotationY`（繞 Y 軸），立不起來。
  // 加 `rotationX` 會讓碰撞的 90° 規則變成兩個軸的問題，**代價遠大於這個造型**。
  // 球從每個角度看都是圓的，而「圓 vs 方」正是它跟 `ProjectBoard` 的差異所在。
  const badges: PartDefinition[] = Array.from({ length: items }, (_, i) => ({
    geometry: { shape: 'Sphere', radius: 0.15 },
    material: { kind: 'standard', color: 'card', roughness: 0.9 },
    position: [0, 1.75 - i * 0.42, 0.09],
  }))
  return { parts: [...boardFrame(width, height), ...badges] }
}

/**
 * 門：**門框（兩根立柱＋門楣）＋ 門板 ＋ 把手**。
 *
 * `open` 今天就有作用：門板轉 90°（**是 90° 的整數倍**，所以碰撞的規則吃得下 ——
 * 見 `quarterTurnsOf`）。門板本身不擋路，擋路的是門框。
 */
export function doorDefinition(open = false): PropDefinition {
  const width = 1.4
  const height = 2.2
  return {
    parts: [
      post(-width / 2, height, 0.09),
      post(width / 2, height, 0.09),
      {
        geometry: { shape: 'RoundedBox', width: width + 0.18, height: 0.18, depth: 0.18, radius: 0.04 },
        material: POST,
        position: [0, height - 0.09, 0],
        blocks: true,
      },
      {
        geometry: { shape: 'RoundedBox', width: width - 0.12, height: height - 0.2, depth: 0.07, radius: 0.03 },
        material: { kind: 'standard', color: 'wood', roughness: 0.7 },
        // 開的時候門板轉到側面；原點在門的中心，所以位置也跟著挪到門軸那一側。
        position: open ? [-width / 2, (height - 0.2) / 2, (width - 0.12) / 2] : [0, (height - 0.2) / 2, 0],
        rotationY: open ? Math.PI / 2 : 0,
      },
      {
        geometry: { shape: 'Sphere', radius: 0.07 },
        material: METAL,
        position: open ? [-width / 2, 1.05, width - 0.28] : [width / 2 - 0.24, 1.05, 0.06],
      },
    ],
  }
}

export function Sign({ width }: { width?: number }) {
  return <PropParts definition={signDefinition(width)} />
}

export function GuildBanner({ height }: { height?: number }) {
  return <PropParts definition={guildBannerDefinition(height)} />
}

export function ProjectBoard({ items }: { items?: number }) {
  return <PropParts definition={projectBoardDefinition(items)} />
}

export function TalentBoard({ items }: { items?: number }) {
  return <PropParts definition={talentBoardDefinition(items)} />
}

export function Door({ open }: { open?: boolean }) {
  return <PropParts definition={doorDefinition(open)} />
}
