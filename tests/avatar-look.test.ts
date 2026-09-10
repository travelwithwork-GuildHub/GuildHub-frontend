import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { AVATAR_COUNT, avatarLook } from '@/design/avatar'
import { colorLiterals } from '@/design/colorScan'

// 規格 `avatar-appearance`（`FE-W19`）的**映射那一半**。
//
// ⚠️ **這一份不驗「畫面上看得出差別」** —— 那要真的 WebGL 與像素，在 e2e。
// 這裡驗的是映射本身：值域外回得到預設、而且**不是靠「永遠回預設」做到的**。

const ROOT = join(import.meta.dirname, '..')

describe('av 換成外觀', () => {
  // ── 正向：`S10`。**沒有這一條，底下四條全部是恆真的** ──────────
  //
  // 一個完全忽略 `av`、永遠回 `DEFAULT_LOOK` 的實作，會讓
  // `S06`–`S09` 全部通過 —— 因為「錯值回預設」跟「什麼都回預設」
  // 在那四條判準下**完全一樣**。
  it('[FE-W19-S10] `av=1` 跟 `av=0` 真的不一樣', () => {
    expect(
      avatarLook(1),
      '兩款外觀相同 —— 那代表映射沒有在讀 `av`，而底下所有回退判準都會變成恆真的',
    ).not.toEqual(avatarLook(0))
  })

  // ── `S04`／`S05` 的映射層：差異要落在大面積部位 ────────────────
  //
  // ⚠️ **只有 `ink`（眼睛）不同不算。** 實測只換眼睛的差異像素佔角色像素
  // 3.71%，遠低於 10% 的門檻 —— 一般遊戲視角下那不是另一款 avatar。
  it('[FE-W19-S04] 差異落在主要視覺部位，不是只有眼睛', () => {
    const a = avatarLook(0)
    const b = avatarLook(1)
    const major = [a.skin !== b.skin, a.body !== b.body, a.limb !== b.limb]
    expect(
      major.some(Boolean),
      '兩款外觀只有 `ink`（眼睛）不同 —— 規格逐字：僅有眼睛等局部細節的差異 SHALL NOT 視為不同的 avatar',
    ).toBe(true)
  })

  // ── 反向：值域外一律回 `av=0` ─────────────────────────────────
  it('[FE-W19-S06] 負數回到預設', () => {
    expect(avatarLook(-1)).toEqual(avatarLook(0))
  })

  it('[FE-W19-S07] 超出上界的整數回到預設，而不是繞回去', () => {
    expect(avatarLook(999)).toEqual(avatarLook(0))
    // ⚠️⚠️ **這一句是這條 Requirement 的核心。** 少了它，取模的實作也會通過
    //（`999 % 2 = 1`）。而取模的後果是壞掉的值**看起來像使用者真的選了第二款**。
    expect(
      avatarLook(999),
      '`999` 被畫成了 `av=1` —— 那是取模的症狀。壞掉的值 SHALL NOT 看起來像一個合法選擇',
    ).not.toEqual(avatarLook(1))
  })

  it('[FE-W19-S07] 上界本身也在外面', () => {
    // `AVATAR_COUNT` 是**數量**不是最大值。`LOOKS[2]` 不存在。
    expect(avatarLook(AVATAR_COUNT)).toEqual(avatarLook(0))
    expect(avatarLook(AVATAR_COUNT)).not.toEqual(avatarLook(AVATAR_COUNT - 1))
  })

  it('[FE-W19-S08] 非整數回到預設', () => {
    expect(avatarLook(1.5)).toEqual(avatarLook(0))
    // ⚠️ **`1.5` 不可以被截成 `1`。** 那跟取模是同一種錯 ——
    // 一個壞掉的值被解釋成一個合法選擇。
    expect(avatarLook(1.5), '`1.5` 被截成了 `1`').not.toEqual(avatarLook(1))
  })

  it('[FE-W19-S09] 缺值與非數字回到預設', () => {
    for (const bad of [null, undefined, NaN, '1', true, {}, []]) {
      expect(avatarLook(bad), `${String(bad)} 沒有回到預設`).toEqual(avatarLook(0))
    }
  })

  // ── `S11`：顏色沒有離開 design token ─────────────────────────
  //
  // `src/world` 底下的元件已經被 `tests/world-color-scan.test.ts` 掃過
  //（`ChibiPlayer.tsx` 在它的 `MUST_INCLUDE` 名單裡）。
  // **`src/design/avatar.ts` 不在那個範圍內** —— 它是新的，而它正是最容易
  // 被塞進字面色碼的地方。
  it('[FE-W19-S11] 映射本身沒有字面色碼', () => {
    const source = readFileSync(join(ROOT, 'src', 'design', 'avatar.ts'), 'utf8')
    const found = colorLiterals(source)
    expect(
      found,
      `src/design/avatar.ts 寫死了顏色。值要放在 src/design/world.ts，這裡只能 worldColor('…')：\n${found.join('、')}`,
    ).toEqual([])
  })

  it('[FE-W19-S11] 每一款外觀的四個部位都有顏色', () => {
    // ⚠️ three.js 拿到 `undefined` **不會報錯，會靜默畫成白色** ——
    // 實測：`new MeshStandardMaterial({ color: undefined }).color` 是 `#ffffff`，
    // console 只有一行警告。所以「有沒有值」只能在這裡問。
    for (let av = 0; av < AVATAR_COUNT; av++) {
      const look = avatarLook(av)
      for (const [part, value] of Object.entries(look)) {
        expect(value, `av=${av} 的 ${part} 沒有顏色 —— three.js 會靜默畫成白色`).toMatch(
          /^#[0-9a-f]{6}$/i,
        )
      }
    }
  })
})
