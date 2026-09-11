import path from 'node:path'
import { ESLint } from 'eslint'
import { describe, expect, it } from 'vitest'

// 規格：openspec/changes/fe-t06-output-safety/specs/output-safety/spec.md
//   Requirement: 危險面在 lint 就被擋下（語法閘門，正面列舉）—— S01、S02、S03
//
// 用 `lintText` 帶虛擬路徑走 repo 的實際設定（跟 `limit-lint-rule.test.ts` 同一套）。正向與負向 fixture 都在這裡。**不連任何外部服務。**

const ROOT = path.resolve(import.meta.dirname, '..')
const eslint = new ESLint({ cwd: ROOT })
async function t06(filePath: string, jsx: string) {
  const code = `import { createElement } from 'react'\nimport Link from 'next/link'\ndeclare const s: string\ndeclare const profile: { url: string }\ndeclare const id: string\ndeclare const logo: string\ndeclare const safe: string\nfunction safeHref(x: string) { return x }\nexport function X() { return ${jsx} }\nvoid createElement; void Link; void safeHref\n`
  const [result] = await eslint.lintText(code, { filePath })
  if (!result) throw new Error(`ESLint 沒有回傳 ${filePath} 的結果`)
  return result.messages.filter((m) => m.ruleId === 'no-restricted-syntax' && /FE-T06/.test(m.message))
}
const FILE = 'src/x.tsx'

/**
 * 關掉會在裸 `href` 上炸掉的那條第三方規則（`@next/next/no-html-link-for-pages` 讀 null 的 value），其餘照 repo 的設定：
 * 這樣才驗得到我們的 `[value=null]` selector 真的在（審查抓到原本的寫法是恆真）。
 */
async function withoutNextAnchorRule(jsx: string) {
  const eslintNoCrash = new ESLint({ cwd: ROOT, overrideConfig: [{ rules: { '@next/next/no-html-link-for-pages': 'off' } }] })
  const code = `declare const safe: string\nexport function X() { return ${jsx} }\nvoid safe\n`
  const [result] = await eslintNoCrash.lintText(code, { filePath: FILE })
  return result?.messages.filter((m) => m.ruleId === 'no-restricted-syntax' && /FE-T06/.test(m.message)) ?? []
}

describe('危險面在 lint 就被擋下', () => {
  it('[FE-T06-S01] dangerouslySetInnerHTML 三種形狀都被擋；data-html 不算', async () => {
    for (const bad of [
      '<div dangerouslySetInnerHTML={{ __html: s }} />',
      '<div {...{ dangerouslySetInnerHTML: { __html: s } }} />',
      "createElement('div', { dangerouslySetInnerHTML: { __html: s } })",
    ]) {
      expect((await t06(FILE, bad)).length, `${bad} 沒被擋`).toBeGreaterThan(0)
    }
    expect(await t06(FILE, '<div data-html={s} />')).toEqual([])
  }, 60_000)

  it('[FE-T06-S02] 嵌入標籤被擋；div、video 不算', async () => {
    for (const bad of ['<iframe src="https://example.com" />', '<script />', '<embed />', '<object />']) {
      expect((await t06(FILE, bad)).length, `${bad} 沒被擋`).toBeGreaterThan(0)
    }
    expect(await t06(FILE, '<div />')).toEqual([])
    expect(await t06(FILE, '<video src="/x.mp4" />')).toEqual([])
  }, 60_000)

  it('[FE-T06-S03] 原生 a 的動態 href 被擋（含 safeHref 直接放進去、非字串字面、裸 href）；字面、無 ${} 樣板、Link、img src 不擋', async () => {
    for (const bad of [
      '<a href={profile.url} />',
      '<a href={`${profile.url}`} />',
      '<a href={`/profiles/${id}`} />',
      '<a href={safeHref(profile.url)} />',
      '<a href={123} />',
      '<a href={null} />',
    ]) {
      expect((await t06(FILE, bad)).length, `${bad} 沒被擋`).toBeGreaterThan(0)
    }
    // 裸的 `<a href />`：Next 自己的 `@next/next/no-html-link-for-pages` 在這個形狀上會炸（讀 null 的 value），整份設定下 lint 會整個失敗
    //（一樣進不了 CI）。這裡把那條關掉再 lint：證明的是我們的 `[value=null]` selector 真的在（審查抓到原本的寫法是恆真）。
    expect((await withoutNextAnchorRule('<a href />')).length, '裸的 <a href /> 沒被擋').toBeGreaterThan(0)
    expect(await withoutNextAnchorRule('<a href="/world" />')).toEqual([])
    for (const good of ['<a href="/world" />', "<a href={'/world'} />", '<a href={`/world`} />', '<Link href={`/profiles/${id}`} />', '<img src={logo} alt="" />']) {
      expect(await t06(FILE, good), `${good} 被誤擋`).toEqual([])
    }
  }, 90_000)

  it('[FE-T06-S03] SafeExternalLink.tsx 是第 3 條的唯一例外；前兩條在那裡仍然生效', async () => {
    const here = 'src/security/SafeExternalLink.tsx'
    expect(await t06(here, '<a href={safe} />')).toEqual([])
    expect((await t06(here, '<div dangerouslySetInnerHTML={{ __html: s }} />')).length).toBeGreaterThan(0)
    expect((await t06(here, '<iframe />')).length).toBeGreaterThan(0)
    // 別的路徑（連同一個資料夾的別檔）都不是例外。
    expect((await t06('src/security/other.tsx', '<a href={safe} />')).length).toBeGreaterThan(0)
  }, 60_000)
})
