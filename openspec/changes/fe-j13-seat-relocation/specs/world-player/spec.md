## ADDED Requirements

### Requirement: 受限的一次性就位（relocation）命令

`LocalPlayer` SHALL 接受一個**一次性的就位命令**（目的地 `{x, z}` ＋ 一個離散朝向），由外部（例如入座成功）寫進一個共享的 ref。收到命令的那一幀，`LocalPlayer` SHALL 在**單一幀內原子地**把下列全部設到目的地、然後**清空命令**：

- **Rapier 物理體**的位置（物理仍是位置權威 —— 就位是把權威搬過去，不是繞過它）；
- **render 插值的前後兩個取樣點**（`prev` 與 `cur` 都設成目的地）—— 下一幀 MUST NOT 從舊位置插值、MUST NOT 回彈；
- **render root** 的 transform、**朝向**與其旋轉；
- **相機的 target**（畫面焦點跟到新位置）；
- 送網路層的 **`poseRef`**（位置與朝向）。

命令 SHALL 只被消費一次（消費後 ref 為空），MUST NOT 每幀進 React state。就位 MUST NOT 由 DOM／React 端直接改物理體或 `poseRef` —— **只有 `LocalPlayer` 是位置權威**，外部只寫命令。命令為空時每幀行為 SHALL 與現況完全相同（不影響既有移動、相機、里程計）。

> 拔掉什麼會紅：就位後 `prev`／`cur` 沒同時設成目的地（只設 render 位置）→ S18 的回彈段；命令消費後沒清空（每幀重套）→ S18 的一次性段；從 DOM 直接寫物理體或 `poseRef` → 破壞位置權威（S18 的「只有 LocalPlayer 改」段）。

#### Scenario: [FE-W03-S18] 就位命令原子套用、不回彈、只消費一次

- **GIVEN** 一個真 Rapier 物理世界與 render 插值狀態（`renderMotion`），角色在起點
- **WHEN** 套用一個到目的地 `{x, z}`＋朝向的就位（`teleportPlayer` 設物理體、`renderMotion` 的 `prev` 與 `cur` 都設成目的地、facing 設成命令的朝向）
- **THEN** 物理體的 `translation()` SHALL 是 `{x, 0, z}`；`renderMotion.prev` 與 `renderMotion.cur` SHALL 都等於目的地
- **AND WHEN** 之後在「沒有輸入」下推進一次 render 插值
- **THEN** 畫面位置 SHALL 仍在目的地（`prev===cur` ⇒ 不位移、不回彈）
- **AND** 就位命令的 ref SHALL 在消費後為 `null`（只套用一次）
- → 驗於：jsdom（真 Rapier，如 `tests/physics.test.ts`；測 `teleportPlayer` ＋ `renderMotion` 重設 ＋ facing 的組合機制。整合進 `LocalPlayer` useFrame 的可見結果在 `FE-J13-S08` e2e 驗）
