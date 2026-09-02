export type PressureDoubt = "pen-flat" | "absolute-mouse";
export interface ProbeSample {
    pointerType: string;
    pressure: number;
    buttons: number;
    x: number;
    y: number;
    t: number;
    /** getCoalescedEvents()[0] 的位置（有则用来区分「连续快甩」与「瞬移」）；可给 thunk 懒取。 */
    coalescedFirst?: {
        x: number;
        y: number;
    } | null | (() => {
        x: number;
        y: number;
    } | null);
}
export interface ProbeOpts {
    /** absolute-mouse 只在 Windows 判（Windows Ink 是 Windows 专属机制；别处瞬移无处方可开）。 */
    windows: boolean;
}
export declare const PEN_FLAT_MIN_SAMPLES = 24;
export declare const PEN_FLAT_MIN_PATH_PX = 60;
export declare const PEN_FLAT_EPS = 0.0001;
export declare const JUMP_MIN_PX = 250;
export declare const JUMP_MIN_GAP_MS = 100;
export declare const JUMP_COUNT = 2;
export declare class PressureProbe {
    private readonly _opts;
    private _pen;
    private _mouseLast;
    private _jumps;
    private _verdict;
    constructor(opts: ProbeOpts);
    /** 已出过判定（停摆）。 */
    get verdict(): PressureDoubt | null;
    get jumps(): number;
    /** 每个 pointermove（含 hover）喂一次。返回判定（一次性，之后恒 null）。 */
    observeMove(pointerId: number, s: ProbeSample): PressureDoubt | null;
    /** pointerup / pointercancel 喂一次（pen-flat 在整笔结束时判）。 */
    observeUp(pointerId: number, s?: ProbeSample): PressureDoubt | null;
    /** 光标离开画布 / 窗口失焦 / 页面隐藏：瞬移基线作废（OS 搬光标不算证据）。 */
    resetBaseline(): void;
    private _penMove;
    private _mouseMove;
}
/** 浏览器适配：PointerEvent → ProbeSample（唯一碰 DOM 形状的地方；input.ts 一行调用）。 */
export declare function sampleFromPointerEvent(e: PointerEvent): ProbeSample;
/** Windows 平台判定（UA-CH 优先，UA 字符串兜底）。 */
export declare function isWindowsPlatform(nav?: {
    userAgentData?: {
        platform?: string;
    };
    userAgent?: string;
} | undefined): boolean;
