import { type DecodedPainting } from "./backend/ora.ts";
import type { EncryptedBlob } from "./app-store.ts";
import { type LocalFileHandle } from "./local-file-session.ts";
import { type RingEntryMeta } from "./checkpoint-policy.ts";
import type { AppContext } from "./app-context.ts";
import type { GalleryItem } from "./gallery/gallery-model.ts";
type LoadedDoc = DecodedPainting;
declare function beginTransientBlank(): void;
/** 崩溃快照恢复为 transient（云关语境专用——云开走 adoptAsNew 进图库）：装入字节但**不安家**
 *  （云关的图库不可见，落进去=数据蟑螂旅馆），恢复出的 doc 立即标脏 + 重新挂 T-crash 保护，
 *  用户经 settle 存成文件。es 不绑（残影墙同 openLocalFile：_esMuted 立墙防跨写）。 */
declare function adoptAsTransient(loaded: LoadedDoc, displayName: string): void;
/** 打开本地 .ora：明文 + 有 WeebPaint 痕迹 → 原位打开（返回 null）；
 *  加密容器 / 外来 ora → 不原位，把 File 还给调用方走导入路径（返回 File）。 */
declare function openLocalFile(handle: LocalFileHandle): Promise<File | null>;
/** 离开 file/transient 家（回图库/开别的画/新建/导入前必过的门；P2 起 = 三键挽留：保存/丢弃/取消）。
 *  脏 → 问；取消 → false（调用方中止）。file 家保存=写回；transient 保存=settle 安家仪式
 *  （settle 落 download=责任移交未安家 → 同样不放行离开，用户要么 FSA 真安家要么显式丢弃）。
 *  ⚠ 只清家，**不清 _esMuted**——残影墙要等 es 重新绑定身份（_esRebound）才解除。 */
declare function leaveLocalDoc(): Promise<boolean>;
/** 外部导入：装入一个解好的 doc，作为**新身份**。首存 mode:"new"（撞名抛，不静默覆盖）。 */
declare function adoptAsNew(loaded: LoadedDoc, name: string): void;
/** A1（user 2026-08-28 拍板 a）：挂库成功后，开着的 transient 画自动安家进新图库——
 *  「有库时新画自动创建身份」既有拍板的延伸：连接图库的手势就是安家意图，不再问。
 *  file 家不动（已有家）；无开画/gallery 家 = no-op。返回新身份名（null = 无事可做）。 */
declare function adoptTransientIntoGallery(): Promise<string | null>;
/** revert 回滚：装入一个解好的 doc，身份**不变**（首存 mode:"existing"，就是要写回原文件）。
 *  **不封存 checkpoint** —— 否则刚回滚掉的状态立刻把快照覆盖了，只能 revert 一次。 */
declare function adoptAsExisting(loaded: LoadedDoc, name: string): void;
/** 当前 doc 的 revert 列表（新→旧）。gallery 家按户口、file 家按行李牌；
 *  ring 空且 gallery 家 → legacy v1 单槽兜底（升级窗口期已开着的画还能「回到打开时」）。 */
declare function _listCheckpoints(): Promise<RingEntryMeta[]>;
/** 按 id 读回一档。加密的先解壳（内存密码；锁定/错密码 → null 由调用方提示要密码）。 */
declare function _readCheckpointEntry(id: string): Promise<{
    blob: Blob;
    at: number;
} | null>;
/** undo revert（拍板：revert 前自动拍当前态一档）。gallery 家：先 flush 再取 at-rest（加密=密文，红线安全）；
 *  file 家：live encode 直接进 ring（明文件；**不写用户磁盘**——写回是显式动作，pre-revert 不是）。 */
declare function capturePreRevert(): Promise<void>;
/** 作品被删/改名 → 丢掉它的快照（legacy 单槽 + 整份 ring；按 docKey 精确清）。 */
declare function _dropCheckpoint(name: string): Promise<void>;
declare function _gateFillOnSwitch(): Promise<boolean>;
declare function saveNow(opts?: {
    implicit?: boolean;
    commitPending?: boolean;
}): Promise<void>;
declare function saveAndPush(): Promise<void>;
declare function encryptCurrent(): Promise<void>;
declare function decryptCurrent(): Promise<void>;
declare function renameCurrentSession({ suggested, reason }?: {
    suggested?: string;
    reason?: string;
}): Promise<string | null | undefined>;
declare function exitCanvasToGallery(): Promise<void>;
declare function newDoc({ name, w, h, layer0Name, layer0Pixels }: {
    name: string;
    w: number;
    h: number;
    layer0Name?: string;
    layer0Pixels?: Uint8ClampedArray;
}): Promise<boolean>;
/** 无库「新建」（#22 打扫屋子 2026-08-28）：transient 家新画布（选定尺寸；不上户口不落盘——
 *  doodle consent transient 拍板；T-crash 盲快照 + 三键挽留照常护；es 在无库本就 inert 不换绑）。 */
