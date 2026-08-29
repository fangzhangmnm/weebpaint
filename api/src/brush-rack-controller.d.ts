import { type RackMeta } from "./brushes.ts";
import { mountBrushSettings } from "./ui/brush-config-view.ts";
import type { Brush, BrushRackData } from "./brush-types.ts";
import type { EditorRuntimeState, DialReactive, ToolDial } from "./app-context.ts";
import type { EditMode } from "./edit-mode.ts";
import type { ReconcileResult } from "@internal/store";
/** 笔架持久化条目（结构同 CollectionEntry，免耦合库类型——brushes.ts CollectionLike 同款先例）。 */
export interface RackEntry {
    id: string;
    uat: number;
    value: unknown;
}
/** 笔架持久化 port（A2 收敛终案 2026-08-28：**脑定义窄接口，器官实现**）：
 *  ①挂库 = gallery collection（结构满足零适配——per-gallery 同步/LWW 语义真实存在，是 store 的正当业务）；
 *  ②无库 = device-rack-slot（IDB 单槽，「reload 不丢」user 唯一拍板）；③无地平台 = slot 自动纯内存降级。
 *  reconcileWithRemote **可缺席**——只有真云器官有远端可对；缺的能力就是接口上的缺席，不装死
 *  （否决案：「memory/兜底 store」= null-store 转世；store 单一职责=同步引擎不做容器，user 0828）。 */
export interface RackPersistence {
    init(): Promise<void>;
    entries(): RackEntry[];
    getItem<V>(id: string, def?: V | (() => V)): V | undefined;
    setItem(id: string, value: unknown): void;
    deleteItem(id: string): void;
    onChange(cb: (changedIds: string[]) => void): () => void;
    flushLocal(): Promise<{
        ok: boolean;
        error?: unknown;
    }>;
    reconcileWithRemote?(): Promise<ReconcileResult>;
}
export interface BrushRackDeps {
    collection: RackPersistence;
    state: EditorRuntimeState;
    dialReactive: DialReactive;
    editMode: () => EditMode;
    setStatus: (text: string, persist?: boolean) => void;
    confirm: (title: string, msg: string) => Promise<boolean>;
    openExclusive: (id: string) => void;
    closeExclusive: () => void;
    registerPanel: (id: string, h: {
        show: () => void;
        hide: () => void;
    }) => void;
    isSignedIn: () => boolean;
    isOnline: () => boolean;
}
interface RackEls {
    mount: HTMLElement;
    title: HTMLElement;
    sheet: HTMLElement;
    close: HTMLElement;
    newBtn: HTMLElement;
    importBtn: HTMLElement;
    refreshBtn?: HTMLElement;
    exportFolderBtn?: HTMLElement;
    resetBtn?: HTMLElement;
    dumpCodeBtn?: HTMLElement;
}
interface SettingsEls {
    view: HTMLElement;
    body: HTMLElement;
    save: HTMLElement;
    cancel: HTMLElement;
}
export interface BrushRackUI {
    els: {
        rack: RackEls;
        settings: SettingsEls;
    };
    blendModes: Record<string, string>;
    RACK_PANEL_BY_TOOL: Record<string, string>;
}
export declare class BrushRackController {
    d: BrushRackDeps & BrushRackUI;
    ui: {
        tool: string;
        folder: string;
    };
    _editingId: string | null;
    _editingDraft: Brush | null;
    _bulkWrite: boolean;
    _settingsUI: ReturnType<typeof mountBrushSettings> | null;
    constructor(deps: BrushRackDeps);
    _brushesRef: import("../vendor/vue/vue.esm-browser.prod.js").Ref<Brush[]>;
    _metaRef: import("../vendor/vue/vue.esm-browser.prod.js").Ref<RackMeta>;
    _syncFromCollection(): void;
    _view(): BrushRackData;
    _meta(): RackMeta;
    get(): BrushRackData;
    _loadPromise: Promise<BrushRackData> | null;
    load(): Promise<BrushRackData>;
    _load(): Promise<BrushRackData>;
    _healBuiltinNames(): Promise<void>;
    _healTimer: ReturnType<typeof setTimeout> | null;
    _healAttempt: number;
    _healOnline: (() => void) | null;
    static HEAL_DELAYS_MS: number[];
    _healEmptyRack(): Promise<void>;
    _scheduleHeal(): void;
    _stopHeal(): void;
    /** collection → 笔架的**唯一**绑定。本地写和云端写在 store 层已一视同仁，这里也不分。
     *  放在 load()（数据层）而非 init()（要 DOM）：绑定与 UI 无关，且这样才能 node 测。 */
    subscribeToCollection(): void;
    reconcileWithRemote(): Promise<ReconcileResult | null>;
    /** P3 热插拔：换库后重挂新 collection（app.ts 在 wp:gallery-changed 里调，传新的 brushRackCollection）。
     *  旧 collection 已随旧 store dispose——旧 onChange 订阅从此永不 fire，随它 GC；镜像/自愈/初值全按新库重走。 */
    rebind(collection: RackPersistence): Promise<void>;
    getRackToolKey(tool: string): string;
    defaultToolStateFor(tool: string): {
        size: number;
        opacity: number;
        activeBrushId: string;
        activeBrushName: string;
    } | {
        size: number;
        opacity: number;
        activeBrushId: null;
        activeBrushName: null;
    };
    findToolBrush(ts: ToolDial | null | undefined): Brush | null;
    findToolBrushPure(ts: ToolDial | null | undefined): Brush | null;
    resolveActiveBrushPure(ts: ToolDial | null | undefined, tool: string): Brush | null;
    applyToolState(tool: string): void;
    writeCurrentToolSize(v: number): void;
    writeCurrentToolOpacity(v: number): void;
    selectBrushPresetForTool(tool: string, brushId: string): void;
    showSheet(tool: string): void;
    hideSheet(): void;
    restoreBuiltins(): Promise<number>;
    /** @param silent 后台自愈用：失败只 log，不弹 banner（首开离线是良性场景）。 */
    _restoreBuiltins(silent?: boolean): Promise<number>;
    _nextBrushName(): string;
    _deriveBrushName(srcName: string): string;
    openBrushSettings(brushId: string, newDraft?: Brush): void;
    closeBrushSettings(save: boolean): void;
    _ensureMetaPlacement(id: string, folder: string): void;
    deleteEditingBrush(): Promise<void>;
    moveBrushToFolder(id: string, folder: string): void;
    init(ui: BrushRackUI): void;
    _onNewBrush(): void;
    _onImport(): void;
}
export {};
