import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, screen, waitFor, within } from '@testing-library/react'
import { FORM_LIMITS } from '@/forms/limits'
import { startContractServer, type ContractServer } from './support/contract-server'
import { ME, button, click, escape, field, gate, gets, list, mountBoard, panel, posts, project, queryButton, shownPage, submit, type } from './support/project-board'

// 規格：openspec/changes/fe-j01-create-project/specs/project-posting/spec.md
//   Requirement: 發案的入口只給已登入的人，而且只有後端有的欄位 —— S01、S02
//   Requirement: 上限由前端守，數字有出處，時機照全站規則 —— S03（數字換掉會跟著變的那一半在 `create-project-limits.test.tsx`）、S04
//   Requirement: 送出的是白名單 payload，成功後列表回第 0 頁重取 —— S05、S06、S11
//   Requirement: 未送出就關要確認；送出中不可關 —— S07
//
// 樹在 `tests/support/project-board.tsx`：全部是正式碼，資料走真的 `src/api/` 到本機自起的 `contract-server`。
//
// 規格寫的 `identity.state === 'resolving'` 在型別上叫 `'unknown'`（`src/identity/types.ts`：「還沒問完」）—— 這裡讓 `GET /api/me` 一直不回。

let server: ContractServer
beforeEach(async () => {
  server = await startContractServer()
  process.env.NEXT_PUBLIC_GUILDHUB_REST = server.base
  process.env.NEXT_PUBLIC_DATA_ADAPTER = 'guildhub'
})
afterEach(async () => {
  cleanup()
  vi.restoreAllMocks()
  await server.close()
  delete process.env.NEXT_PUBLIC_GUILDHUB_REST
  delete process.env.NEXT_PUBLIC_DATA_ADAPTER
  window.history.replaceState(null, '', '/')
})

const form = () => within(panel()).getByTestId('create-project-form')
const queryForm = () => within(panel()).queryByTestId('create-project-form')
const confirm = () => within(panel()).queryByRole('alertdialog')
const errorOf = (label: string) => {
  const el = field(label)
  expect(el.getAttribute('aria-invalid'), `${label} 沒有標成無效`).toBe('true')
  const id = el.getAttribute('aria-describedby')
  expect(id, `${label} 沒有指到錯誤訊息`).toBeTruthy()
  return document.getElementById(id as string)?.textContent ?? ''
}
const noErrorOn = (label: string) => expect(field(label).getAttribute('aria-invalid'), `${label} 不該有錯`).not.toBe('true')

/** 開表單（已登入）。 */
async function openForm(page = 0, items = [project(1, '舊案子')]) {
  mountBoard(server, { identity: 'signed-in', page, items })
  click(await within(panel()).findByRole('button', { name: '發案' }))
  return form()
}
const VALID = { 標題: '找一個會 Three.js 的人', 內容: '做一個小房間。', 需要的技能: 'three.js', 座位數: '3' } as const
async function fill(values: Partial<Record<keyof typeof VALID, string>> = {}) {
  for (const [label, value] of Object.entries({ ...VALID, ...values })) await type(field(label), value)
}

