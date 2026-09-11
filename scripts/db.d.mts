// `scripts/db.mjs` 的型別（給 `tests/` 用）。
export declare class DbScriptError extends Error {}
export declare const FRONTEND_HEADER: string
export declare const ENDPOINT_PARAMS: string[]
export declare function assertLoopback(url: string): URL
export declare function schemaFiles(dir?: string): Promise<string[]>
export declare function reset(options: { url: string; init?: boolean; dir?: string }): Promise<string[]>
export declare function seed(options: { url: string }): Promise<void>
