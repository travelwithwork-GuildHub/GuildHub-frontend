# Tasks —— fe-w05-camera-fixed-heading

## 1. 規格（本 PR）
- [ ] 1.1 `spec/fe-w05-camera-fixed-heading` 分支，只動 `openspec/changes/fe-w05-camera-fixed-heading/`
- [ ] 1.2 `pnpm exec openspec validate fe-w05-camera-fixed-heading --strict` 綠
- [ ] 1.3 規格 PR 合併到 main

## 2. 實作（feat/fe-w05-camera-fixed-heading--heading）
- [x] 2.1 `tests/camera-heading.test.tsx`：`FE-W05-S11` —— mock `useFrame` 直接驅動正式 `WorldCamera`；target 連續移動＋反覆變向 120 幀，每幀 `baseline.angleTo(camera.quaternion) ≤ 1.7e-4`，且位置朝 `target+offset` 收斂。**先在修前跑一次確認紅**（量到 **2.354°**，與 codex 估的 2.5° 吻合）
- [x] 2.2 `src/world/WorldCamera.tsx`：建立時 `lookAt` 一次；`useFrame` 只阻尼位置、移除每幀 `lookAt`；註解寫清楚「朝向是常數、每幀 lookAt 是暈眩源」
- [x] 2.3 `pnpm lint` ＋ `tsc` ＋ `pnpm test` 全綠（既有 S01～S10 與 `camera-no-rerender` 不動）

## 3. 收尾
- [ ] 3.1 部署由使用者 `vercel --prod`（與其他 demo 調整一起）；真機走查：走路時畫面不再擺動
- [ ] 3.2 archive-review ＋封存