describe('發案的入口只給已登入的人，而且只有後端有的欄位', () => {
  it('[FE-J01-S01] 已登入的專案看板有「發案」，而且在列表上方；人才看板沒有', async () => {
    mountBoard(server, { identity: 'signed-in' })
    const create = await within(panel()).findByRole('button', { name: '發案' })
    await waitFor(() => expect(within(list()).getByText('舊案子')).toBeDefined())
    expect(create.compareDocumentPosition(list()) & Node.DOCUMENT_POSITION_FOLLOWING, '「發案」不在列表上方').toBeTruthy()
    cleanup()
    mountBoard(server, { identity: 'signed-in', panel: 'profiles', items: [{ ...ME, id: ME.id }] })
    await waitFor(() => expect(within(panel()).getByText('阿福')).toBeDefined())
    await waitFor(() => expect(screen.getByTestId('list-panel').dataset.kind).toBe('profiles'))
    expect(queryButton('發案'), '人才看板長出「發案」').toBeNull()
  })

  it('[FE-J01-S01] 訪客沒有「發案」（連停用的都沒有）', async () => {
    mountBoard(server, { identity: 'guest' })
    await waitFor(() => expect(server.calls.some((c) => c.pathname === '/api/me')).toBe(true))
    await waitFor(() => expect(within(list()).getByText('舊案子')).toBeDefined())
    expect(queryButton('發案')).toBeNull()
    expect(within(panel()).queryByText('發案')).toBeNull()
  })

  it('[FE-J01-S01] 身分仍在解析時沒有「發案」', async () => {
    const { releaseIdentity } = mountBoard(server, { identity: 'pending' })
    await waitFor(() => expect(within(list()).getByText('舊案子')).toBeDefined())
    expect(queryButton('發案'), '還不知道是誰就給了入口').toBeNull()
    releaseIdentity()
    await within(panel()).findByRole('button', { name: '發案' })
  })

  it('[FE-J01-S02] 表單恰好四個欄位、座位數預設 4、列表 inert、沒有後端沒有的欄位', async () => {
    const f = await openForm()
    const labels = [...f.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>('input, textarea, select')].map((c) => c.labels?.[0]?.textContent ?? '(沒有 label)')
    expect(labels).toEqual(['標題', '內容', '需要的技能', '座位數'])
    expect(field('座位數').value).toBe('4')
    expect(screen.getByTestId('list-panel-list')).toHaveAttribute('inert')
    expect(list(), '列表被卸載了').toBeDefined()
    expect(screen.getByTestId('list-panel-overlay').textContent).not.toMatch(/預算|期程|截止|Open Role/i)
  })
})

describe('上限由前端守，數字有出處，時機照全站規則', () => {
  it('[FE-J01-S03] 五種超上限即時說、送出停用、沒有請求；訊息裡的數字是 FORM_LIMITS 的', async () => {
    await openForm()
    const send = () => button('送出')
    // 標題：單位是 code point —— 60 個「𠮷」（UTF-16 是 120）要放得下，61 個才紅。
    await type(field('標題'), '𠮷'.repeat(FORM_LIMITS.projectTitle.max))
    noErrorOn('標題')
    await type(field('標題'), '𠮷'.repeat(FORM_LIMITS.projectTitle.max + 1))
    expect(errorOf('標題')).toContain(String(FORM_LIMITS.projectTitle.max))
    expect(send().disabled).toBe(true)
    await submit()
    expect(posts(server), '超出上限還送了出去').toHaveLength(0)
    await type(field('標題'), '好')
    noErrorOn('標題')

    await type(field('內容'), '字'.repeat(FORM_LIMITS.projectBody.max + 1))
    expect(errorOf('內容')).toContain(String(FORM_LIMITS.projectBody.max))
    expect(send().disabled).toBe(true)
    await type(field('內容'), '好')

    await type(field('需要的技能'), Array.from({ length: FORM_LIMITS.skillCount.max + 1 }, (_, i) => `s${i}`).join(', '))
    expect(errorOf('需要的技能')).toContain(String(FORM_LIMITS.skillCount.max))
    expect(send().disabled).toBe(true)
    await type(field('需要的技能'), 'a, ' + 'x'.repeat(FORM_LIMITS.skillLength.max + 1))
    expect(errorOf('需要的技能')).toContain(String(FORM_LIMITS.skillLength.max))
    expect(send().disabled).toBe(true)
    await type(field('需要的技能'), 'a')
    noErrorOn('需要的技能')

    for (const bad of ['0', String(FORM_LIMITS.seatCount.max + 1), '2.5']) {
      await type(field('座位數'), bad)
      const message = errorOf('座位數')
      if (bad !== '2.5') expect(message).toContain(String(FORM_LIMITS.seatCount.max))
      expect(send().disabled, `座位數 ${bad} 還能送`).toBe(true)
    }
    await submit()
    expect(posts(server)).toHaveLength(0)
    await type(field('座位數'), String(FORM_LIMITS.seatCount.max))
    noErrorOn('座位數')
    expect(send().disabled).toBe(false)
  })

  it('[FE-J01-S04] 必填空白要按下去才說；焦點到標題；打字後只剩內容的錯', async () => {
    await openForm()
    noErrorOn('標題')
    noErrorOn('內容')
    await submit()
    expect(posts(server)).toHaveLength(0)
    expect(errorOf('標題')).toBeTruthy()
    expect(errorOf('內容')).toBeTruthy()
    expect(document.activeElement, '焦點不在標題欄').toBe(field('標題'))
    await type(field('標題'), '好')
    noErrorOn('標題')
    expect(errorOf('內容')).toBeTruthy()
  })
})

