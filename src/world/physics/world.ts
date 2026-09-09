import type RAPIER from '@dimforge/rapier3d-compat'

// 物理世界的建立與步進。
//
// ⚠️ **這個模組刻意不 import React 也不 import three** ——
// 它在 jsdom 裡跑得起來（開工前實測過），所以碰撞、邊界、穿牆防護
// 全部是單元測試驗得到的。這一項因此跟 FE-W01 完全相反：
// FE-W01 有一半只有眼睛驗得了，這裡只剩「手感」需要眼睛。

/**
 * ⚠️ **只有 `halfExtent` 由 `FE-W11` 定案並釘住**（見它自己的說明）。
 * 其餘仍是暫定值，沒有測試釘住（`FE-W04` design.md 的 D5）——
 * 角色 collider 的尺寸在 `FE-W08` 換 Avatar 時會調。
 */
export const PHYSICS = {
  /**
   * 遊玩區域的半寬（世界單位）。實際範圍是 ±halfExtent。
   *
   * **`FE-W11` 定的：24×24。** 這個值不再是暫定的 —— 它是**空間契約**
   * （碰撞、生成位置、之後動態物件的容量都以它為單位），有測試釘住。
   *
   * ⚠️ 理由**不是**「讓玩家看不完整個大廳」。量過：相機在 45° 俯角、
   * `viewHeight = 12`，地面看得到約 20×17 —— 20×20 本來就是一眼看完的，
   * 而「一眼看到活動分布」是優點（`CONTEXT.md` 的互動鏈第一環是「看見」）。
   * 24×24 買的是**空間與動線餘裕**。
   */
  halfExtent: 12,
  /** 邊界牆的厚度。 */
  wallThickness: 0.5,
  /** 邊界牆的高度。 */
  wallHeight: 2,
  /** 角色 collider：膠囊的半高與半徑。 */
  playerHalfHeight: 0.35,
  playerRadius: 0.25,
  /** 物理的固定時間步（秒）。**不跟著 render 的 dt 變** —— 見 D4。 */
  fixedStep: 1 / 60,
  /** 一次 render 最多補幾個物理步。防止分頁切回前景時追一萬步。 */
  maxStepsPerFrame: 5,
} as const

export interface PhysicsWorld {
  rapier: typeof RAPIER
  world: RAPIER.World
  controller: RAPIER.KinematicCharacterController
  player: RAPIER.RigidBody
  playerCollider: RAPIER.Collider
}

/** 靜態障礙物的描述。`sensor` 的不擋路，只回報重疊。 */
export interface StaticBox {
  x: number
  z: number
  halfWidth: number
  halfDepth: number
  halfHeight?: number
  sensor?: boolean
}

/**
 * 建立物理世界。
 *
 * 重力是零：**這是俯視角的平面移動**（`CONTEXT.md`：移動是 2D gameplay logic）。
 * 留一個用不到的重力設定，只會讓之後的人猜它為什麼在那裡。
 */
export function createPhysicsWorld(rapier: typeof RAPIER, spawn = { x: 0, z: 0 }): PhysicsWorld {
  const world = new rapier.World({ x: 0, y: 0, z: 0 })
  world.timestep = PHYSICS.fixedStep

  const player = world.createRigidBody(
    rapier.RigidBodyDesc.kinematicPositionBased().setTranslation(spawn.x, 0, spawn.z),
  )
  const playerCollider = world.createCollider(
    rapier.ColliderDesc.capsule(PHYSICS.playerHalfHeight, PHYSICS.playerRadius),
    player,
  )

  // offset：controller 與障礙物之間保留的縫隙。
  // 太小會讓角色貼牆時抖動，太大會看起來浮在牆前面。
  const controller = world.createCharacterController(0.01)
  // 沿著表面滑動，而不是撞到就完全停住 —— 規格 FE-W04-S02。
  controller.setSlideEnabled(true)

  addBounds(rapier, world)

  // ⚠️ 查詢管線要先更新，否則**第一次移動看不到剛加的 collider** ——
  // 症狀是「開場第一步就穿牆」，而之後每一步都正常（因為 step 更新了它）。
  // 實測抓到的：S05 只推一次，結果直接穿到 x=5。
  world.updateSceneQueries()

  return { rapier, world, controller, player, playerCollider }
}

/**
 * 遊玩區域的邊界。
 *
 * **用靜態 collider，不是夾座標**（規格明文的 MUST NOT）。
 * 夾座標會讓角色在邊界上抖動，而且跟 sensor 的重疊判定對不起來 ——
 * 一個在物理裡算、一個在物理外算。
 */
