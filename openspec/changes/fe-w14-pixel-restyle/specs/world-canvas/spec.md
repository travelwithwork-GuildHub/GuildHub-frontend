## MODIFIED Requirements

### Requirement: World 以 WebGL Canvas 渲染

`/world` 的 World 區域 SHALL 渲染一個 WebGL canvas，取代原本的 DOM 佔位內容。

該 canvas SHALL 填滿它的容器，並在容器尺寸改變時跟著改變。
有效裝置像素比 SHALL 有 `2` 的**上限** —— 不設上限的話，
高 DPR 螢幕會用四倍以上的像素去畫同一個畫面。

**下限交由渲染面決定**（`FE-W14` 放寬）：一般模式維持在 `1` 以上；
像素風（`world-visual-polish`／`FE-W14`）SHALL 以刻意的**低有效 DPR**（`0.25`）
換取最近鄰的像素化外觀 —— `0.25 ≤ 2`，上限仍成立，只是不再有「不低於 1」的下限。
原本「1 到 2 之間」的下限是為了防高 DPR 浪費像素，跟像素風刻意降解析度不衝突：
兩者都在把畫的像素數壓下來。

相機由 `world-camera` 提供。**`FE-W01` 當時設的 perspective 相機是暫時的**，
已被取代 —— `CONTEXT.md` 訂的是固定的 Orthographic Elevated 相機。

#### Scenario: [FE-W01-S01] 進入世界看到 3D 畫面

- **WHEN** 使用者在支援 WebGL2 的瀏覽器開啟 `/world`
- **THEN** 頁面渲染出一個 canvas 元素
- **AND** 該 canvas 的像素尺寸不為零
- **VERIFY-BY** `manual-browser`｜d9cc115b14a5e58df7a3dbe2554dfaaf730f07bb（archive: fe-w01-worldcanvas，tasks.md 7.3 的 V1）｜jsdom 沒有 WebGL2，canvas 的實際像素尺寸永遠是 0；測得到的只有「有沒有掛上 canvas 元素」，那不是這條在講的事

#### Scenario: [FE-W01-S02] 容器尺寸改變

- **WHEN** 視窗尺寸改變
- **THEN** canvas 的顯示尺寸跟著容器改變
- **AND** 有效裝置像素比 MUST NOT 超過 `2`
- **VERIFY-BY** `manual-browser`｜d9cc115b14a5e58df7a3dbe2554dfaaf730f07bb（archive: fe-w01-worldcanvas，tasks.md 7.3 的 V2）｜有效 DPR 是 renderer 實際套用的值，jsdom 裡 WebGLRenderer 不會真的設定它
