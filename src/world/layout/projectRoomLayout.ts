import { BOUNDARY_WALLS } from './boundary'
import type { LayoutItem } from './types'

// Project Room 在 `FE-W16` 之前的配置。規格 `FE-V01-S02`。
//
// **只有四面邊界牆，出生點在原點。** 桌子、座位是 `FE-W16` 的事 —— 它動的是這個檔案，
// 不動場景註冊表。跟 Guild Hall 一樣，渲染與碰撞都吃這一份。

export const ROOM_SPAWN = { x: 0, z: 0 } as const

export const ROOM_LAYOUT: readonly LayoutItem[] = [...BOUNDARY_WALLS]
