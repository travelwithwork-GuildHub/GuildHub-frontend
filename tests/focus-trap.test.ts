import { describe, expect, it } from 'vitest'
import { nextTabStop, tabbablesIn } from '@/list-panel/focusTrap'

// 規格：openspec/changes/fe-x06-keyboard-focus/specs/keyboard-focus/spec.md
//   Requirement: 焦點有邊界 —— S11 的計算那一半（jsdom 不實作 Tab，真的 Tab 在 Playwright）。
//
// 審查抓到的：「符合 selector」不等於「瀏覽器會 Tab 到」。這裡把那幾種差別各釘一條。

function root(html: string): HTMLElement {
  const el = document.createElement('section')
  el.innerHTML = html
  document.body.appendChild(el)
  return el
}

describe('tabbablesIn：瀏覽器會 Tab 到的才算', () => {
  it('disabled、inert 裡、hidden、tabindex=-1、type=hidden 都不算；contenteditable、summary 算', () => {
    const el = root(`
      <button id="a">a</button>
      <button id="b" disabled>b</button>
      <div inert><button id="c">c</button></div>
      <div hidden><button id="d">d</button></div>
      <div tabindex="-1" id="e">e</div>
      <input id="f" type="hidden" />
      <div contenteditable="true" id="g">g</div>
      <details><summary id="h">h</summary></details>
      <fieldset disabled><input id="i" /></fieldset>
    `)
    expect(tabbablesIn(el).map((n) => n.id)).toEqual(['a', 'g', 'h'])
    el.remove()
  })
})

describe('nextTabStop：只在邊界攔', () => {
  it('最後一個往前 → 第一個；第一個往後 → 最後一個；中間交給瀏覽器', () => {
    const el = root('<button id="a">a</button><button id="b">b</button><button id="c">c</button>')
    const [a, b, c] = Array.from(el.querySelectorAll('button'))
    expect(nextTabStop(el, c ?? null, false)).toBe(a)
    expect(nextTabStop(el, a ?? null, true)).toBe(c)
    expect(nextTabStop(el, b ?? null, false)).toBeNull()
    el.remove()
  })

  it('焦點在容器上：往前交給瀏覽器（容器之後有東西）、容器之後沒東西就繞到第一個', () => {
    const el = root('<button id="a">a</button><div tabindex="-1" id="box"></div>')
    const box = el.querySelector('#box') as HTMLElement
    // 容器之後沒有可 Tab 的：瀏覽器會跑出面板 —— 要繞到第一個（審查抓到的：詳情裡只有預覽那一格）。
    expect(nextTabStop(el, box, false)).toBe(el.querySelector('#a'))
    el.remove()
    const el2 = root('<div tabindex="-1" id="box"></div><button id="a">a</button>')
    const box2 = el2.querySelector('#box') as HTMLElement
    expect(nextTabStop(el2, box2, false)).toBe(el2.querySelector('#a'))
    expect(nextTabStop(el2, box2, true)).toBe(el2.querySelector('#a'))
    el2.remove()
  })

  it('沒有任何可 Tab 的元素：留在原地，不交給瀏覽器', () => {
    const el = root('<div tabindex="-1" id="box">只有預覽</div>')
    expect(nextTabStop(el, el.querySelector('#box'), false)).toBe('stay')
    expect(nextTabStop(el, el.querySelector('#box'), true)).toBe('stay')
    el.remove()
  })
})
