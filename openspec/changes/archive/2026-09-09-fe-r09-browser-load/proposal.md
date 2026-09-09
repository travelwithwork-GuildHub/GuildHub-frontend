## Why

`FE-R09` 是 W1 的 **Go / No-Go 閘門**。工作分解表逐字：

> 40 個真實 Chromium / R3F Browser E2E（**不是 WebSocket fake client**）；
> 單 Browser 渲染 39 個 Remote，記錄 FPS / CPU / GPU / Memory
>
> 另跑 40 WebSocket client network baseline，區分 Server／Protocol 與 Browser Rendering 問題
>
> **只准打自己本機起的後端。**

它要回答的問題只有一個：**40 人同畫面到底行不行。**
`CONTEXT.md` 說那是架構決定不是收尾優化 —— 答案是「不行」的話，
`FE-W13` 渲染預算、`FE-W08` Avatar、`FE-V05` 群體訊號全部要重新設計。

## 40 個真實瀏覽器跑不動，而這是量出來的

| | |
|---|---|
| 開發機 | **8 GB**，量測當下 swap 已用 **6.87 / 8 GB**，可用實體記憶體 0.89 GB |
| 一個 headless Chromium 跑**空白的** WebGL 頁面 | **225 MB**（1／2／3／4 個分別是 260／485／692／902 MB 合計） |
| 真實場景（three.js ＋ Rapier WASM ＋ WebSocket ＋ shadow map） | 只會更重 |

40 × 225 MB **已經超過整台機器的實體記憶體**，而那還只是空白頁面。
硬跑下去量到的是作業系統的 swap 與 OOM 行為，不是我們的程式碼。

## 所以拆成兩半

| | 這一項做不做 |
|---|---|
| **單一前端的 40 人可視場景渲染預算** —— 1 個真實瀏覽器 ＋ 39 個 WebSocket client 當其他玩家 | **做** |
| **同機／同 GPU 上 40 個完整前端的並發能力** | **延後**，理由是硬體 |

「**不是 WebSocket fake client**」那句話的用意是防止把「40 人完整前端情境」
偷換成「伺服器 socket 壓測」。**被測的那個瀏覽器仍然是真的** ——
它的 R3F、Three.js、Rapier、draw call、shadow map、記憶體壓力全部是真實的，
它真的在渲染 39 個遠端角色。被換掉的只有「其他 39 個人的前端」。

（這個拆法跟 codex 的 `gpt-5.6-terra` 與 Antigravity 的 Gemini 3.1 Pro 各談過一輪，
兩邊都同意，而且兩邊都指出「不是 fake client」那句話不是在禁止這件事。）

## 假 client 不能送得太漂亮，否則結果偏樂觀

Gemini 指出三個會讓 (a) 偏樂觀的原因，每一個都要在假 client 上處理：

1. **節奏太完美** —— 真實玩家有延遲突波與掉包，那會讓插值與位置修正的 CPU 峰值
   完全被掩蓋
2. **同一幀擠進大量更新** —— 真實情況下 39 個人的更新可能因為擁塞在同一幀抵達，
   那一幀要反序列化並處理 39 個人的資料
3. **移動模式太規律** —— 一直線走跟走走停停、突然轉向的成本不同

## What Changes

- **渲染預算**：1 個真實瀏覽器 ＋ N 個 WebSocket client，量被測瀏覽器的 FPS
- 假 client **刻意注入抖動、突發與同幀擁塞**，否則量到的是一個過於乾淨的世界
- **網路基準**：純 WebSocket client（不開瀏覽器），區分「伺服器／協定撐不住」
  與「瀏覽器渲染撐不住」—— 兩者的處置完全不同
- **兩個真實瀏覽器互相看得見**已經有一支 E2E 在驗（`FE-R08` 的
  `interpolation-smoothness.mjs`）—— 這裡把它指名為這一項的證據之一，不重寫

## Non-goals

- **不做 40 個完整真實前端的並發測試。** 硬體不允許（見上表）。
  規格要寫明**那半邊量不到什麼**，不要讓綠燈看起來涵蓋了它
- **不做效能優化。** instancing／LOD／共用 material 是 `FE-W13` 渲染預算（W5）。
  這一項只負責**量出數字並判定行不行**
- **不連任何團隊共用位址。** 只准打自己 `run.sh` 起的後端；CI 上沒有服務，
  所以這一項不進 CI
- **不做 CPU / GPU / VRAM 的細部歸因。** 瀏覽器給得出的是 FPS 與 JS 堆疊記憶體；
  GPU 的數字在 headless SwiftShader 下沒有意義

## Capabilities

### New Capabilities

- `load-budget`: 多人同畫面的渲染預算與網路基準

### Modified Capabilities

（無）

## Impact

- 測試：`tests/e2e/` 多兩支腳本（渲染預算、網路基準），都不進 CI
- **`docs/WBS.md` 的 `FE-R09` 要改**：把「40 個真實 Chromium」改成這個拆法，
  並記下硬體的理由（另開 `chore/`）
- 判定結果會直接影響 `FE-W13`（W5）—— 那一項的數字目標從這裡來
