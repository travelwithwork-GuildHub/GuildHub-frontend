import type { NextConfig } from 'next'

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
}

export default nextConfig
