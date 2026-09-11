import { describe, expect, it } from 'vitest'
import { CLOSED, depthOf, parsePanelUrl, serializePanelUrl } from '@/list-panel/urlState'

// 規格：openspec/changes/fe-b09-deep-link/specs/deep-link/spec.md
//   Requirement: 網址表示開著哪一層，複製它就能還原 —— S05 的純函式半邊（canonical 表在 design `D5`）。
//   整棵樹上的 S01～S05、S13 在 `deep-link.test.tsx`。

const ID = '33333333-3333-3333-3333-000000000007'

describe('parsePanelUrl：解析出來的一定是 canonical 的', () => {
  it.each([
    ['?panel=profiles', { panel: 'profiles', profile: null, page: 0 }],
    ['?panel=profiles&page=0', { panel: 'profiles', profile: null, page: 0 }],
    ['?panel=profiles&page=2', { panel: 'profiles', profile: null, page: 2 }],
    [`?panel=profiles&profile=${ID}`, { panel: 'profiles', profile: ID, page: 0 }],
    [`?profile=${ID}`, { panel: 'profiles', profile: ID, page: 0 }],
    ['?panel=projects', { panel: 'projects', profile: null, page: 0 }],
    [`?panel=projects&profile=${ID}`, { panel: 'projects', profile: null, page: 0 }],
    ['?panel=profiles&page=-1', { panel: 'profiles', profile: null, page: 0 }],
    ['?panel=profiles&page=abc', { panel: 'profiles', profile: null, page: 0 }],
    ['?panel=profiles&page=1.5', { panel: 'profiles', profile: null, page: 0 }],
    ['?panel=profiles&page=99999999999999999999', { panel: 'profiles', profile: null, page: 0 }],
    ['?panel=profiles&profile=not-a-uuid', { panel: 'profiles', profile: null, page: 0 }],
    ['?panel=bogus', CLOSED],
    ['?panel=bogus&page=3', CLOSED],
    ['?profile=not-a-uuid', CLOSED],
    ['', CLOSED],
    ['?', CLOSED],
  ])('[FE-B09-S05] %s', (search, expected) => {
    expect(parsePanelUrl(search)).toEqual(expected)
  })

  it('[FE-B09-S05] 解析 → 序列化 → 解析是定點（canonical 才有終止條件）', () => {
    for (const search of ['?panel=profiles&page=0', `?profile=${ID}`, '?panel=bogus', `?panel=projects&profile=${ID}`, '?panel=profiles&page=-1', '?panel=profiles&page=99999999999999999999']) {
      const once = serializePanelUrl(parsePanelUrl(search))
      expect(serializePanelUrl(parsePanelUrl(once)), search).toBe(once)
    }
  })
})

describe('serializePanelUrl', () => {
  it('第 0 頁省略、沒有面板是空字串', () => {
    expect(serializePanelUrl(CLOSED)).toBe('')
    expect(serializePanelUrl({ panel: 'profiles', profile: null, page: 0 })).toBe('?panel=profiles')
    expect(serializePanelUrl({ panel: 'profiles', profile: ID, page: 3 })).toBe(`?panel=profiles&profile=${ID}&page=3`)
  })
  it('depthOf：世界 0、清單 1、詳情 2', () => {
    expect(depthOf(CLOSED)).toBe(0)
    expect(depthOf({ panel: 'projects', profile: null, page: 4 })).toBe(1)
    expect(depthOf({ panel: 'profiles', profile: ID, page: 0 })).toBe(2)
  })
})
