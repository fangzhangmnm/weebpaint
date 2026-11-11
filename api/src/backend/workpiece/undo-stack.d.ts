export type RecordData = unknown;
export interface WorkpieceComponent {
    /** "layerTree" | "layerTiles" | … 开放集（onChange 事件的 kind）。 */
    readonly kind: string;
    /** 自反 swap：应用 data（undo 倒序调、redo 正序再调一次），返回反向包。同步、不失败。 */
    swapRecord(data: RecordData): RecordData;
    /** 配额估计（字节）。tile 按压缩后/refCount，规则沿旧栈。 */
    recordBytes(data: RecordData): number;
    /** 驱逐/清栈/cancel 释放 record 持有的资源（tile 句柄引用计数 −1 等）。 */
    disposeRecord(data: RecordData): void;
}
export interface UndoStep {
    /** 栈分配的单调 id（永不复用）= stateVersion 的锚。 */
    readonly id: number;
    /** apply 时 data 被 swap 成反向包（entries 数组本身不换，data 字段换）。 */
    entries: {
        c: WorkpieceComponent;
        data: RecordData;
    }[];
    label?: string;
    /** 非权威附注（ADR-0008 §7 三纪律）：栈应用完 entries 后调；只捕原始值/小 plain object。 */
    hint?: (dir: "undo" | "redo") => void;
}
/** push 入参：id 由栈分配（唯一 id 权威），其余字段同 UndoStep。 */
export type UndoStepInput = Omit<UndoStep, "id">;
export interface UndoStackOpts {
    maxQuotaBytes: number;
    /** 栈形变（push/undo/redo/clear/evict）。app 侧接按钮态/编辑门。 */
    onChange?: () => void;
    /** 某步被 undo/redo 应用。app 侧接状态栏 toast + 面板刷新。 */
    onApplied?: (step: UndoStep, dir: "undo" | "redo") => void;
}
/** Workpiece 协作面（_bindWorkpiece 注入；见 workpiece.ts）。 */
export interface StackWorkpieceHooks {
    /** undo/redo 入口先调：开着的令牌下禁 undo（throw）。 */
    beforeApply(): void;
    /** 某步应用完（hint 之后）：commitVersion++ + 组件变更信号。 */
    afterApply(step: UndoStep, dir: "undo" | "redo"): void;
}
/**
 * Workpiece 用的那一面（UndoStack 和 HostedSteps 共有）：独占绑定、收一步、报「现在停在哪一步」、清空。
 * 2026-11-10（贴图主线 0-2，Claude Opus 5.5）：步可以存在内核自己的栈里（UndoStack），也可以交给宿主的栈去存（hosted-steps.ts HostedSteps）。
 */
export interface StepSink {
    _bindWorkpiece(hooks: StackWorkpieceHooks): void;
    push(step: UndoStepInput): void;
    cursorStepId(): number;
    clear(): void;
}
/**
 * 翻一步（全仓只有这一处，守卫钉）：undo = entries 倒序 swapRecord，redo = 正序再调一次（swap 自反）。只翻数据；游标、hint、通知归调用的栈。
 * swapRecord 抛 = 状态不可信，原样传播（不可恢复协议在 History）。
 */
export declare function applyStep(step: UndoStep, dir: "undo" | "redo"): void;
export declare class UndoStack implements StepSink {
    private _steps;
    private _cursor;
    private _baseId;
    private _nextId;
    private _opts;
    private _hooks;
    constructor(opts: UndoStackOpts);
    /** 独占绑定（一个栈只服务一个 workpiece；重复绑定 = 装配 bug）。 */
    _bindWorkpiece(hooks: StackWorkpieceHooks): void;
    /** 由 WriteToken.commit 调，app 不直调。截断 redo 段 → 入栈 → 配额驱逐。 */
    push(step: UndoStepInput): void;
    undo(): boolean;
    redo(): boolean;
    canUndo(): boolean;
    canRedo(): boolean;
    /** 下一次 undo / redo 要翻的那一步的标签（没有可翻的 / 那一步没带标签 → undefined）。只读，给写门按操作分类用。 */
    peekLabel(dir: "undo" | "redo"): string | undefined;
    /** 游标位置身份 = stateVersion（栈底 = _baseId，初始 0）。 */
    cursorStepId(): number;
    /** 栈内步数（驱逐观测/调试）。 */
    depth(): number;
    /** 全量重扫（压缩会让单步 usage 变，不缓存）。 */
    quotaUsage(): number;
    /** 弃整栈（换文档 load 后调；load 随后 markSaved → 位置身份归 0 起步）。 */
    clear(): void;
    private _evictToQuota;
    private _disposeStep;
}
