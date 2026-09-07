// FIXTURE — 這是允許的路徑。ESLint 必須放行（規格 FE-X01-S09）。
// 路徑刻意做成 .../src/api/...，好讓 eslint.config.mjs 的
// `**/src/api/**` override 一視同仁地套用到它 —— 測試與正式碼走同一條規則。
export async function getProfile(id: string) {
  const res = await fetch(`/api/profiles/${id}`)
  return res.json()
}
