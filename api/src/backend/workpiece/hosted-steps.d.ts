import { type StackWorkpieceHooks, type StepSink, type UndoStep, type UndoStepInput } from "./undo-stack.ts";
/** 宿主实现的两件事。 */
export interface StepHost {
    /** 内核封好了一步，交给宿主。宿主：先把自己还没重做的那一段丢掉（其中属于这件作品的，每一步都调 drop），再收下这一步。 */
    onStep(step: UndoStep): void;
    /** 这件作品以前的步全部作废了（装载了别的内容，或者状态不可信）。宿主把手上属于它的步都扔掉，不用再调 drop。 */
    onReset(): void;
}
/** 宿主翻步的顺序 / 对象不对（翻错顺序、别的作品的步、drop 过的、上一代的、令牌开着）。抛的时候什么都没碰过：不算不可恢复。 */
export declare class StepOrderError extends Error {
    constructor(msg: string);
}
export interface HostedStepsOpts {
    /** 收了一步 / 翻了一步 / 清空了（UndoStack 的 onChange 同义）。后端拿它数「真落了一步」；不问能不能撤销——那归宿主。 */
    onChange?: () => void;
}
export declare class HostedSteps implements StepSink {
    private _host;
    private _opts;
    private _hooks;
    private _cursor;
    private _nextId;
    private _live;
    constructor(host: StepHost, opts?: HostedStepsOpts);
    _bindWorkpiece(hooks: StackWorkpieceHooks): void;
    /** 由 WriteToken.commit 调：编号、记下前一步、「现在停在哪」挪到它、交给宿主。 */
    push(input: UndoStepInput): void;
    cursorStepId(): number;
    /** 换一代：手上记着的活步全部释放、「现在停在哪」回到 0、宿主收到 onReset。之后翻旧步 = StepOrderError。 */
    clear(): void;
    /** 这一步现在翻的话是撤销还是重做；对不上就抛 StepOrderError（什么都不碰）。History.flip 先问它、再问写门。 */
    directionOf(step: UndoStep): "undo" | "redo";
    /** 宿主的栈走到这一步时调：方向内核自己认。顺序不对 / 有写令牌开着 → StepOrderError（什么都不碰）；swapRecord 抛 → 原样传播（不可恢复，History 接）。 */
    flip(step: UndoStep): "undo" | "redo";
    /** 这一步占多少字节（宿主算配额用）。不是活步 = 0。 */
    bytes(step: UndoStep): number;
    /** 宿主不要这一步了（截断重做段、配额驱逐）：释放它的资源。同一步调第二次 / 不是活步 = 什么都不做。 */
    drop(step: UndoStep): void;
    /** 还活着的步数（测试 / 调试）。 */
    liveCount(): number;
    private _dispose;
}
