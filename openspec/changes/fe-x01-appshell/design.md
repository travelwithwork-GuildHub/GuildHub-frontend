## Context

動機見 `proposal.md`〈Why〉，需求見 `specs/app-shell/spec.md`，這裡不重述。

三個形塑本設計的既有條件：

1. **這是第一個 change。** `openspec/specs/` 是空的，`src/` 不存在，
   `package.json` 的四個 script 是刻意會失敗的佔位。沒有既有慣例要遵守，
   本次選的東西會變成之後所有人的預設值。
2. **`.github/` 不能在本次動。** `AGENTS.md`〈Git / CI〉禁止，而
   `ci.yml` 的註記要求四個品質關卡由**緊接其後的 `governance/` PR** 放回去
   （`FE-O10`）。所以本次要交出「可以被那個 PR 直接接上」的四個指令。
3. **一個 PR 的 diff 上限是 400 行**（不含 lockfile 與生成物）。
   本 change 的實作必然要拆成多個 `feat/` slice。

## Goals / Non-Goals

**Goals:**

- 讓後續每一個工作項目都建立在同一組邊界上：路由、client 邊界、
  Provider 組合點、token 來源、資料存取路徑
- 讓 `FE-O10` 接上去之後，四個品質關卡**當天就有東西可擋**
- 讓「元件裡不准出現 `fetch`」從文字變成一條會失敗的檢查

**Non-Goals（設計層面的邊界，不重述 proposal 的範圍）:**

- 不設計 3D 的任何東西，包含 render loop、資源生命週期與相機
- 不設計錯誤語彙（`FE-X03` 的「唯一一份」），本次只在 client 邊界放一個
  最小的錯誤呈現
- 不設計 query key 規範與 store 切分（`FE-X02`）

## Decisions

### D1：Next.js 16 App Router，不是 Vite SPA

同時記在 `docs/adr/0002-frontend-framework-and-render-boundary.md`
（change 會被 archive，ADR 不會）。

理由：`CONTEXT.md` 明訂前端要**自己有一份後端**（Route Handlers ＋
可拋棄資料庫，`FE-O03`），這需要一個同時提供前端與伺服器端路由的框架。
Vite SPA 要另外起一個 server，等於多維護一份部署單元。

代價：Server / Client Component 的邊界變成每個人都要理解的東西，
而且 async Server Component 目前**無法被 Vitest 單元測試**（見 R2）。

替代方案：Vite + React Router（拒絕，理由如上）；
Remix / React Router 7 framework mode（拒絕，本 repo 的合約與工具鏈
以及後端整合指南都假設一般的 Node 部署，換框架沒有換來對應的好處）。

### D2：根路徑轉址寫在 `next.config.ts` 的 `redirects()`，不在頁面裡呼叫 `redirect()`

```
{ source: '/', destination: '/world', permanent: false }   // → 307
```

三個理由：

1. **307 由 `permanent: false` 明確表達**，不必依賴「某個函式預設是幾」的
   記憶。`permanentRedirect()` 才是 308，兩者是不同的函式，不會誤用
2. **可以在不起 server 的情況下被斷言**：測試直接 import 設定、呼叫
   `redirects()`、檢查那一筆的 `permanent` 是 `false`。這正好繞開 R2 那個限制
3. 為了一個轉址而渲染一棵 React 樹是浪費

替代方案：在 `app/page.tsx` 裡呼叫 `redirect('/world')`（拒絕：要證明它是 307
就必須起一個真的 server，而本 change 明確不導入 E2E 工具）。

### D3：World 的 client 邊界用「Client Component 包一層 `next/dynamic`（`ssr: false`）」

`ssr: false` 的 `next/dynamic` **不能寫在 Server Component 裡**，所以邊界是
一個標了 `'use client'` 的薄殼元件，它動態載入真正的 World 內容。

本次那個「真正的內容」是一個佔位元件。**`FE-W01` 要做的事就是把它換成 Canvas，
不需要動這層殼。** 這是刻意留的縫。

### D4：client 邊界的錯誤呈現用 `next/error` 的 `catchError`，不是 `error.tsx`

`catchError` 的 fallback 直接拿得到 `{ error, retry }`，`retry()` 就是
規格 S04 要的「提供一個重試操作」。`error.tsx` 是整個路由段的錯誤邊界，
會把整頁換掉 —— 而 S04 明確要求「頁面的其餘部分仍然可用」。

### D5：色票／字級／間距走 Tailwind v4 的 `@theme`；堆疊層級走 TypeScript 常數

Tailwind v4 是 CSS-first：token 寫在 `@theme { --color-*: ...; }`，
不需要 `tailwind.config.js`。

**但堆疊層級不放進 `@theme`。** 規格 S07 要求「取用未定義的層名時該次取用失敗」，
而 CSS 自訂屬性取不到就是空字串，靜默退化 —— 那正是這條需求要防的東西。
所以堆疊層級是一份 TypeScript 常數表，取用走一個型別受限的存取函式，
層名打錯在 `typecheck` 就會紅。

