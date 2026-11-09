/** app 的编辑引擎暴露给 editor-session 的最小面。本模块不懂内容，只调这几个。 */
export interface EditorAdapter {
    adopt(bytes: Blob): Promise<void>;
    onChange(cb: () => void): void;
    encode(): Promise<{
        bytes: Blob;
        peek?: Blob | null;
    }>;
    onSaved?(name: string): void;
    mayWrite?(): boolean;
    editLocked?(name: string): boolean;
}
/** 锁着的文档被要求保存（见 EditorAdapter.editLocked）。app 层响亮报出来；人解锁之后再存，内存里的改动还在。 */
export declare class EditLockedError extends Error {
    identifier: string;
    constructor(identifier: string);
}
/** editor-session 消费的 store 最小面（结构类型；真 sync-store 天然满足，测试可 mock）。 */
export type TryMoveResult = {
    ok: true;
    where?: string;
    oldName?: string;
    oldKept?: boolean;
    oldUnknown?: boolean;
    oldCloudOrphan?: boolean;
    cloudDeferred?: boolean;
} | {
    ok: false;
    reason: "name-collision";
    where: "local" | "cloud";
};
export interface StoreLike {
    file(name: string, opts: {
        mode: "new" | "existing";
    }): {
        open(): Promise<Blob | null>;
        save(bytes: Blob, opts?: {
            tryPush?: boolean;
            hint?: unknown;
        }): Promise<{
            pushed: boolean;
            reason?: string;
            resolution?: string;
        }>;
        tryMove(to: string): Promise<TryMoveResult>;
        trash(): Promise<{
            status: string;
        }>;
    };
}
/** app-agnostic 的 autosave / push 策略（每 app 不同 → 注入）。 */
export interface LifecyclePolicy {
    autosaveMs?: number;
    pushOn?: Array<"exit" | "blur" | "idle">;
    idleMs?: number;
}
export interface EditorSessionConfig {
    store: StoreLike;
    editor: EditorAdapter;
    policy?: LifecyclePolicy;
}
export interface EditorSession {
    open(name: string): Promise<boolean>;
    adopted(name: string, opts?: {
        create?: boolean;
    }): void;
    markDirty(): void;
    flushLocal(): Promise<void>;
    flushAndPush(): Promise<void>;
    forceSaveAndPush(): Promise<void>;
    rename(newName: string): Promise<TryMoveResult>;
    delete(): Promise<void>;
    currentName(): string | null;
    isDirty(): boolean;
    isPushPending(): boolean;
    /** 人按过存、当时没推成、之后没再改。回来时可以自动续传（完成已有的同意，ADR-0018）；只是编辑过、自动保存过的不算。 */
    isPushOwed(): boolean;
    /** 当前这份是刚新建、还没首存的（首存走 mode:"new"）。它还不存在于库里，谈不上锁着。 */
    isCreatePending(): boolean;
    /** 库替这份推上去了（回来问一次 → dirty.pushAll）：别再记着欠一推。内存还脏就不算。 */
    noteExternallyPushed(): void;
    start(): void;
    dispose(): void;
}
export declare function createEditorSession(config: EditorSessionConfig): EditorSession;
