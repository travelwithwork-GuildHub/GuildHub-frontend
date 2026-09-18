import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { AVATAR_COUNT, avatarLook } from '@/design/avatar'
import { colorLiterals } from '@/design/colorScan'
import { worldColor } from '@/design/world'

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

  // ── 八款（change `fe-a05-avatar-variety`）────────────────────────
  it('[FE-A05-S14] 八款各是一款：兩兩在主要部位不同、av=7 有效、av=8 回預設', () => {
    expect(AVATAR_COUNT).toBe(8)
    const looks = Array.from({ length: 8 }, (_, i) => avatarLook(i))
    for (let a = 0; a < 8; a += 1)
      for (let b = a + 1; b < 8; b += 1) {
        const x = looks[a]!
        const y = looks[b]!
        const major = x.skin !== y.skin || x.body !== y.body || x.limb !== y.limb
        expect(major, `av=${a} 與 av=${b} 在皮膚／軀幹／四肢上完全相同（只有眼睛不算）`).toBe(true)
      }
    expect(avatarLook(7), 'av=7 是合法選擇，不該等於預設').not.toEqual(avatarLook(0))
    expect(avatarLook(8), 'av=8 在上界外，回預設').toEqual(avatarLook(0))
    for (let i = 1; i < 8; i += 1) expect(avatarLook(8), `av=8 繞回了 av=${i}`).not.toEqual(avatarLook(i))
  })

  it('[FE-A05-S15] 擴充前的兩款顏色不變（跟擴充前的色碼快照逐一相同）', () => {
    // ⚠️ 期望值是**擴充前（2026-09-19，`893aa8c` 之前）的色碼快照**，刻意不從 `worldColor()` 讀 ——
    // 讀同一個來源的話，改掉 token 的值兩邊一起變、這條永遠綠（一輪審查抓到）。這裡是測試檔，色碼掃描只掃 src/。
    const before = {
      0: { skin: '#f2c9a0', body: '#4d5bb0', limb: '#3b4794', ink: '#20232e' },
      1: { skin: '#f2c9a0', body: '#4d9b5b', limb: '#2f7a45', ink: '#20232e' },
    }
    expect(avatarLook(0)).toEqual(before[0])
    expect(avatarLook(1)).toEqual(before[1])
    // 而且它們仍然是從 token 來的（不是有人在映射裡寫死了同樣的字面值）
    expect(worldColor('avatarBody')).toBe(before[0].body)
    expect(worldColor('avatarBodyAlt')).toBe(before[1].body)
  })

  it('[FE-W19-S08] 非整數回到預設', () => {
    expect(avatarLook(1.5)).toEqual(avatarLook(0))
    // ⚠️ **`1.5` 不可以被截成 `1`。** 那跟取模是同一種錯 ——
    // 一個壞掉的值被解釋成一個合法選擇。
    expect(avatarLook(1.5), '`1.5` 被截成了 `1`').not.toEqual(avatarLook(1))
  })

  it('[FE-W19-S09] 缺值與非數字回到預設', () => {
    for (const bad of [null, undefined, NaN, true, {}, []]) {
      expect(avatarLook(bad), `${String(bad)} 沒有回到預設`).toEqual(avatarLook(0))
    }
  })

  // ⚠️⚠️ **這一條單獨拉出來，是突變測試逼出來的。**
  //
  // 把 `Number.isInteger` 與範圍檢查**兩層整個拿掉**之後，
  // 這個檔案裡只有這一條會紅（9 條裡的 1 條）。原因是
  // `LOOKS[index] ?? DEFAULT_LOOK` 自己就擋下了負數、`999` 與 `1.5`
  // —— 它們當索引都是 `undefined`。
  //
  // **`'1'` 是唯一漏得過去的形狀**：陣列索引會把字串 `'1'` 當成 `1`，
  // 於是它拿到第二款外觀。埋在上面那個迴圈裡的話，紅燈只會說
  // 「有個值沒回到預設」，不會說是這個形狀 —— 而這個形狀正是
  // 顯式值域檢查唯一還在守的東西。
  it('[FE-W19-S09] 字串形式的數字 SHALL NOT 被當成合法的 `av`', () => {
    expect(
      avatarLook('1'),
      "字串 `'1'` 拿到了第二款外觀 —— 陣列索引會把它轉成數字，所以顯式的 `Number.isInteger` 檢查不能省",
    ).toEqual(avatarLook(0))
    expect(avatarLook('1')).not.toEqual(avatarLook(1))
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
