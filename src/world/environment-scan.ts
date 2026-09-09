// 場景元件的兩條來源碼規則。規格 `FE-W10-S08`／`S09`／`S12`。
//
// ⚠️ **純函式，沒有檔案系統。** 讀檔在 `tests/world-environment-rules.test.ts`。
// 分開的理由跟 `tests/e2e/leak-harness/coverage.ts` 一樣：負向驗證要餵它
// **假的輸入**，碰檔案系統的函式做不到，只能真的去新增檔案 —— 那會留下垃圾。
//
// ⚠️ **這個檔案刻意放在 `src/world/environment/` 外面。**
// 掃描器住在自己掃的目錄裡，第一件事就是掃到自己。
//
// **「不建立碰撞體」為什麼要在來源碼上判**：這個 repo 沒有共用的物理世界單例
//（`createPhysicsWorld` 每次回一個新的），所以違規的元件會建立**它自己的**世界
// —— 「渲染前後既有世界的碰撞體數量相同」恆為真，那是一條假的判準。

/** 建立碰撞體或剛體的寫法。Rapier 的 API 都是這幾個名字。 */
const COLLIDER = /\b(createCollider|createRigidBody|createCharacterController|ColliderDesc|RigidBodyDesc)\b/

/** 註解會提到這些名字（這個檔案自己就是），不拿掉的話說明文件會觸發規則。 */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
}

/** 這個模組的原始碼會不會建立碰撞體或剛體。 */
export function createsColliders(source: string): boolean {
  return COLLIDER.test(stripComments(source))
}
