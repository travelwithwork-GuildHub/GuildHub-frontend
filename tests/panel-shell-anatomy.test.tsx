import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { PanelDialog } from '@/panel/PanelDialog'
import { PanelShell } from '@/panel/PanelShell'
import { InteractionProvider } from '@/world/interaction/InteractionProvider'

// 規格 `FE-X16-S07` 的結構半邊（jsdom；rect 與寬度在 `tests/e2e/dom-shell.mjs`）：
// 標題列是面板的第一個區塊、返回是它第一個可聚焦的、關閉是最後一個；內容區在標題列外面。
// `S06` 的結構半邊：確認視窗走 `PanelDialog` → 遮罩層在內容區上、內容區 `inert`；沒有殼時原地渲染（單獨測元件的既有測試不用改）。

const shell = (props: Partial<Parameters<typeof PanelShell>[0]> = {}) =>
  render(
    <InteractionProvider>
      <PanelShell title="殼" closeLabel="關閉" testId="p" onCloseRequest={() => {}} {...props}>
        <button type="button">內容裡的按鈕</button>
      </PanelShell>
    </InteractionProvider>,
  )

const focusables = (scope: HTMLElement) => [...scope.querySelectorAll<HTMLElement>('button, a[href], input, textarea, select, [tabindex]')].filter((el) => el.tabIndex >= 0 && !(el as HTMLButtonElement).disabled)

describe('阻斷式面板的解剖', () => {
  it('[FE-X16-S07] 標題列是第一個區塊、有標題、關閉是最後一個可聚焦的；沒有返回時第一個可聚焦的就是關閉', () => {
    shell()
    const section = screen.getByTestId('p')
    const header = section.firstElementChild as HTMLElement
    expect(header.tagName).toBe('HEADER')
    expect(within(header).getByRole('heading').textContent).toBe('殼')
    const f = focusables(header)
    expect(f.at(-1)?.textContent).toBe('關閉')
    expect(f[0]?.textContent).toBe('關閉')
    expect(within(header).queryByRole('button', { name: '返回' })).toBeNull()
    // 內容不在標題列裡
    expect(header.contains(screen.getByRole('button', { name: '內容裡的按鈕' }))).toBe(false)
  })

  it('[FE-X16-S07] 子畫面：返回是標題列第一個可聚焦的、關閉留在最後、標題換掉', () => {
    let backs = 0
    shell({ title: '案件', back: { label: '返回', onBack: () => { backs += 1 } } })
    const header = screen.getByTestId('p').firstElementChild as HTMLElement
    const f = focusables(header)
    expect(f.map((el) => el.textContent)).toEqual(['返回', '關閉'])
    expect(within(header).getByRole('heading').textContent).toBe('案件')
    f[0]?.click()
    expect(backs).toBe(1)
  })

  it('[FE-X16-S06] PanelDialog：遮罩層掛在內容區上、內容區 inert、標題列不 inert；卸掉之後 inert 拿掉', () => {
    const view = render(
      <InteractionProvider>
        <PanelShell title="殼" closeLabel="關閉" testId="p" onCloseRequest={() => {}}>
          <button type="button">內容裡的按鈕</button>
          <PanelDialog>
            <div role="alertdialog" data-testid="dlg">
              <button type="button">取消</button>
            </div>
          </PanelDialog>
        </PanelShell>
      </InteractionProvider>,
    )
    const section = screen.getByTestId('p')
    const scrim = within(section).getByTestId('panel-scrim')
    expect(within(scrim).getByTestId('dlg')).toBeDefined()
    expect(screen.getByTestId('p-body').hasAttribute('inert'), '內容區要 inert').toBe(true)
    expect(screen.getByTestId('p-content').contains(scrim), '遮罩要在內容區的容器裡、不蓋標題列').toBe(true)
    expect((section.firstElementChild as HTMLElement).hasAttribute('inert')).toBe(false)
    view.rerender(
      <InteractionProvider>
        <PanelShell title="殼" closeLabel="關閉" testId="p" onCloseRequest={() => {}}>
          <button type="button">內容裡的按鈕</button>
        </PanelShell>
      </InteractionProvider>,
    )
    expect(screen.getByTestId('p-body').hasAttribute('inert')).toBe(false)
    expect(screen.queryByTestId('panel-scrim')).toBeNull()
  })

  it('[FE-X16-S06] 沒有殼的 PanelDialog 原地渲染、沒有遮罩', () => {
    render(
      <PanelDialog>
        <div data-testid="dlg" />
      </PanelDialog>,
    )
    expect(screen.getByTestId('dlg')).toBeDefined()
    expect(screen.queryByTestId('panel-scrim')).toBeNull()
  })
})