describe('送出的是白名單 payload，成功後列表回第 0 頁重取', () => {
  it('[FE-J01-S05] 成功：payload 恰好四鍵且已 trim／正規化、回第 0 頁重取、第一筆是伺服器版、焦點在列表', async () => {
    await openForm(1, [project(2, '第二頁的案子')])
    expect(shownPage()).toBe(1)
    await fill({ 標題: '  找一個會 Three.js 的人  ', 內容: '做一個小房間。\n', 需要的技能: ' three.js, TypeScript ,three.js ' })
    const created = { ...project(3, '找一個會 Three.js 的人'), seat_count: 3, needed_skills: ['three.js', 'TypeScript'] }
    server.replyFor('/api/projects', 201, created) // POST
    const reload = gate()
    server.replyFor('/api/projects', 200, [project(3, '找一個會 Three.js 的人（伺服器版）'), project(2, '第二頁的案子')], { after: reload.promise })
    await submit()
    await waitFor(() => expect(posts(server)).toHaveLength(1))
    expect(posts(server)[0]?.body).toEqual({ title: '找一個會 Three.js 的人', body: '做一個小房間。', needed_skills: ['three.js', 'TypeScript'], seat_count: 3 })
    expect(Object.keys(posts(server)[0]?.body as object)).toHaveLength(4)
    // GET 還沒回：列表在載入、而且沒有樂觀插入的那一筆
    await waitFor(() => expect(gets(server)).toEqual(['?page=1', '?page=0']))
    expect(list().getAttribute('aria-busy')).toBe('true')
    expect(within(list()).queryByText('找一個會 Three.js 的人'), '先把 POST 的回應插進畫面了').toBeNull()
    reload.release()
    // 列項是整張卡（`FE-B02`）：比標題節點，不比整個 `li`
    await waitFor(() => expect(within(list()).getAllByTestId('project-card-title')[0]?.textContent).toBe('找一個會 Three.js 的人（伺服器版）'))
    expect(queryForm()).toBeNull()
    expect(gets(server), '第 0 頁取了不只一次').toEqual(['?page=1', '?page=0'])
    // 頁碼回報是 passive effect，比第一筆出現在 DOM 晚一拍
    await waitFor(() => expect(shownPage()).toBe(0))
    expect(document.activeElement, '焦點沒回到列表').toBe(list())
  })

  it('[FE-J01-S06] 500：留值（連沒洗過的技能字串都原樣）、一個 alert、列表不動；再送 201 才關閉重取', async () => {
    await openForm()
    // 技能欄故意留空白與大小寫重複：失敗時要**逐字原樣**，不能被送出流程洗成正規化字串（codex 審查抓到的）
    const messy = { ...VALID, 需要的技能: ' three.js, TypeScript ,three.js ', 標題: '  找一個會 Three.js 的人  ' }
    await fill(messy)
    server.replyFor('/api/projects', 500, { detail: '壞了' })
    await submit()
    const alert = await within(form()).findByRole('alert')
    expect(within(form()).getAllByRole('alert')).toHaveLength(1)
    expect(alert.compareDocumentPosition(button('送出')) & Node.DOCUMENT_POSITION_FOLLOWING, 'alert 不在送出鈕上方').toBeTruthy()
    for (const [label, value] of Object.entries(messy)) expect(field(label).value, `${label} 的值被改了`).toBe(value)
    expect(gets(server), '失敗還重取了列表').toEqual(['?page=0'])
    expect(shownPage()).toBe(0)

    server.replyFor('/api/projects', 201, project(3, VALID.標題))
    server.replyFor('/api/projects', 200, [project(3, VALID.標題), project(1, '舊案子')])
    await submit()
    await waitFor(() => expect(queryForm()).toBeNull())
    await waitFor(() => expect(gets(server)).toEqual(['?page=0', '?page=0']))
    expect(posts(server)).toHaveLength(2)
  })

  it('[FE-J01-S06] 網路錯誤（沒有 HTTP 回應）：同樣留值、alert、不重取、不自動重送', async () => {
    await openForm()
    await fill()
    // 替身收下請求就斷線：沒有任何 HTTP 回應，`fetch` 以網路錯誤 reject。
    server.replyFor('/api/projects', 0, null, { drop: true })
    await submit()
    await within(form()).findByRole('alert')
    for (const [label, value] of Object.entries(VALID)) expect(field(label).value).toBe(value)
    await new Promise((r) => setTimeout(r, 50))
    expect(posts(server), '自動重送了').toHaveLength(1)
    expect(gets(server)).toEqual(['?page=0'])
    expect(button('送出').disabled, '失敗後要能再送').toBe(false)
  })

  it('[FE-J01-S11] 送出中連按兩次＋Enter 只送一次；回來之後關閉重取', async () => {
    await openForm()
    await fill()
    const pending = gate()
    server.replyFor('/api/projects', 201, project(3, VALID.標題), { after: pending.promise })
    server.replyFor('/api/projects', 200, [project(3, VALID.標題)])
    await submit()
    await waitFor(() => expect(posts(server)).toHaveLength(1))
    expect(button('送出').disabled, '送出中還能按').toBe(true)
    click(button('送出'))
    click(button('送出'))
    await submit() // Enter 在欄位裡 ＝ 同一個 submit 事件
    await new Promise((r) => setTimeout(r, 30))
    expect(posts(server), '送出中又送了一次').toHaveLength(1)
    pending.release()
    await waitFor(() => expect(queryForm()).toBeNull())
    await waitFor(() => expect(gets(server)).toEqual(['?page=0', '?page=0']))
  })
})

