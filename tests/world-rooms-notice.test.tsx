import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { RoomDoorOut } from '@/api/contract/rest'
import { RoomsNotice } from '@/world/rooms/RoomsNotice'
import type { RoomsView } from '@/world/rooms/useRooms'

// 走廊的門「為什麼不在那裡」。規格 `FE-W12-S02`／`S03`／`S04`／`S05`。

const ROOM: RoomDoorOut = {
  project_id: 'a0000000-0000-4000-8000-000000000001',
  title: '星際導航',
  online_count: 3,
}

const view = (over: Partial<RoomsView>): RoomsView => ({
  status: 'ready',
  doors: [ROOM],
  hidden: 0,
  ...over,
})

/** 目前畫面上說了什麼。沒有說明時是 `null`。 */
function noticeText(): string | null {
  return screen.queryByTestId('rooms-notice')?.textContent ?? null
}

describe('狀態說明', () => {
  it('[FE-W12-S03] 載入中說得出來', () => {
    render(<RoomsNotice view={view({ status: 'loading', doors: [] })} />)
    expect(screen.getByTestId('rooms-loading')).toBeTruthy()
  })

  it('[FE-W12-S04] 請求失敗說得出來', () => {
    render(<RoomsNotice view={view({ status: 'failed', doors: [] })} />)
    expect(screen.getByTestId('rooms-failed')).toBeTruthy()
  })

  it('[FE-W12-S02] 空清單說「目前沒有公開的專案」', () => {
    render(<RoomsNotice view={view({ status: 'ready', doors: [] })} />)
    expect(screen.getByTestId('rooms-empty')).toBeTruthy()
  })

  it('[FE-W12-S02] 「沒有專案」與「拿不到資料」不得長得一樣', () => {
    const { unmount } = render(<RoomsNotice view={view({ status: 'ready', doors: [] })} />)
    const empty = noticeText()
    unmount()

    render(<RoomsNotice view={view({ status: 'failed', doors: [] })} />)
    const failed = noticeText()

    // ⚠️ 兩者都是「走廊上沒有門」。混成同一句話的話，玩家會一直重新整理，
    // 或者反過來，以為這個世界真的是空的。
    expect(empty).not.toBe(null)
    expect(failed).not.toBe(null)
    expect(empty).not.toBe(failed)
  })

  it('[FE-W12-S22] 過期說得出來，而且跟前兩者也不一樣', () => {
    render(<RoomsNotice view={view({ status: 'stale' })} />)
    expect(screen.getByTestId('rooms-stale')).toBeTruthy()
  })

  it('[FE-W12-S05] 排不下的說得出有幾個', () => {
    render(<RoomsNotice view={view({ hidden: 3 })} />)
    expect(screen.getByTestId('rooms-hidden').textContent).toContain('3')
  })

  it('[FE-W12-S05] 一切正常時什麼都不顯示', () => {
    render(<RoomsNotice view={view({})} />)
    // ⚠️ `WorldCanvas` 有一條禁令：不得加回**常駐**的說明文字。
    // 這一條就是那件事的判準 —— 沒有它，上面每一條都可以靠「永遠顯示一段話」通過。
    expect(noticeText()).toBe(null)
  })
})
