export type ErrorLevel = "error" | "warning" | "info" | "log";
/** app 在 boot 时注入状态栏 sink（info 级走这里）+ 接管全局 fatal handler。 */
export declare function initErrorBadge(deps: {
    status: (text: string, persist?: boolean) => void;
}): void;
export declare function reportError(err: unknown, level?: ErrorLevel): void;
