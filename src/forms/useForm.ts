'use client'

import { useCallback, useRef, useState } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm as useHookForm, type FieldErrors, type FieldValues, type Path, type UseFormReturn } from 'react-hook-form'
import type { z } from 'zod'
import { toUiError } from '@/errors/uiError'

// 表單的一致行為。規格 `FE-X05`〈驗證時機是全站規則〉、〈送出中、失敗、重試〉。
//
// react-hook-form ＋ Zod（WBS 明寫；design `D1`）。**兩層驗證時機不是靠 RHF 的 `mode`／`reValidateMode`**——
// 單一 resolver 在 onChange 會把 required／too_small 一起回報，延後不了。這裡依 Zod issue 的 `code` 分流：
//
//   即時（顯示、且算進「送出禁用」）：too_big、invalid_format、invalid_type、not_multiple_of、custom …（除了 too_small 以外的全部）
//   送出過才顯示（永不算進禁用）：too_small（含空字串的必填）
//
// `canSubmit` **不用 `formState.isValid`**（它含 too_small）。送出中禁用＋handler 自己 guard（連按 Enter 不送兩次）。
// 失敗：值不清、`submitError` 給 `SubmitError` 顯示（alert 在送出鈕上方、取焦點）；不自動重送。
// 文案 `toUiError(cause).message`；呼叫端可用 `describeError` 為自己定義的領域錯誤給字（規格修正，design `D5`）。
// 欄位錯誤（`visibleErrors`）由呼叫端以 `aria-invalid`＋`aria-describedby` 掛到欄位，**不**各自 `role="alert"`——一個表單一個 alert。

/** 只有這個 code 是「送出過才說」。其餘一律即時。 */
const DEFERRED_CODES = new Set(['too_small'])

export interface UseFormOptions<TSchema extends z.ZodType<FieldValues, FieldValues>> {
  schema: TSchema
  defaultValues: z.input<TSchema>
  /** 送出（已通過 schema）。拋錯 → `submitError`；resolve → 呼叫端自己決定要不要 reset。 */
  onSubmit: (values: z.output<TSchema>) => Promise<void>
  /**
   * 前端自己定義的領域錯誤的文案（`instanceof NicknameLengthError` 之類）。回字串就用它、回 `null` 退回 `toUiError(cause).message`。
   * ⚠️ 只准回**前端寫的字**，不得回後端的 `detail` 或例外的原始訊息 —— `FE-X03` 擋的就是那些。
   */
  describeError?: (cause: unknown) => string | null
}

export interface FormApi<TInput extends FieldValues, TOutput extends FieldValues = TInput> {
  /** RHF 的 `register`／`control`／`watch`／`setValue`／`reset`／`getValues`／`formState` 原樣。 */
  form: UseFormReturn<TInput, unknown, TOutput>
  /** 這一刻該顯示的欄位錯誤（已依時機分流）。 */
  visibleErrors: Partial<Record<Path<TInput>, string>>
  /** 送出鈕能不能按：沒有即時錯誤、也不在送出中。 */
  canSubmit: boolean
  busy: boolean
  /** 上一次送出失敗的文案（`toUiError`）；再送出就清掉。 */
  submitError: string | null
  /** 接在 `<form onSubmit>`。 */
  onSubmit: (event?: React.BaseSyntheticEvent) => Promise<void>
}

type LeafError = { type?: string; message?: string; types?: Record<string, unknown> }
const isLeaf = (node: object): node is LeafError => 'type' in node || 'message' in node || 'types' in node

/** RHF 的 `FieldErrors` 是巢狀的（`profile.nickname`、`skills.0`）；攤平成 RHF 的 path，跟 `register()` 的名字對得起來。 */
function leaves(node: unknown, prefix: string, out: Array<[string, LeafError]>) {
  if (typeof node !== 'object' || node === null) return
  if (isLeaf(node)) {
    out.push([prefix, node])
    return
  }
  for (const [key, child] of Object.entries(node)) leaves(child, prefix ? `${prefix}.${key}` : key, out)
}

function classify<TInput extends FieldValues>(errors: FieldErrors<TInput>, submitted: boolean) {
  const visible: Partial<Record<Path<TInput>, string>> = {}
  let hasImmediate = false
  const flat: Array<[string, LeafError]> = []
  leaves(errors, '', flat)
  for (const [path, error] of flat) {
    const name = path as Path<TInput>
    // criteriaMode 'all'：一個欄位可能同時有多個 code；只要有一個不是 deferred 就是即時。
    const codes = error.types ? Object.keys(error.types) : error.type ? [error.type] : []
    const immediate = codes.some((c) => !DEFERRED_CODES.has(c))
    if (immediate) hasImmediate = true
    if (immediate || submitted) {
      // 顯示的訊息：即時的優先（deferred 的訊息只在沒有即時錯誤時才會是唯一的那一個）。
      const shown = immediate ? codes.find((c) => !DEFERRED_CODES.has(c)) : codes[0]
      const message = shown && error.types ? String(error.types[shown]) : error.message
      if (message) visible[name] = message
    }
  }
  return { visible, hasImmediate }
}

export function useForm<TSchema extends z.ZodType<FieldValues, FieldValues>>({
  schema,
  defaultValues,
  onSubmit,
  describeError,
}: UseFormOptions<TSchema>): FormApi<z.input<TSchema>, z.output<TSchema>> {
  type TInput = z.input<TSchema>
  type TOutput = z.output<TSchema>
  const form = useHookForm<TInput, unknown, TOutput>({
    // zodResolver 的泛型對 `z.ZodType<FieldValues, FieldValues>` 推不出 input/output 的對應；這裡是唯一一處 cast。
    resolver: zodResolver(schema) as unknown as Parameters<typeof useHookForm<TInput, unknown, TOutput>>[0] extends { resolver?: infer R } ? R : never,
    defaultValues: defaultValues as never,
    mode: 'onChange',
    criteriaMode: 'all',
    shouldFocusError: true,
  })
  const [busy, setBusy] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  // 進行中的 guard 用 ref：disabled 屬性擋不住同一批次裡的第二個 submit 事件（連按 Enter），要在 handler 裡擋。
  const inFlightRef = useRef(false)

  const { visible, hasImmediate } = classify<TInput>(form.formState.errors, form.formState.submitCount > 0)

  const submit = useCallback(
    (event?: React.BaseSyntheticEvent) => {
      // guard 與 busy 在 submit 事件的**當下**就設，不等 resolver（它是非同步的；等它的話「立刻進入 busy」會晚幾個 microtask，
      // 同一批次的第二個 submit 也會溜過 —— 審查抓到的）。驗證沒過 → 解鎖，鈕照 S02 仍可按。
      if (inFlightRef.current) {
        event?.preventDefault?.()
        return Promise.resolve()
      }
      inFlightRef.current = true
      setBusy(true)
      setSubmitError(null)
      const release = () => {
        inFlightRef.current = false
        setBusy(false)
      }
      return form.handleSubmit(
        async (values) => {
          try {
            await onSubmit(values as z.output<TSchema>)
          } catch (cause) {
            setSubmitError(describeError?.(cause) ?? toUiError(cause).message)
          } finally {
            release()
          }
        },
        () => release(),
      )(event)
    },
    [form, onSubmit, describeError],
  )

  return { form, visibleErrors: visible, canSubmit: !busy && !hasImmediate, busy, submitError, onSubmit: submit }
}
