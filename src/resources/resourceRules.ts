import { z } from 'zod'
import { LIMITS } from '@/api/contract/limits'
import { ResourceType } from '@/api/contract/rest'
import { safeHref } from '@/security/safeHref'

// 資源表單的規則與字句。規格 `FE-J14`〈新增：送出前擋下伺服器一定會拒絕的輸入，只送原字串〉、〈上限〉；design `D5`。
//
// ⚠️ **schema 是一個函式，不是模組層的常數。** 上限要在**渲染時**從 `LIMITS` 讀 ——
// 模組載入時就把數字烤進 schema 的話，「數字不是寫死的」那條判準（`S12`／`S16` 的 mock 那段）永遠證不了。
//
// ⚠️ **兩層驗證時機**（`FE-X05`）：`too_small` 是「送出才說」，其餘都是即時。
// 所以「空的」「只含空白」「沒選 type」必須用 `too_small` 發 issue —— 寫成 `custom`／`refine` 的話
// 它們會變成即時錯誤、把送出鈕鎖住，而規格要的是「按下去才說」。
//
// ⚠️ **網址的格式條件是「`safeHref` 放行 ∧ 不含空白」，兩個都要**（design D5）：
// 兩者不等價 —— `https://example.com/a b` 會被 URL 解析器編成 `%20` 而放行，送原字串到後端是 500；
// 反過來 `https://[` 後端收得下、`safeHref` 不收。送出的一律是**原字串**，不是正規化的結果。

export const RESOURCE_TYPE_OPTIONS = ResourceType.options

/** type 的可辨識標記**是文字**，不是只靠顏色或形狀（`S01`：輔助技術讀得到是哪一種）。 */
export const RESOURCE_TYPE_LABELS: Record<z.infer<typeof ResourceType>, string> = {
  github: 'GitHub',
  figma: 'Figma',
  notion: 'Notion',
  drive: '雲端硬碟',
  meeting: '會議',
}

export const RESOURCE_FORM_COPY = {
  createTitle: '新增資源',
  label: '名稱',
  type: '類型',
  url: '網址',
  typeUnset: '還沒選',
  submit: '新增',
  cancel: '取消',
  back: '返回',
  /** `S15`：送出前就要看得到可見範圍（Drive、Notion、會議連結常常帶著存取權杖）。 */
  visibility: '這個連結，進得了這間房的人都看得到 —— Drive、Notion、會議連結常常帶著存取權杖。',
  labelRequired: '要有名稱 —— 只有空白不算。',
  labelTooLong: (max: number) => `名稱最多 ${max} 個字。`,
  typeRequired: '選一個類型。',
  urlRequired: '要有網址。',
  urlTooLong: (max: number) => `網址最多 ${max} 個字。`,
  urlInvalid: '網址要以 http:// 或 https:// 開頭，而且不能有空白。',
  limitReached: (max: number) => `這個專案的資源已經有 ${max} 筆，到上限了 —— 要新增的話先刪掉一筆。`,
} as const

/** 寫入被伺服器拒絕，而且已經照 `D2` 確認過專案狀態：訊息是 `FE-X03` 的語彙，不是後端的字。 */
export class ResourceWriteRejected extends Error {
  override name = 'ResourceWriteRejected'
}

export interface ResourceFormValues {
  label: string
  type: string
  url: string
}

/** 「按下去才說」的那一種 issue（`too_small`）。 */
function required(ctx: z.RefinementCtx, message: string) {
  ctx.addIssue({ code: 'too_small', minimum: 1, origin: 'string', inclusive: true, message })
}

export function resourceFormSchema() {
  const labelMax = LIMITS.resourceLabel.max as number
  const urlMax = LIMITS.resourceUrl.max as number
  return z.object({
    label: z
      .string()
      .max(labelMax, { error: RESOURCE_FORM_COPY.labelTooLong(labelMax) })
      .superRefine((value, ctx) => {
        // 後端的 check 是 `btrim(label) <> ''`，而且**不 trim** —— 前端擋的是「只有空白」，送的仍是原字串
        if (value.trim() === '') required(ctx, RESOURCE_FORM_COPY.labelRequired)
      }),
    type: z.string().superRefine((value, ctx) => {
      if (value === '') required(ctx, RESOURCE_FORM_COPY.typeRequired)
    }),
    url: z
      .string()
      .max(urlMax, { error: RESOURCE_FORM_COPY.urlTooLong(urlMax) })
      .superRefine((value, ctx) => {
        if (value === '') {
          required(ctx, RESOURCE_FORM_COPY.urlRequired)
          return
        }
        if (/\s/.test(value) || safeHref(value) === null) ctx.addIssue({ code: 'custom', message: RESOURCE_FORM_COPY.urlInvalid })
      }),
  })
}
