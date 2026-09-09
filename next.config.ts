import type { NextConfig } from 'next'
import { validateDeployConfig } from './src/config/env'

// 規格 FE-O14「部署設定的錯誤 SHALL 在建置時失敗」。
//
// ⚠️ **這一行拿掉之後，測試必須變紅。** 那是這條 Requirement 的驗收條件，
// 不是「測試全綠」（`tests/deploy-build-gate.itest.ts` 的 V2）。
//
// 為什麼要有它：`wsUrl()` 第一次被呼叫是在 `RemoteWorld` 的 `useEffect` 裡，
// 所以設定錯誤是在**訪客的瀏覽器**裡爆炸的。實測過那個組合 ——
// `next build` 綠燈、CI 綠燈、部署成功，線上只剩下「GuildHub」四個字。
// `fe-o09-env` 的那些守衛全部是對的，錯的是**時機**。
//
// ⚠️⚠️ **MUST NOT 在這裡重寫一份檢查，也 MUST NOT 逐一列舉變數。**
// `validateDeployConfig()` 迭代 `DEPLOY_CONFIG_ITEMS` —— 那是唯一一份清單。
// 兩份清單會漂，而漂掉的方向必然是建置時比執行時鬆，
// 於是閘門看起來還在、實際上已經漏了。
//
// ⚠️ **MUST NOT 用 try/catch 把它包起來只 log。** 那樣建置會綠燈，
// 而這整條 Requirement 存在的理由就是「不要產出一個綠燈但壞掉的 bundle」。
//
// 本機不受影響：`appEnv()` 用 `NODE_ENV` 當守門員。實測（design 的 M4）：
//
//     next dev    → NODE_ENV=development   載入 1 次 → 走本機預設值
//     next build  → NODE_ENV=production    載入 2 次
//
// 載入兩次是無害的（只讀不寫），寫在這裡免得有人看到兩次輸出以為是 bug。
validateDeployConfig()

const nextConfig: NextConfig = {
  // ⚠️ **必須是 false。實測後加的，不是預防性設定。**
  //
  // Next.js 16 的 `next dev` 預設會往 repo 根目錄的 `AGENTS.md` 附加一段
  // `<!-- BEGIN:nextjs-agent-rules -->`，並且會建立／改寫 `CLAUDE.md`
  // （見 node_modules/next/dist/server/lib/generate-agent-files.js）。
  //
  // 在這個 repo 那是**執法層文件** —— `AGENTS.md` 自稱是「唯一 normative
  // workflow 規範」，改它依規定要走 `governance/` 分支的獨立 PR。
  // 而 `feat/` 分支沒有路徑限制，所以這段附加**會靜靜跟著實作進 PR**，
  // 沒有任何閘門會擋。實測過：跑一次 `npm run dev` 就發生了。
  //
  // Next 自己的說明還寫著「從 diff 移除只會再生，跟你的工作一起 commit
  // 就好」—— 對一般專案合理，對這個 repo 是繞過治理。
  agentRules: false,

  // ⚠️ **`127.0.0.1` 與 `localhost` 在 Next 16 的 dev server 不是同一件事。**
  //
  // 實測（2026-09-09，dev server 的 log）：
  //
  //     ⚠ Blocked cross-origin request to Next.js dev resource /_next/hmr
  //       from "127.0.0.1".
  //
  // Next 16 預設只信任 `localhost`，其他 host 一律擋掉 dev 資源。
  // 被擋掉的是 **HMR 的 WebSocket**，而 Turbopack 的瀏覽器端 runtime
  // 沒有它就**不會 hydrate** —— 症狀是：
  //
  //   `localhost:3100/world`  → 正常，canvas 起得來
  //   `127.0.0.1:3100/world`  → HTTP 200、HTML 完整、**畫面永遠空白**，
  //                             而且 console 只有一行 WebSocket 握手失敗，
  //                             看起來完全不像「頁面壞了」
  //
  // **沒有任何錯誤畫面**：伺服器端渲染的 `<h1>` 留在畫面上，React 從頭到尾
  // 沒有接手，所以錯誤邊界也不會被觸發。這個組合非常難查 ——
  // 兩個網址指向同一個 server，一個能用一個不能。
  //
  // 這個設定只影響 `next dev`。
  allowedDevOrigins: ['127.0.0.1'],

  // 規格 FE-X01-S01：`/` 導向 `/world`。
  //
  // **`permanent: false` 是 307，不是 308，而且這件事要能被讀出來。**
  // W2 之後 `/` 會變成登入入口（FE-A01）。永久轉址會被瀏覽器快取，
  // 而使用者清不掉 —— 屆時他們會一直被送回 `/world`，而且沒有人查得出原因。
  //
  // 寫在這裡而不是在 page 裡呼叫 `redirect()`：這樣測試可以在不起 server 的
  // 情況下斷言 `permanent` 的值。**但那只證明到設定層** ——
  // 「HTTP 回應真的是 307」由 design.md〈驗證方式〉的 V1 用 curl 補上。
  async redirects() {
    return [{ source: '/', destination: '/world', permanent: false }]
  },
}

export default nextConfig