**沒有任何值被定義兩次**：色票／字級／間距只在 `@theme`，
堆疊層級只在 TypeScript。兩者都放在同一個目錄底下，
「單一來源」是**每一種 token 只有一個定義處**，不是「全部擠在一個檔案」。

代價：z-index 不能用 Tailwind 的 `z-*` utility，要透過存取函式套用。
這是刻意的 —— utility class 打錯字不會有人告訴你。

### D6：測試 runner 用 Vitest ＋ Testing Library

Next.js 官方文件對 App Router 給的就是這一組
（`vitest` / `@vitejs/plugin-react` / `jsdom` / `@testing-library/react` /
`vite-tsconfig-paths`）。

`npm test` 不加 `--passWithNoTests`：規格 S12 要求零測試時以非零結束。

### D7：`fetch` 的限制用 ESLint 規則，例外路徑用設定檔的 override

規則本體禁止取用全域 `fetch`，`src/api/**` 與 `src/app/api/**` 兩個路徑
在設定裡明確放行。

依 `AGENTS.md`〈新增流程閘門的門檻〉，這條的證據是**可重現的繞法**：
在沒有這條規則的狀態下，一個含 `fetch()` 的元件推 PR 會全綠。
該節第 328–332 行明文「事故包含可重現的繞法⋯⋯跑得出來就算證據」。

### D8：實作切成三刀

```
feat/fe-x01-appshell--scaffold   專案骨架、四個 script、Node 釘版、lint 規則與它的測試
governance/ci-quality-steps      FE-O10（不屬於本 change，但排在這裡）
feat/fe-x01-appshell--layout     轉址、/world、client 邊界與錯誤呈現、Provider 組合點、token
```

`FE-O10` 夾在中間是因為 `ci.yml` 的註記要求「緊接在 scaffold PR 之後，
不要留下一個沒有工程品質閘門的窗口」。第二刀合併時，四個關卡已經在擋了。

## Risks / Trade-offs

**R1｜`FE-O10` 在 `progress.sh` 上永遠顯示「未開始」** →
`progress.sh` 第 1012 行的分支比對是
`^(spec|feat|fix|archive)/([a-z0-9-]+?)(?:--.*)?$`，**`governance` 不在裡面**。
而 `FE-O10` 唯一合法的通道就是 `governance/`。
緩解：本次不修（那是另一個 governance change，且擴大範圍）。
**記在這裡，讓看報表的人知道那一格的「未開始」不是真的。**

**R2｜async Server Component 無法被 Vitest 測試** → 規格 S01／S02／S03
不能靠 component test 完整證明。緩解：S01 改成斷言 `next.config` 的轉址設定
（見 D2），S03 讓頁面元件保持同步以便直接 render，S02 直接 render
not-found 元件。**剩下的差距由人工開一次瀏覽器補上並留證據** ——
自動化的瀏覽器驗證是 `FE-O11` 的裁決範圍，本次不先做。

**R3｜`@theme` 與 TypeScript 兩種 token 機制會讓人不知道該用哪個** →
緩解：D5 的分界是「需不需要在打錯時失敗」。寫進 `CONTEXT.md` 的詞彙
（那是 `governance/` 的事，不在本 change）。

**R4｜第一刀的 diff 逼近 400 行** → scaffold 產生的設定檔數量不小。
緩解：真的超過就再拆一刀（把 lint 規則與它的測試獨立出來）。
`package-lock.json` 不計入上限。

**R5｜本次選的框架版本會變成所有人的預設** → 緩解：主要相依套件釘明確版本，
理由寫進 ADR-0002，之後要換有一份可以對照的紀錄。

## Migration Plan

不適用 —— 沒有既有系統要遷移，這是第一個 change。

回滾：本次全部是新增檔案，回滾等於還原這幾個 PR。
唯一有順序相依的是 `FE-O10`：它加進 `ci.yml` 的四個關卡在第一刀之前會紅，
所以那個 PR 不能排在 scaffold 之前。

## Open Questions

這些現在不答也不會改變規格、做法或任務拆解：

- **色票的實際數值。** `FE-W09`（WorldDesignSystem，W3）要定「3D 色票、材質、
  比例」的統一規範。本次先放一組可運作的中性值，等那一項定案後由它收斂。
  這不影響任何 Requirement —— 規格只約束 token **有唯一來源**，不約束值是什麼。
- **堆疊層級的實際整數。** 規格只要求 5 個具名層且嚴格遞增；
  用 0/10/20/30/40 還是 100/200/… 從外部觀察不出差別。
- **字級與間距的刻度密度。** 同上，第一個真正的 DOM 面板（`FE-X04`／`FE-B02`）
  出現時才知道需要幾階。
