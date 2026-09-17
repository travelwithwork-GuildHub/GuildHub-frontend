// `scripts/rehearsal-report.mjs` 的型別（給 `tests/` 用）。
export declare const REPORT_DIR: string
export declare const DIRTY_DIR: string
export declare function isVitestJson(json: unknown): boolean
export declare function renderReport(options: { json: unknown; shas: { backend: string; frontend: string }; now: Date; dirty: boolean }): string
export declare function finishRehearsal(options: {
  jsonPath: string
  exitCode: number | null
  signal: string | null
  shas: { backend: string; frontend: string }
  dirty: boolean
  outDir?: string
  dirtyDir?: string
  now?: Date
  random?: () => string
}): Promise<{ code: number; path: string | null; message: string }>