function addBounds(rapier: typeof RAPIER, world: RAPIER.World): void {
  const e = PHYSICS.halfExtent
  const t = PHYSICS.wallThickness
  const h = PHYSICS.wallHeight
  const walls: Array<[number, number, number, number]> = [
    [0, -e - t, e + t, t], // 上（−Z）
    [0, e + t, e + t, t], // 下（+Z）
    [-e - t, 0, t, e + t], // 左（−X）
    [e + t, 0, t, e + t], // 右（+X）
  ]
  for (const [x, z, hw, hd] of walls) {
    const body = world.createRigidBody(rapier.RigidBodyDesc.fixed().setTranslation(x, 0, z))
    world.createCollider(rapier.ColliderDesc.cuboid(hw, h, hd), body)
  }
}

/** 加一個靜態方塊。`sensor: true` 的不擋路，只回報重疊。 */
export function addStaticBox(pw: PhysicsWorld, box: StaticBox): RAPIER.Collider {
  const body = pw.world.createRigidBody(
    pw.rapier.RigidBodyDesc.fixed().setTranslation(box.x, 0, box.z),
  )
  const desc = pw.rapier.ColliderDesc.cuboid(
    box.halfWidth,
    box.halfHeight ?? PHYSICS.wallHeight,
    box.halfDepth,
  )
  if (box.sensor) {
    desc.setSensor(true)
    // ⚠️ **Rapier 預設不算「kinematic 對 fixed」的碰撞。**
    // 角色是 kinematicPositionBased、sensor 掛在 fixed body 上 ——
    // 預設的 activeCollisionTypes 只涵蓋 DYNAMIC_*，所以
    // `intersectionPairsWith` 永遠查不到這個重疊。
    //
    // 實測抓到的：走進 sensor 之後 isOverlapping 仍然回 false。
    // 這一行不能省，而且它的失敗是**無聲的** —— sensor 看起來存在、
    // 角色也走得過去，只是永遠不會觸發。
    desc.setActiveCollisionTypes(
      pw.rapier.ActiveCollisionTypes.DEFAULT | pw.rapier.ActiveCollisionTypes.KINEMATIC_FIXED,
    )
  }
  const collider = pw.world.createCollider(desc, body)
  // 同上：新加的 collider 要進查詢管線，否則下一次移動看不到它
  pw.world.updateSceneQueries()
  return collider
}

/**
 * 把期望位移交給 character controller 解算，然後套用結果。
 *
 * **穿牆防護在這裡**：controller 內部做 shape-cast（把形狀沿路徑掃過去），
 * 所以位移多大都不會穿過去。
 *
 * ⚠️ **不要改成「先移動再檢查有沒有重疊」** —— 那在低速時完全正確，
 * 高速時直接穿過去，而且測試只用正常速度**永遠測不出來**。
 */
export function movePlayer(pw: PhysicsWorld, desired: { x: number; z: number }): void {
  pw.controller.computeColliderMovement(
    pw.playerCollider,
    { x: desired.x, y: 0, z: desired.z },
    undefined,
    undefined,
    // ⚠️ **排除 sensor 只能用 predicate，`QueryFilterFlags.EXCLUDE_SENSORS`
    // 對 character controller 不生效。** 這是實測出來的，文件沒說：
    //
    //   沒有旗標              x = 0.240  ← 被 sensor 擋住
    //   EXCLUDE_SENSORS       x = 0.240  ← **旗標無效**
    //   filterPredicate       x = 3.000  ← 有效
    //
    // 規格 S06 明文要求 sensor「MUST NOT 阻擋角色移動」，
    // 所以這一行不能省，也不能「改用比較乾淨的旗標」。
    (collider) => !collider.isSensor(),
  )
  const applied = pw.controller.computedMovement()
  const p = pw.player.translation()
  pw.player.setNextKinematicTranslation({
    x: p.x + applied.x,
    y: p.y + applied.y,
    z: p.z + applied.z,
  })
  pw.world.step()
}

/** 角色目前有沒有跟這個 sensor 重疊。 */
export function isOverlapping(pw: PhysicsWorld, sensor: RAPIER.Collider): boolean {
  let hit = false
  pw.world.intersectionPairsWith(pw.playerCollider, (other) => {
    if (other === sensor) hit = true
  })
  return hit
}
