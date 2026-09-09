'use client'

import type {} from '@react-three/fiber'
import { geometryFor } from '../primitives/geometry'
import { materialFor } from '../primitives/material'
import type { PropDefinition } from './definition'

// 場景元件的泛用 renderer。規格 `FE-W10-S02`。
//
// ⚠️ **這是 `src/world/environment/` 底下唯一碰 `<mesh>` 的地方。**
// 幾何與材質**一律**來自 `FE-W09` 的共用 factory —— 規格
// `FE-W10-S08`：場景元件 MUST NOT 直接建立 GPU 資源。
//
// ⚠️ `dispose={null}` 不能省。R3F 預設會在卸載時 `dispose()` 掛在 mesh 上的
// geometry 與 material，而這兩個是**共用實例**（`FE-W09` 的 cache 擁有它們）。
// 誤釋放的症狀是「看不出來」：three.js 下一次 render 會重新上傳，
// 畫面照樣顯示，只是每次都重傳一次 GPU 資源。

export function PropParts({ definition }: { definition: PropDefinition }) {
  return (
    <>
      {definition.parts.map((part, i) => (
        <mesh
          // 部件在一份 definition 裡是固定的清單，順序就是身分。
          key={i}
          position={[...part.position]}
          rotation={[0, part.rotationY ?? 0, 0]}
          geometry={geometryFor(part.geometry)}
          material={materialFor(part.material)}
          castShadow={part.castShadow ?? true}
          receiveShadow={part.receiveShadow ?? true}
          dispose={null}
        />
      ))}
    </>
  )
}
