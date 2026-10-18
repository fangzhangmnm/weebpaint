export declare function openInputSheet(title: string, defaultValue?: string, opts?: {
    placeholder?: string;
    password?: boolean;
    message?: string;
}): Promise<string | null>;
/** 同上，多一个可选的勾（2026-10-17「在这台设备上记住密码」）：勾态随结果返回；取消 = null。 */
export declare function openInputSheetEx(title: string, defaultValue?: string, { placeholder, password, message, checkbox }?: {
    placeholder?: string;
    password?: boolean;
    message?: string;
    checkbox?: {
        label: string;
        checked?: boolean;
    };
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
}
interface SyncGateOpts<T = string> {
    title: string;
    message: string;
    showSpinner?: boolean;
    actions: SyncGateAction<T>[];
    note?: string;
}
export declare function lockSyncGate<T = string>({ title, message, showSpinner, actions, note }: SyncGateOpts<T>): Promise<T>;
export declare function unlockSyncGate(): void;
export declare function settleSyncGate(value: unknown): void;
export {};
