// 技能欄的正規化。規格 `FE-A04`〈編輯四欄，payload 白名單，悲觀更新〉；design `D3`。
//
// 一個 input 打一串：以 `,` 或 `，` 分割、每項 trim、去空、去重（**不分大小寫且 NFC**，第一個保留原文）。
// 純函式 —— 驗證每次輸入都拿它算（便宜），**替換 input 裡的字串**只在 blur／送出（打字中不動游標、不弄壞 IME 組字）。
//
// skill 不能含逗號：逗號就是分隔符，這是明寫的規則，不是限制。

/** 去重用的鍵：NFC ＋ 小寫。「有沒有改」（dirty）也用它比 —— `TypeScript` 改成 `typescript` 不算修改（`S09`）。 */
export function skillKey(skill: string): string {
  return skill.normalize('NFC').toLowerCase()
}

export function normalizeSkills(raw: string): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const piece of raw.replace(/，/g, ',').split(',')) {
    const skill = piece.trim()
    if (skill === '') continue
    const key = skillKey(skill)
    if (seen.has(key)) continue
    seen.add(key)
    out.push(skill)
  }
  return out
}

/** 正規化後再接回 input 要顯示的字串（blur／送出時、以及預填）。 */
export function joinSkills(skills: readonly string[]): string {
  return skills.join(', ')
}
