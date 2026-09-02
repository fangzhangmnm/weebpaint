export interface PwaShellDeps {
    /** 有新版本 → 请消费者弹通知（2026-09-02 C7：壳不碰 toast DOM；app 接 ui/notice）。 */
    showUpdateNotice: (h: {
        onReload: () => void;
        onDismiss: () => void;
    }) => void;
    envChip: HTMLElement | null;
    onBeforeReload: () => Promise<void>;
    onForeground: () => void;
}
export declare class PwaShell {
    d: PwaShellDeps;
    reg: ServiceWorkerRegistration | null;
    dismissed: boolean;
    constructor(d: PwaShellDeps);
    show(): void;
    _reload(): Promise<void>;
    init(): void;
}
