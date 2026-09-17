import { describe, expect, it } from 'vitest'
import { CLOSED, depthOf, parsePanelUrl, serializePanelUrl } from '@/list-panel/urlState'

// 規格：openspec/changes/fe-b09-deep-link/specs/deep-link/spec.md
//   Requirement: 網址表示開著哪一層，複製它就能還原 —— S05 的純函式半邊（canonical 表在 design `D5`）。
// 規格：openspec/changes/fe-b03-project-detail/specs/deep-link/spec.md —— S14 的純函式半邊（`project=<id>`）。
//   整棵樹上的 S01～S05、S13 在 `deep-link.test.tsx`。

const ID = '33333333-3333-3333-3333-000000000007'
const PID = '44444444-4444-4444-4444-000000000009'

describe('parsePanelUrl：解析出來的一定是 canonical 的', () => {
  it.each([
    ['?panel=profiles', { panel: 'profiles', profile: null, project: null, page: 0 }],
    ['?panel=profiles&page=0', { panel: 'profiles', profile: null, project: null, page: 0 }],
    ['?panel=profiles&page=2', { panel: 'profiles', profile: null, project: null, page: 2 }],
    [`?panel=profiles&profile=${ID}`, { panel: 'profiles', profile: ID, project: null, page: 0 }],
    [`?profile=${ID}`, { panel: 'profiles', profile: ID, project: null, page: 0 }],
    ['?panel=projects', { panel: 'projects', profile: null, project: null, page: 0 }],
    [`?panel=projects&profile=${ID}`, { panel: 'projects', profile: null, project: null, page: 0 }],
    ['?panel=profiles&page=-1', { panel: 'profiles', profile: null, project: null, page: 0 }],
    ['?panel=profiles&page=abc', { panel: 'profiles', profile: null, project: null, page: 0 }],
    ['?panel=profiles&page=1.5', { panel: 'profiles', profile: null, project: null, page: 0 }],
    ['?panel=profiles&page=99999999999999999999', { panel: 'profiles', profile: null, project: null, page: 0 }],
    ['?panel=profiles&profile=not-a-uuid', { panel: 'profiles', profile: null, project: null, page: 0 }],
    ['?panel=bogus', CLOSED],
    ['?panel=bogus&page=3', CLOSED],
    ['?profile=not-a-uuid', CLOSED],
    ['', CLOSED],
    ['?', CLOSED],
  ])('[FE-B09-S05] %s', (search, expected) => {
    expect(parsePanelUrl(search)).toEqual(expected)
  })

  // `project=<id>`（`FE-B03`）：八種輸入各有一個確定的 canonical 答案
  it.each([
    [`?panel=projects&project=${PID}`, { panel: 'projects', profile: null, project: PID, page: 0 }],
    [`?panel=projects&profile=${ID}`, { panel: 'projects', profile: null, project: null, page: 0 }],
    [`?panel=profiles&project=${PID}`, { panel: 'profiles', profile: null, project: null, page: 0 }],
    [`?project=${PID}&page=2`, { panel: 'projects', profile: null, project: PID, page: 2 }],
    [`?profile=${ID}&project=${PID}`, { panel: 'profiles', profile: ID, project: null, page: 0 }],
    [`?panel=projects&project=${PID}&profile=${ID}`, { panel: 'projects', profile: null, project: PID, page: 0 }],
    [`?panel=profiles&project=${PID}&profile=${ID}`, { panel: 'profiles', profile: ID, project: null, page: 0 }],
    [`?panel=bogus&project=${PID}`, CLOSED],
    ['?project=not-a-uuid', CLOSED],
    [`?project=${PID}&project=${ID}`, { panel: 'projects', profile: null, project: PID, page: 0 }],
  ])('[FE-B09-S14] %s', (search, expected) => {
    expect(parsePanelUrl(search)).toEqual(expected)
  })

  it('[FE-B09-S14] 序列化：project 在 panel 之後、page 之前；解析 → 序列化是定點', () => {
    expect(serializePanelUrl({ panel: 'projects', profile: null, project: PID, page: 2 })).toBe(`?panel=projects&project=${PID}&page=2`)
    for (const search of [`?project=${PID}&page=2`, `?panel=projects&project=${PID}&profile=${ID}`, `?project=${PID}&project=${ID}`, `?panel=bogus&project=${PID}`]) {
      const once = serializePanelUrl(parsePanelUrl(search))
      expect(serializePanelUrl(parsePanelUrl(once)), search).toBe(once)
    }
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
    expect(serializePanelUrl({ panel: 'profiles', profile: null, project: null, page: 0 })).toBe('?panel=profiles')
    expect(serializePanelUrl({ panel: 'profiles', profile: ID, project: null, page: 3 })).toBe(`?panel=profiles&profile=${ID}&page=3`)
  })
  it('[FE-B09-S14] depthOf：世界 0、清單 1、詳情 2（profile 與 project 都是第 2 層）', () => {
    expect(depthOf(CLOSED)).toBe(0)
    expect(depthOf({ panel: 'projects', profile: null, project: null, page: 4 })).toBe(1)
    expect(depthOf({ panel: 'profiles', profile: ID, project: null, page: 0 })).toBe(2)
    expect(depthOf({ panel: 'projects', profile: null, project: PID, page: 0 }), '[FE-B09-S14] project 也是第 2 層').toBe(2)
  })
})
