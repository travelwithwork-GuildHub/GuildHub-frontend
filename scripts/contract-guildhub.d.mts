// `scripts/contract-guildhub.mjs` 的型別（給 `tests/` 用）。
export declare class WrapperError extends Error {}
export declare function portInUse(port: number, host?: string): Promise<boolean>
export declare function preflight(options: { backendDir: string | undefined; port: number; testUrl: string | undefined; devUrl?: string | undefined }): Promise<{ runSh: string }>
