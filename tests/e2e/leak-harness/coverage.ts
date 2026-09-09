// FE-W07 的涵蓋率檢查。規格 `openspec/specs/world-resources/` 的
// Requirement「會建立 GPU 資源的場景元件必須被偵測涵蓋」。
//
// ⚠️ **這裡是純函式，沒有檔案系統。** 讀檔在 `tests/leak-coverage.test.ts`。
// 分開的理由：涵蓋率規則的兩個方向都要有負向驗證，而負向驗證需要餵它
// **假的輸入**（少一個檔案、多一個幽靈項目）。碰檔案系統的函式做不到這件事，
// 只能靠真的去新增檔案 —— 那樣的測試會在失敗時留下垃圾。

/** 會建立 GPU 資源的 JSX intrinsic：`<boxGeometry>`、`<meshStandardMaterial>`⋯⋯ */
const JSX_INTRINSIC = /<[a-z][A-Za-z0-9]*(Geometry|Material|Texture)\b/
/** 用 `new` 建的：`new BoxGeometry()`、`new THREE.MeshStandardMaterial()`⋯⋯ */
const IMPERATIVE = /\bnew\s+\(?\s*(?:[A-Za-z0-9_$]+\.)?[A-Z][A-Za-z0-9]*(?:Geometry|Material|Texture|RenderTarget|Loader)\b/
/** 把資源藏在 hook 後面的：drei 與 R3F 的載入器。它們既沒有 `<` 也沒有 `new`。 */
const RESOURCE_HOOK = /\b(useLoader|useTexture|useGLTF|useFBO|useVideoTexture|useCubeTexture|useEnvironment)\s*\(/
/** `<primitive object={…}>`：物件是外面建的，R3F 明文不釋放 primitive。 */
const PRIMITIVE = /<primitive\b/

// ⚠️ **這個掃描器擋得住的是「照正常寫法寫出來的新元件」，不是惡意規避。**
// 已知擋不住的（兩個外部審查者各自指出的，實測沒有修）：
//
//   import { BoxGeometry as Box } from 'three'; new Box()   ← 名字被改掉
//   new THREE[kind + 'Geometry']()                          ← 動態拼接
//   一個 helper 函式在別的檔案裡建，被 src/world/ 呼叫       ← 跨檔案
//   透過 extend() 註冊的自訂 JSX 元件                        ← 名字不含關鍵字
//
// **這不是「之後再修」，是刻意的範圍。** 要擋住這些需要型別資訊
//（TypeScript 的 program，不是正則），成本遠高於它防的東西 ——
// 而這條規則防的是「有人加了新元件卻忘記登記」，不是「有人想繞過它」。
// 規格 `FE-W07-S06` 的字面範圍就是 JSX intrinsic 與 `new`。

/**
 * 把註解拿掉。
 *
 * ⚠️ **不拿掉的話這個檢查會被自己的說明文件觸發。** 這個 repo 的註解密度很高，
 * 而「`<boxGeometry>`」這種字串在解釋為什麼要有這條規則的段落裡一定會出現 ——
 * 於是一個完全沒有 GPU 資源的檔案會被要求登記進受測清單，
 * 而**沒有人看得出為什麼**。
 */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
}

/** 這個模組的原始碼會不會建立 GPU 資源。 */
export function createsGpuResources(source: string): boolean {
  const code = stripComments(source)
  return (
    JSX_INTRINSIC.test(code) ||
    IMPERATIVE.test(code) ||
    RESOURCE_HOOK.test(code) ||
    PRIMITIVE.test(code)
  )
}

/**
 * 一個受測清單項目對應的 import specifier。
 *
 * `src/world/player/ChibiPlayer.tsx` → `@/world/player/ChibiPlayer`
 */
export function specifierFor(sourcePath: string): string {
  return sourcePath.replace(/^src\//, '@/').replace(/\.tsx?$/, '')
}

/**
 * 量測台受測清單裡登記的正式碼路徑。
 *
 * 從 `main.tsx` 的 `source: '…'` 欄位抓。**刻意不維護第二份清單** ——
 * 兩份清單一定會漂，而漂掉的那一份會讓這個檢查對著空氣通過。
 */
export function listedSources(harnessSource: string): string[] {
  return [...harnessSource.matchAll(/source:\s*'([^']+)'/g)].map((m) => m[1] as string)
}

export interface CoverageInput {
  /** `src/world/` 底下掃到的：相對於 repo 根的路徑 → 會不會建立 GPU 資源 */
  scanned: ReadonlyMap<string, boolean>
  /** 量測台受測清單裡登記的路徑 */
  listed: readonly string[]
  /** 量測台的原始碼。用來確認登記的路徑真的被 import 進去。 */
  harnessSource: string
}

/**
 * 涵蓋率的問題清單。空陣列代表沒問題。
 *
 * **兩個方向都擋**（規格 S06／S07）。只擋一邊的話，元件被刪掉或改名之後
 * 清單會留下一個永遠不會被執行的項目，而測試照樣全綠。
 */
export function coverageProblems({ scanned, listed, harnessSource }: CoverageInput): string[] {
  const problems: string[] = []
  const listedSet = new Set(listed)

  for (const [file, creates] of scanned) {
    if (creates && !listedSet.has(file)) {
      problems.push(
        `${file} 會建立 GPU 資源，但沒有登記在 tests/e2e/leak-harness/main.tsx 的 SUBJECTS 裡 ` +
          `—— 洩漏偵測看不到它`,
      )
    }
  }
  for (const file of listed) {
    if (!scanned.has(file)) {
      problems.push(`受測清單裡的 ${file} 在 src/world/ 底下找不到 —— 幽靈項目，永遠不會被執行`)
      continue
    }
    // ⚠️ **光是路徑對得上還不夠。** 一個 subject 可以宣告
    // `source: 'src/world/X.tsx'` 卻 render 完全別的東西 ——
    // 那時候涵蓋率是綠的，而 X 從來沒有被量過。
    // 至少要求量測台真的 import 了它（外部審查指出的洞）。
    if (!harnessSource.includes(`from '${specifierFor(file)}'`)) {
      problems.push(
        `受測清單登記了 ${file}，但量測台沒有 import 它 ` +
          `（找不到 from '${specifierFor(file)}'）—— 那個 subject 量的不是它`,
      )
    }
  }
  return problems
}
