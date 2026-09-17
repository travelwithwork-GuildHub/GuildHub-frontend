// `scripts/contract-guildhub.mjs` 的型別（給 `tests/` 用）。
export declare class WrapperError extends Error {}
export declare function portInUse(port: number, host?: string): Promise<boolean>
export declare function preflight(options: { backendDir: string | undefined; port: number; testUrl: string | undefined; devUrl?: string | undefined }): Promise<{ runSh: string }>

export type Suite = 'contract' | 'rehearsal'
export declare function parseSuite(argv: string[]): { suite: Suite; rest: string[] }
export interface RunDeps {
  preflight: typeof preflight
  reset: (options: { url: string }) => Promise<unknown>
  spawn: (...args: unknown[]) => unknown
  finish: (options: Record<string, unknown>) => Promise<{ code: number; path: string | null; message: string }>
}
export declare function run(options: {
  argv: string[]
  env: Record<string, string | undefined>
  deps: RunDeps
  io?: { log: (m: unknown) => void; error: (m: unknown) => void }
}): Promise<number>
