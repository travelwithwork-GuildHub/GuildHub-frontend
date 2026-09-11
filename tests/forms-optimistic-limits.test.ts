import path from 'node:path'
import { ESLint } from 'eslint'
import { describe, expect, it } from 'vitest'
import { LIMITS, UNBOUNDED } from '@/api/contract/limits'
import { FORM_LIMITS, effectiveLimit } from '@/forms/limits'
import { createOptimistic } from '@/forms/optimistic'

// 規格：openspec/changes/fe-x05-form-conventions/specs/form-conventions/spec.md
//   Requirement: 樂觀更新的回滾 —— S08、S09、S10
//   Requirement: 前端自訂的上限另立一個模組 —— S11、S12
//
// **不連任何外部服務。**

describe('createOptimistic', () => {
  function harness() {
    let state = 'A'
    const calls = { apply: 0, request: 0, restore: 0 }
    let resolveRequest: ((v: string) => void) | null = null
    let rejectRequest: ((e: unknown) => void) | null = null
    const optimistic = createOptimistic<string, string, string>({
      snapshot: () => state,
      apply: (input) => {
        calls.apply += 1
        state = input
      },
      request: () => {
        calls.request += 1
        return new Promise<string>((res, rej) => {
          resolveRequest = res
          rejectRequest = rej
        })
      },
      restore: (snapshot) => {
        calls.restore += 1
        state = snapshot
      },
    })
    return { optimistic, calls, get state() { return state }, resolve: (v: string) => resolveRequest?.(v), reject: (e: unknown) => rejectRequest?.(e) }
  }

  it('[FE-X05-S08] 失敗還原快照、保留提交值', async () => {
    const h = harness()
    const p = h.optimistic.run('B')
    expect(h.state, '套用要立刻可見').toBe('B')
    h.reject(new Error('boom'))
    const r = await p
    expect(r).toEqual({ ok: false, reason: 'failed', error: expect.any(Error), input: 'B' })
    expect(h.state).toBe('A')
    expect(h.calls.restore).toBe(1)
  })

  it('[FE-X05-S09] 成功以伺服器值為準', async () => {
    const h = harness()
    const p = h.optimistic.run('B')
    h.resolve('C')
    const r = await p
    expect(r).toEqual({ ok: true, value: 'C' })
    expect(h.calls.restore).toBe(0)
  })

  it('[FE-X05-S10] 一次一個 in-flight：第二次同步 resolve in-flight，apply／request 各一次', async () => {
    const h = harness()
    const first = h.optimistic.run('B')
    expect(h.optimistic.inFlight).toBe(true)
    const second = await h.optimistic.run('X')
    expect(second).toEqual({ ok: false, reason: 'in-flight' })
    expect(h.calls.apply).toBe(1)
    expect(h.calls.request).toBe(1)
    expect(h.state, '第二次不該套用').toBe('B')
    h.resolve('C')
    await first
    expect(h.optimistic.inFlight).toBe(false)
  })
})

describe('FORM_LIMITS', () => {
  it('[FE-X05-S11] 只覆蓋後端沒有上限的欄位；effectiveLimit 後端有上限就用後端的；前端的不比後端寬', () => {
    for (const key of Object.keys(FORM_LIMITS)) {
      const contract = (LIMITS as Record<string, { min: number; max: number | null } | undefined>)[key]
      expect(contract === undefined || contract.max === UNBOUNDED, `${key} 後端有上限，不該出現在 FORM_LIMITS`).toBe(true)
      if (contract) expect(FORM_LIMITS[key as keyof typeof FORM_LIMITS].min).toBeGreaterThanOrEqual(contract.min)
    }
    expect(effectiveLimit('displayName')).toBe(LIMITS.displayName)
    expect(effectiveLimit('projectTitle')).toEqual({ min: 1, max: 60 })
    expect(effectiveLimit('hoursPerWeek')).toEqual({ min: 0, max: 80 })
    expect(FORM_LIMITS.skillLength.max).toBe(40)
    expect(FORM_LIMITS.skillCount.max).toBe(10)
    expect(FORM_LIMITS.projectBody.max).toBe(2000)
  })

  it('[FE-X05-S12] 契約 schema 引用 FORM_LIMITS 被 lint 擋（只能接 LIMITS.*）', async () => {
    const eslint = new ESLint({ cwd: path.resolve(import.meta.dirname, '..') })
    const [result] = await eslint.lintText(
      `import { z } from 'zod'\nimport { FORM_LIMITS } from '@/forms/limits'\nexport const X = z.object({ t: z.string().max(FORM_LIMITS.projectTitle.max) })\n`,
      { filePath: 'src/api/contract/rest.ts' },
    )
    expect(result?.messages.filter((m) => m.ruleId === 'no-restricted-syntax').length).toBeGreaterThan(0)
  }, 30_000)
})
