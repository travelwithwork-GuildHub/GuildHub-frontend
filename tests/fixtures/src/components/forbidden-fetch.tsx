// FIXTURE — 故意違規。ESLint 必須對這個檔案報錯（規格 FE-X01-S08）。
// 它不在 src/ 底下，也被 eslint.config.mjs 的 ignores 排除，
// 所以不會讓專案的 lint 變紅；測試用 ESLint 的 Node API 帶 ignore:false 直接打它。
export async function loadProfile(id: string) {
  const res = await fetch(`/api/profiles/${id}`)
  return res.json()
}
