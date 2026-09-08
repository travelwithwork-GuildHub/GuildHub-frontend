// WebSocket 的最小介面。規格 FE-R01。
//
// 存在的理由只有一個：**讓測試注入替身**。單元測試裡沒有真的 WebSocket
//（jsdom 的那個會真的想連線），而這一層要驗的是**時序與狀態**，不是網路。
//
// ⚠️ **這是 DOM `WebSocket` 的子集，不是包裝層。** 真的 `WebSocket` 直接
// 滿足它，不需要任何轉接。包一層轉接只會多製造一個「替身跟真的不一樣」
// 的地方，而那種落差是查不出來的。
//
// ⚠️ **只放實際用到的東西。** 多一個方法就多一個落差。

export interface CloseInfo {
  code: number
  reason: string
  wasClean: boolean
}

export interface SocketEventMap {
  open: unknown
  message: { readonly data: unknown }
  close: CloseInfo
}

export type SocketEventName = keyof SocketEventMap

export interface SocketLike {
  send(data: string): void
  close(): void
  addEventListener<K extends SocketEventName>(
    type: K,
    listener: (event: SocketEventMap[K]) => void,
  ): void
  removeEventListener<K extends SocketEventName>(
    type: K,
    listener: (event: SocketEventMap[K]) => void,
  ): void
}