declare function newTransientDoc({ w, h }: {
    w: number;
    h: number;
}): Promise<boolean>;
declare function openItem(item: GalleryItem): Promise<void>;
declare function pushItem(item: GalleryItem): Promise<void>;
declare function unloadItem(item: GalleryItem): Promise<void>;
declare function restoreSession(name: string): Promise<boolean>;
declare function beginLazyBlank(): void;
declare function saveAs(newName: string): Promise<void>;
declare function refreshOpenDoc(): Promise<void>;
declare function setName(name: string | null, opts?: {
    persist?: boolean;
}): void;
export declare const session: {
    enc: {
        encrypted: boolean;
    };
    encryptCurrent: typeof encryptCurrent;
    decryptCurrent: typeof decryptCurrent;
    /** doc 的家（P1 2026-08-26，唯一身份读面）：null=无 doc（图库态）。消费点 switch home.kind
     *  （exhaustive + assertNever）——旧 `session.name`/`session.localFile` 已私有化，别加回来：
     *  两个平行可选字段就是当年「无地双墙」一类事故的温床，联合类型让错分支在编译期死。 */
    readonly home: Readonly<import("./doc-home.ts").DocHome> | null;
    readonly loadingDoc: boolean;
    readonly loadedDocIsNewer: boolean;
    readonly loadedDocNewerConfirmed: boolean;
    readonly dirty: boolean;
    readonly pushPending: boolean;
    readonly saving: boolean;
    openLocalFile: typeof openLocalFile;
    leaveLocalDoc: typeof leaveLocalDoc;
    markEdited(): void;
    setName: typeof setName;
    restore: typeof restoreSession;
    saveAs: typeof saveAs;
    beginLazyBlank: typeof beginLazyBlank;
    beginTransientBlank: typeof beginTransientBlank;
    newTransientDoc: typeof newTransientDoc;
    refreshOpenDoc: typeof refreshOpenDoc;
    gateFillOnSwitch: typeof _gateFillOnSwitch;
    save: typeof saveNow;
    saveAndPush: typeof saveAndPush;
    adoptAsNew: typeof adoptAsNew;
    adoptAsExisting: typeof adoptAsExisting;
    adoptAsTransient: typeof adoptAsTransient;
    adoptTransientIntoGallery: typeof adoptTransientIntoGallery;
    rename: typeof renameCurrentSession;
    exit: typeof exitCanvasToGallery;
    newDoc: typeof newDoc;
    open: typeof openItem;
    push: typeof pushItem;
    unload: typeof unloadItem;
    /** 当前作品的 at-rest **密文**字节（原样，不解壳、不要密码）。非加密件 → null。
     *  先 saveNow()：at-rest 字节是「上次保存」的内容，不先落盘就会导出成旧版本。 */
    readEncryptedBytes(): Promise<EncryptedBlob | null>;
    /** 当前 doc 的完整 .ora 字节（**明文**；2026-08-21「导出与另存」hub 的「存为本地 .ora」用）。
     *  与显式保存同一落盘形（_encodeCurrentOraWithPeek：meta+timelapse+mergedimage）；加密作品也出
     *  明文——内存本就是解密态，入口 sheet 文案已说清。纯导出副本：不落库、不碰 es/_fileHome() 身份。 */
    encodeCurrentOra(): Promise<Blob>;
    listCheckpoints: typeof _listCheckpoints;
    readCheckpointEntry: typeof _readCheckpointEntry;
    capturePreRevert: typeof capturePreRevert;
    dropCheckpoint: typeof _dropCheckpoint;
    /** file 家 revert：内容换成快照、**家不变**（handle/牌照旧）、标脏（revert=相对磁盘的内容变化）。 */
    adoptIntoCurrentFileHome(loaded: LoadedDoc): void;
    awaitCloudPushIdle: () => Promise<void>;
};
export declare function initSession(ctx: AppContext): void;
export declare function setSessionGallery(g: AppContext["gallery"]): void;
export {};
