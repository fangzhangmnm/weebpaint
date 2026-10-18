import type { PasswordKeeper } from "@internal/encryption";
export interface RememberDeps {
    keeper: () => PasswordKeeper;
    /** verifier 在不在（跟账号走的 synced collection）。 */
    hasVerifier: () => boolean;
    /** 这把是不是统一图库密码（password-verifier.checkVerifier）。 */
    checkVerifier: (pw: string) => Promise<"ok" | "bad" | "none">;
    /** 把验过的密码送进内存（crypto-state.setPassword）。 */
    setPassword: (pw: string) => void;
    onError: (e: unknown) => void;
    /** 面板勾了、记上了（UI 说一句记到哪天）。 */
    onRemembered?: (expiresAt: number) => void;
    now?: () => number;
}
/** 组装点调一次；测试再调一次换成内存版（会清掉状态）。 */
export declare function wireRememberPassword(deps: RememberDeps): void;
export declare function rememberedUntil(): number | null;
export declare function onRememberChange(cb: () => void): () => void;
/** 密码面板交回勾态（取消 = false）；重开面板时按它预勾。 */
export declare function setRememberChoice(v: boolean): void;
export declare function rememberChoice(): boolean;
/** 开页：试记着的密码。"unlocked" | "none"（没记 / 没 verifier 可比）| "stale"（对不上，已忘）。 */
export declare function restoreRemembered(): Promise<"unlocked" | "none" | "stale">;
/** 忘掉（幂等；在飞的那次直接复用）。 */
export declare function forgetRemembered(): Promise<void>;
