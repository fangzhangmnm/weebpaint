export interface WatchdogTimers {
    set(fn: () => void, ms: number): unknown;
    clear(handle: unknown): void;
}
export interface FirstFrameWatchdog {
    arm(folder: string): void;
    frame(folder: string): void;
    cancel(): void;
    isArmed(): boolean;
}
export declare function createFirstFrameWatchdog(onStall: (info: {
    folder: string;
    elapsedMs: number;
}) => void, opts?: {
    timeoutMs?: number;
    timers?: WatchdogTimers;
    now?: () => number;
}): FirstFrameWatchdog;
