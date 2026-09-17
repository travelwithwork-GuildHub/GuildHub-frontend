// 切換演練的報告：從 vitest 的 JSON 產一份不可變的 markdown。規格 `FE-O08`〈每次演練產一份不可變的報告〉。
//
// 誰叫它：`scripts/contract-guildhub.mjs --suite rehearsal` 跑完 vitest 之後（**不論結束碼**）。
// 有失敗的那一次正是最需要報告的那一次 —— 所以 JSON 完整就寫，結束碼沿用 vitest 的。
// 不寫的只有四種：被訊號終止、JSON 缺席、不是 vitest 的 JSON、SHA 拿不到 —— 半份報告不如沒有。
//
// 檔名 `<YYYYMMDD>T<HHMMSS>Z-<後端 7>-<前端 7>-<隨機 6>.md`：時間＋隨機讓每一次執行都有自己的檔；
// 「已存在就不覆寫」是最後一道保險（時鐘倒退、random 撞了），不是預期路徑。
// 前端工作樹不乾淨 → 落 `.local/rehearsal/`（gitignore）：證據目錄裡永遠只有乾淨工作樹產的報告。
//
// 每一條 `key` 從 vitest 葉節點的 `meta.key` 來（演練測試從期望表抄進 `task.meta`）；
// 〈送回後端〉列 `meta.report === true` 的。訊息以 `blocked:` 開頭的算 `blocked`，不算 `failed`。

import { randomBytes } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
/** 進版控的證據目錄。 */
export const REPORT_DIR = path.join(ROOT, 'docs', 'evidence', 'fe-o08')
/** 工作樹不乾淨時的落點（`.gitignore` 有 `/.local/rehearsal/`）。 */
export const DIRTY_DIR = path.join(ROOT, '.local', 'rehearsal')

/** vitest 的 `failureMessages` 放的是 `e.stack`：`Error: blocked: x\n    at …`。去掉錯誤類別名，只留第一行。 */
function firstLine(messages) {
  const raw = (Array.isArray(messages) ? messages[0] : '') ?? ''
  return String(raw).split('\n')[0].replace(/^[A-Za-z]*Error: /, '')
}

/** 把 JSON 的葉節點攤平成 `{ key, status, message, report }`；`status` 是 `passed`／`failed`／`blocked`（其餘照 vitest 的原字）。 */
function leaves(json) {
  const out = []
  for (const file of json.testResults) {
    for (const t of file.assertionResults) {
      const meta = t.meta && typeof t.meta === 'object' ? t.meta : {}
      const message = t.status === 'failed' ? firstLine(t.failureMessages) : ''
      const status = t.status === 'failed' && /^blocked: /.test(message) ? 'blocked' : t.status
      out.push({ key: typeof meta.key === 'string' && meta.key ? meta.key : t.title, status, message, report: meta.report === true })
    }
  }
  return out
}

/** 是不是 vitest `--reporter=json` 寫出來的形狀。只看報告會讀的欄位。 */
export function isVitestJson(json) {
  if (!json || typeof json !== 'object' || !Array.isArray(json.testResults) || typeof json.numTotalTests !== 'number') return false
  return json.testResults.every(
    (f) => f && Array.isArray(f.assertionResults) && f.assertionResults.every((t) => t && typeof t.title === 'string' && typeof t.status === 'string'),
  )
}

function cell(s) {
  return String(s).replace(/\|/g, '\\|')
}

/** 純函式：JSON ＋ 兩個 SHA ＋ 時間 ＋ dirty → markdown。 */
export function renderReport({ json, shas, now, dirty }) {
  const rows = leaves(json)
  const count = (s) => rows.filter((r) => r.status === s).length
  const lines = []
  if (dirty) lines.push('> ⚠️ **dirty**：前端工作樹不乾淨時產的 —— 不是證據，不進 `docs/evidence/`。')
  lines.push(
    `# 切換演練報告 ${now.toISOString()}`,
    '',
    `- 後端 SHA：\`${shas.backend}\``,
    `- 前端 SHA：\`${shas.frontend}\`${dirty ? '（dirty）' : ''}`,
    `- 結果：passed ${count('passed')} ／ failed ${count('failed')} ／ blocked ${count('blocked')} ／ 共 ${rows.length}`,
    '',
    '## 每一條',
    '',
    '| key | 結果 | 訊息 |',
    '|---|---|---|',
    ...rows.map((r) => `| \`${cell(r.key)}\` | ${r.status} | ${cell(r.message)} |`),
    '',
    '## 送回後端',
    '',
  )
  const report = rows.filter((r) => r.report)
  lines.push(...(report.length ? report.map((r) => `- \`${r.key}\`（${r.status}）`) : ['（這一次沒有 `report: true` 的項目）']), '')
  return lines.join('\n')
}

function stamp(now) {
  return now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
}

/**
 * wrapper 跑完 vitest 之後叫。回 `{ code, path, message }`：`code` 是要拿去 `process.exit` 的。
 * fs 只碰 `jsonPath`（讀）與 `outDir`／`dirtyDir`（寫一個新檔）。
 */
export async function finishRehearsal({ jsonPath, exitCode, signal, shas, dirty, outDir = REPORT_DIR, dirtyDir = DIRTY_DIR, now = new Date(), random = () => randomBytes(3).toString('hex') }) {
  const refuse = (message) => ({ code: 1, path: null, message })
  if (signal) return refuse(`vitest 被 ${signal} 終止 —— 半份結果不產報告。`)
  let json
  try {
    json = JSON.parse(await readFile(jsonPath, 'utf8'))
  } catch (e) {
    return refuse(`讀不到 vitest 的 JSON（${jsonPath}）：${e instanceof Error ? e.message : e} —— 不產報告。`)
  }
  if (!isVitestJson(json)) return refuse(`${jsonPath} 不是 vitest --reporter=json 的形狀 —— 不產報告。`)
  if (!shas?.backend || !shas?.frontend) return refuse(`SHA 拿不到（後端 '${shas?.backend ?? ''}'、前端 '${shas?.frontend ?? ''}'）—— 不產報告。`)
  const rand = String(random())
  if (!/^[0-9a-f]{6}$/.test(rand)) return refuse(`random 要回 6 位十六進位，拿到 '${rand}'。`)
  const dir = dirty ? dirtyDir : outDir
  const target = path.join(dir, `${stamp(now)}-${shas.backend.slice(0, 7)}-${shas.frontend.slice(0, 7)}-${rand}.md`)
  await mkdir(dir, { recursive: true })
  try {
    // `wx`：已存在就 EEXIST，不覆寫 —— 檢查與寫入是同一個系統呼叫，沒有先 stat 再寫的空隙。
    await writeFile(target, renderReport({ json, shas, now, dirty }), { flag: 'wx' })
  } catch (e) {
    if (e && e.code === 'EEXIST') return refuse(`報告 ${target} 已存在 —— 不覆寫（同一秒、同一個隨機後綴？）。`)
    throw e
  }
  return { code: exitCode ?? 1, path: target, message: `${dirty ? '（dirty）' : ''}報告：${target}` }
}
