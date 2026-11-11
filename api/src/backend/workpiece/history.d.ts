import { UndoStack, type StepSink, type UndoStep } from "./undo-stack.ts";
import { HostedSteps } from "./hosted-steps.ts";
import type { Workpiece } from "./workpiece.ts";
export interface HistoryOpts {
    maxQuotaBytes: number;
    /** 不可恢复失败（栈已被弃）。app 侧接：integrity 自愈 + 全量重绘 + error banner。
     *  **缺省 = 直接抛**（2026-10-13 Claude Fable 5.1）：不接就响亮红——10-10 案里 5 个测试文件把它接成空函数 / 只计数，
     *  explode 用例撞「layer gone at undo swap」整栈清空却一直绿。故意测不可恢复协议的用例显式传回调。 */
    onUnrecoverable?: (e: unknown) => void;
    /** 栈形状变化（push/undo/redo/clear/evict）。app 侧接 wp:histchange 派发。 */
    onChange?: () => void;
    /** 某步被应用（undo/redo；按 step entries 逐组件报）。app 侧接面板/画面刷新。 */
    onApplied?: (info: {
        kind: string;
        dir: "undo" | "redo";
    }) => void;
    /** 给了 = 步归宿主管（不建 UndoStack；宿主调 flip）。这种装法下 onUnrecoverable 必须给。HostedSteps 的 onChange 由建它的人接。 */
    hosted?: HostedSteps;
}
export declare class History {
    private _stack;
    private _hosted;
    private _opts;
    private _wp;
    private _open;
    private _openLabels;
    constructor(opts: HistoryOpts);
    /** 内核自带的栈（画画软件那条路）。步归宿主管时抛。 */
    get stack(): UndoStack;
    /** 交给 Workpiece 的那一面（两种装法通用）。 */
    get steps(): StepSink;
    /** 步归宿主管吗。 */
    get hosted(): boolean;
    /** 组合根装配（wp 的 ctor 需要 stack 先在 → late-bind）。 */
    attach(wp: Workpiece): void;
    /** 一个 undo 整点：fn 里直写 v2 组件 verb；本方法只管共享令牌的开/续/封。
     *  checkpoint:false = 留开聚合微步（语义同旧 run/withPoint）；hint = step 的非权威附注。 */
    withPoint<T>(label: string | undefined, o: {
        checkpoint?: boolean;
        hint?: (dir: "undo" | "redo") => void;
    } | undefined, fn: () => T): {
        ok: boolean;
        value?: T;
        msg?: string;
    };
    /** 手势结束：把开着的微步令牌封口。 */
    sealCheckpoint(): void;
    undo(): boolean;
    redo(): boolean;
    /** 下一次撤销 / 重做要翻的是哪个操作（界面那一层预先问门用；没有可翻的 → undefined）。 */
    peekLabel(dir: "undo" | "redo"): string | undefined;
    /**
     * 步归宿主管：宿主的栈走到这一步时调。方向内核自己认（HostedSteps.directionOf）。
     * 令牌开着 / 顺序不对 / 不是这件作品的活步 → StepOrderError（什么都不碰，不算不可恢复，原样抛给宿主）；
     * 写门不让（这幅画锁着；拿这一步的标签问）→ false，什么都不碰；swapRecord 抛 → 不可恢复（弃令牌、HostedSteps.clear → 宿主收到 onReset、onUnrecoverable）→ false。
     */
    flip(step: UndoStep): boolean;
    private _flip;
    canUndo(): boolean;
    canRedo(): boolean;
    get depth(): number;
    quotaUsage(): number;
    /** 弃整栈（换文档/不可恢复）。开着的令牌弃置（不回滚——load 流里层可能已换血）。 */
    clear(): void;
    private _req;
    private _openLabel;
    private _commitOpen;
    private _translateApplied;
    private _unrecoverable;
}
