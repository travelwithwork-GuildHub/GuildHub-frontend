import { describe, expect, it } from 'vitest'
import { createInteractableRegistry } from '@/world/interaction/registry'

// 規格：openspec/specs/spatial-interaction/spec.md
//   Requirement: 物件自己註冊，卸載時自己註銷 —— Scenario FE-W06-S16

describe('可互動物件的註冊表', () => {
  it('[FE-W06-S16] id 重複時明顯失敗，而且不得靜默覆蓋', () => {
    const registry = createInteractableRegistry()
    registry.register({ id: 'board', x: 0, z: 0, label: '專案看板' })

    expect(() =>
      registry.register({ id: 'board', x: 5, z: 5, label: '人才看板' }),
    ).toThrow(/id 重複/)

    // **不只要拋錯，還要沒有被改掉。** 只驗拋錯的話，
    // 一個「先寫進去再拋錯」的實作也會通過，而那時候資料已經壞了。
    expect(registry.entries.get('board')?.label).toBe('專案看板')
    expect(registry.entries.size).toBe(1)
  })

  it('註銷之後就不在表裡；同一個 id 可以重新註冊', () => {
    const registry = createInteractableRegistry()
    registry.register({ id: 'door', x: 1, z: 1, label: '專案門' })
    registry.unregister('door')

    expect(registry.entries.has('door')).toBe(false)
    // 重新掛載必須可行 —— 否則場景切換之後所有物件都註冊不回來
    expect(() => registry.register({ id: 'door', x: 2, z: 2, label: '專案門' })).not.toThrow()
  })

  it('entries 的身分穩定 —— 註冊與註銷不換掉那個 Map', () => {
    const registry = createInteractableRegistry()
    const before = registry.entries
    registry.register({ id: 'a', x: 0, z: 0, label: 'A' })
    registry.unregister('a')

    // 這個性質是「當 prop 傳下去不造成重繪」的前提
    expect(registry.entries).toBe(before)
  })
})
