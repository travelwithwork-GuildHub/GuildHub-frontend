// 這個頁面在 FE-X01 的第二刀會被 next.config 的轉址取代
// （`/` → 307 → `/world`，見規格 FE-X01-S01）。
// 這一刀只需要它存在，讓 `npm run build` 有東西可以建。
export default function Home() {
  return <main>GuildHub</main>
}
