import { worldColor } from './world'

// `av` → 角色外觀。規格 `avatar-appearance`（`FE-W19`）。
//
// ⚠️⚠️ **這是唯一一份映射，本地與遠端都用它。**
// 各寫一次的話兩份會漂，而漂掉的症狀是「自己看到的自己」跟「別人看到的自己」
// 不一樣 —— 那種 bug 在單人測試時完全看不出來（`FE-W19-S03`）。
//
// ⚠️ **顏色一律走 `worldColor()`，這裡不出現任何字面色碼**（`FE-W19-S11`）。
// 兩個審查者**獨立**指出最可能做錯的決定是在角色元件裡寫
// `color={av === 1 ? '＜某個色碼＞' : SKIN}` —— 那會違反已合併的 `world-design-system`，
// （這一行刻意不寫真的色碼：`tests/avatar-look.test.ts` 會掃這個檔案，
//   而在註解裡舉反例然後加一行豁免，等於在守門的地方開一個門）
// 而且讓本地與遠端各自形成不同的映射。

/** 支援幾款外觀。規格定案 `N = 2`。 */
export const AVATAR_COUNT = 2

export type AvatarLook = {
  skin: string
  body: string
  limb: string
  ink: string
}

/** `av=0`：今天已經在畫面上的那一款。**這一項對現有畫面的淨變化是零。** */
const DEFAULT_LOOK: AvatarLook = {
  skin: worldColor('skin'),
  body: worldColor('avatarBody'),
  limb: worldColor('avatarLimb'),
  ink: worldColor('ink'),
}

const LOOKS: readonly AvatarLook[] = [
  DEFAULT_LOOK,
  {
    skin: worldColor('skin'),
    body: worldColor('avatarBodyAlt'),
    limb: worldColor('avatarLimbAlt'),
    ink: worldColor('ink'),
  },
]

/**
 * 把協定送來的 `av` 換成一組顏色。
 *
 * ⚠️⚠️ **參數是 `unknown` 而不是 `number`，那是刻意的。**
 * 後端的 `avatar_id: int` **沒有上界、沒有下界、沒有任何驗證**
 *（`presence.py` 的 `avatar_id: int = 0`），所以錯值一定會到這裡。
 * 收 `number` 的話，`null` 與非整數會在型別上被當成不可能發生，
 * 而它們在執行期完全可能發生。
 *
 * ⚠️⚠️ **SHALL NOT 用取模。**（`FE-W19-S07`）
 * `999 % 2 = 1` 會讓一個壞掉的值**看起來像使用者真的選了第二款角色** ——
 * 發表現場沒有錯誤、沒有異常，只有一個顯示成別款角色的陌生人，
 * 而在場的所有人（包括我們自己）都會把它當成正常行為。
 * 而且它**會隨版本漂移**：`AVATAR_COUNT` 從 2 變成 4 的那天，
 * 同一個 `999` 會無故換一款角色。
 *
 * ⚠️ **「不防禦會壞掉」這個直覺是錯的，這正是它危險的地方。**
 * 實測 three.js（套件本體）：`color: undefined` 不丟例外、不全黑，
 * 而是**靜默畫成白色**，console 只有一行警告。所以沒有這個 fallback 的後果
 * 不是崩潰，是一隻**看起來像正常角色的白色方塊人**。
 */
export function avatarLook(av: unknown): AvatarLook {
  // `Number.isInteger` 一次擋掉 `null`、`undefined`、字串、`NaN` 與 `1.5`
  if (!Number.isInteger(av)) return DEFAULT_LOOK
  const index = av as number
  if (index < 0 || index >= LOOKS.length) return DEFAULT_LOOK
  return LOOKS[index] ?? DEFAULT_LOOK
}
