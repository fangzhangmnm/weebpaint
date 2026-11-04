import { type GateHandle } from "./gate-stack.ts";
export declare function openInputSheet(title: string, defaultValue?: string, opts?: {
    placeholder?: string;
    password?: PasswordMode;
    message?: string;
    account?: string;
}): Promise<string | null>;
/** 同上，多一个可选的勾（2026-10-17「在这台设备上记住密码」）：勾态随结果返回；取消 = null。 */
/** 密码态：true / "current" = 输入已有口令（autocomplete=current-password）；"new" = 设 / 换口令（new-password，密码管理器问「更新？」）。 */
export type PasswordMode = boolean | "current" | "new";
export declare function openInputSheetEx(title: string, defaultValue?: string, { placeholder, password, message, checkbox, account }?: {
    placeholder?: string;
    password?: PasswordMode;
    message?: string;
    checkbox?: {
        label: string;
        checked?: boolean;
    };
    account?: string;
}): Promise<{
    value: string;
    checked: boolean;
} | null>;
export declare function openConfirmSheet(title: string, message: string): Promise<boolean>;
export declare function openChoiceSheet<T>(title: string, message: string, choices: {
    label: string;
    value: T;
    primary?: boolean;
    onPick?: () => void;
}[]): Promise<T | null>;
interface SyncGateAction<T = string> {
    label: string;
    value: T;
    primary?: boolean;
    onPick?: () => void;
}
interface SyncGateOpts<T = string> {
    title: string;
    message: string;
    showSpinner?: boolean;
    actions: SyncGateAction<T>[];
    note?: string;
    quietStart?: boolean;
}
export declare function lockSyncGate<T = string>(opts: SyncGateOpts<T>): Promise<T>;
/** 要自己收（闸门的罩子、拉取罩子）：拿句柄，别用 settleSyncGate（那个收的是最上面那张，不一定是你的）。 */
export declare function openSyncGate<T = string>(opts: SyncGateOpts<T>): GateHandle<T>;
export declare function isSyncGateUp(): boolean;
export declare function unlockSyncGate(): void;
export declare function settleSyncGate(value: unknown): void;
export {};
