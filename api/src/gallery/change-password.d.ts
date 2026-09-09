export declare const REKEY_OK: ReadonlySet<string>;
export interface ChangePasswordDeps {
    /** 本机有字节的加密件（库全名）。 */
    targets: string[];
    oldPassword: string;
    newPassword: string;
    rekey: (name: string, newPassword: string) => Promise<{
        status: string;
    }>;
    /** 显式登记「这件用 pw」（不许做等于全局的短路）。 */
    rememberFilePassword: (name: string, pw: string) => void;
    forgetFilePassword: (name: string) => void;
    /** 提交新密码：verifier + 全局内存密码。只在 targets 登记完旧钥之后调、rekey 之前调。 */
    commitNewPassword: (pw: string) => Promise<void>;
    onProgress?: (done: number, total: number, name: string) => void;
    onError?: (name: string, e: unknown) => void;
}
export interface ChangePasswordReport {
    moved: string[];
    kept: {
        name: string;
        status: string;
    }[];
}
export declare function runChangePassword(d: ChangePasswordDeps): Promise<ChangePasswordReport>;
