// ─────────────────── harness：claude（Claude Code） ───────────────────
// 🔴 Fergus 2026-09-14 硬約束：`claude` 只准出現在 coordinator（validateProfiles 擋 reviewers／blockReviewers／adjudicator）。
//   所以這裡沒有 review、沒有 write：它是統整者本人，不是被派工的那一方。
//   唯一會被查的是 binary（setup --check：`claude --version`，env CLAUDE_BIN 可覆寫）與 usage.mjs 的可量性
//   （只有 Claude Code 有 transcript ⇒ transcriptMeasurable:true）。

import { probeBinary } from './_contract.mjs'

export function resolveClaudeBin(env = process.env) {
  return env.CLAUDE_BIN || 'claude'
}

/** @type {import('./_contract.mjs').Harness} */
export const harness = {
  name: 'claude',
  quotaBuckets: ['anthropic'],
  canCoordinate: true,
  canReview: false,
  canWrite: false,
  transcriptMeasurable: true,
  resolveBin: (env = process.env) => resolveClaudeBin(env),
  checkBinary: (env = process.env, deps = {}) =>
    probeBinary(deps.claudeBin !== undefined ? deps.claudeBin : resolveClaudeBin(env), env, deps),
}

export default harness