describe('未送出就關要確認；送出中不可關', () => {
  it('[FE-J01-S07] 有輸入：Escape 問、繼續編輯值還在；殼的關閉意圖再問、丟棄回列表且頁碼不變', async () => {
    await openForm(1, [project(2, '第二頁的案子')])
    await type(field('標題'), '半途')
    escape()
    expect(confirm(), 'dirty 的 Escape 沒有問').not.toBeNull()
    expect(queryForm(), '確認時表單被卸載了').not.toBeNull()
    expect(form().closest('[inert]'), '確認層開著、表單卻還能操作').not.toBeNull()
    click(within(panel()).getByRole('button', { name: '繼續編輯' }))
    expect(confirm()).toBeNull()
    expect(field('標題').value).toBe('半途')

    // 殼的關閉意圖再來一次：Escape（確認層已關、它的 Escape 層已解除，這一下到的是殼）。殼的關閉鈕在表單開著時 inert、按不到，
    // 規格與判準都以 Escape 驗殼的關閉意圖（codex 審查：對 inert 節點派送事件不是可操作性的證據）。
    escape()
    expect(screen.queryByTestId('list-panel'), '殼的關閉意圖把整個面板關了').not.toBeNull()
    expect(confirm(), '殼的關閉意圖沒有走表單的 requestClose').not.toBeNull()
    click(within(panel()).getByRole('button', { name: '丟棄' }))
    expect(queryForm()).toBeNull()
    expect(within(list()).getByText('第二頁的案子')).toBeDefined()
    expect(shownPage()).toBe(1)
    expect(gets(server), '丟棄之後不該重取').toEqual(['?page=1'])
    expect(screen.getByTestId('list-panel-list')).not.toHaveAttribute('inert')
  })

  it('[FE-J01-S07] 有輸入按「取消」也問', async () => {
    await openForm()
    await type(field('內容'), '半途')
    click(button('取消'))
    expect(confirm()).not.toBeNull()
    expect(queryForm()).not.toBeNull()
  })

  it('[FE-J01-S07] 乾淨就直接關、不問；面板仍開著', async () => {
    await openForm()
    click(button('取消'))
    expect(confirm()).toBeNull()
    expect(queryForm()).toBeNull()
    expect(screen.getByTestId('list-panel')).toBeDefined()
    expect(document.activeElement).toBe(list())
  })

  it('[FE-J01-S07] 送出中 Escape、取消都關不掉，也不問', async () => {
    await openForm()
    await fill()
    const pending = gate()
    server.replyFor('/api/projects', 201, project(3, VALID.標題), { after: pending.promise })
    server.replyFor('/api/projects', 200, [project(3, VALID.標題)])
    await submit()
    await waitFor(() => expect(posts(server)).toHaveLength(1))
    escape()
    click(button('取消'))
    expect(queryForm(), '送出中被關掉了').not.toBeNull()
    expect(confirm(), '送出中還跳確認').toBeNull()
    expect(screen.getByTestId('list-panel')).toBeDefined()
    pending.release()
    await waitFor(() => expect(queryForm()).toBeNull())
  })
})
