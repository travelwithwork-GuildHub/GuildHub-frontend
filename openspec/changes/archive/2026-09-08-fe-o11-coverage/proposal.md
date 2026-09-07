# FE-O11：每一條 Scenario 都要指得出是誰在驗它

## Why

`AGENTS.md`〈完成的定義〉第 2 條寫「每個 Scenario 都有對應測試」。
那句話在這個 repo 一直只是散文 —— 沒有任何機器在執行它。

新加的 `check-scenario-coverage.sh` 第一次跑就抓到 **8 條已合併、卻沒有任何
通過的測試指著它的 Scenario**：

```
FE-W01-S01  進入世界看到 3D 畫面（canvas 像素尺寸不為零）
FE-W01-S02  容器尺寸改變（DPR 不超過 2）
FE-W01-S03  陰影出現在畫面上
FE-W03-S13  角色移動時相機的 target 跟著改變
FE-W04-S08  位置由 rigid body 持有，不進 React state
FE-W05-S08  target 改變不觸發重新渲染
FE-X01-S10  四個工程品質指令都真的跑
FE-X01-S11  型別錯誤不被放過
```

**其中三條比「缺測試」更嚴重。** `FE-W03-S13`、`FE-W04-S08`、`FE-W05-S08`
在各自 change 的 `tasks.md` 裡都寫著「驗證：Scenario `X`」而且都打了勾：

```
fe-w03-player/tasks.md:33  - [x] 6.1 …；驗證：Scenario `FE-W03-S13`
fe-w04-physics/tasks.md:29 - [x] 6.1 …；驗證：Scenario `FE-W04-S08`
fe-w05-camera/tasks.md:22  - [x] 4.1 …；驗證：Scenario `FE-W05-S08`

grep -rn "渲染次數\|重新渲染\|rerender" tests/    → 零命中
```

**打勾說驗過了，跟真的驗過了，是兩件事。**

## What Changes

這一份 change **不改任何產品行為**。它做兩件事：

1. **在規格上標註驗證方式。** 有四條 Scenario 在 jsdom 裡證明不了
   （WebGL 的實際像素、DPR、陰影、以及「四個指令都真的跑」），
   它們加上 `- **VERIFY-BY** <種類>｜<證據>｜<理由>`。
   種類是封閉列舉，不認得的會被閘門擋下來。

2. **把四條真的測得到的補上測試**（`FE-W03-S13`、`FE-W04-S08`、
   `FE-W05-S08`、`FE-X01-S11`）。

做完之後 `check-scenario-coverage.sh` rc=0，才有資格把它接進 CI。

## Non-Goals

- **不做 Playwright／E2E。** `FE-O11` 的 E2E 分工與 `FE-R09` 的 40 人瀏覽器
  壓測是另外的事。這一份只解「每條 Scenario 指得出誰在驗它」。
- **不放寬任何既有規格。** 四條豁免講的是「用什麼方式驗」，不是「不用驗」。
- 不改 `openspec/specs/` 之外的規格語意；四個 Requirement 的 SHALL／MUST
  一字不動，只在 Scenario 底下加一行驗證方式。
