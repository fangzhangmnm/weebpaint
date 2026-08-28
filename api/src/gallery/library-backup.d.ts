/** 备份 zip 的内存护栏（超过就不再往包里塞，剩下的逐件下载）。常量可调。 */
export declare const BACKUP_BUDGET_BYTES: number;
/** 清单里的一件（size 只是列举给的估值，可能缺；真预算用读到的字节算）。 */
export interface BackupFileRef {
    path: string;
    size?: number;
}
/** watchFolder 快照的**结构型**端口（刻意不 import 库类型：本模块零 store 依赖）。 */
export interface WatchSnapshot {
    path: string;
    items: {
        path: string;
        size?: number;
    }[];
    folders: string[];
    complete: boolean;
    stale?: true;
}
export type WatchFolderFn = (folder: string, cb: (s: WatchSnapshot) => void) => () => void;
/** 一夹的一次性快照结果。authoritative:false = 这夹没拿到权威帧（离线/未登录/列举失败），清单可能缺项。 */
export interface FolderProbe {
    path: string;
    files: BackupFileRef[];
    folders: string[];
    authoritative: boolean;
}
/** 订阅 → 一次性快照。退出条件（先到先算）：
 *  · 收到权威帧（complete && !stale）——正常在线路径，一次云列举就返回；
 *  · 收到 ≥2 帧（库的两帧节律：本地帧 + 云端帧都到齐了）——离线/未登录时云端帧 complete:false，就是终局；
 *  · settleMs 内没有新帧 / 超过 timeoutMs —— 兜底，拿手上最后一帧诚实返回（authoritative:false）。
 *  无论走哪条都**必定退订**（备份绝不留下常驻订阅）。 */
export declare function snapshotFolderOnce(watch: WatchFolderFn, folder: string, opts?: {
    settleMs?: number;
    timeoutMs?: number;
}): Promise<FolderProbe>;
/** 全库清单。partialFolders = 没拿到权威帧的夹（诚实性：清单可能缺项，UI 要说出来）。 */
export interface LibraryManifest {
    files: BackupFileRef[];
    partialFolders: string[];
    foldersVisited: number;
    truncated: boolean;
}
/** 逐夹快照 → 全库扁平清单（BFS；同 path 去重、子夹去重防环、maxFolders 兜住病态深树）。 */
export declare function walkLibrary(probe: (folder: string) => Promise<FolderProbe>, opts?: {
    root?: string;
    maxFolders?: number;
    onFolder?: (folder: string, visited: number) => void;
}): Promise<LibraryManifest>;
/** 累计字节预算。admit 返 "spill" = 这件（及之后全部）不进 zip，改逐件下载。
 *  一旦溢出就**不再回头**——包一旦封顶就是封顶，别让小文件插队造成「有的进包有的没进」的迷惑顺序。 */
export declare function createByteBudget(budget: number): {
    admit(bytes: number): "zip" | "spill";
    used(): number;
    spilling(): boolean;
};
/** 备份包文件名 = weebpaint-backup-YYYYMMDD-HHMM.zip（复用命名器官的下载分钟戳）。 */
export declare const backupArchiveName: (now?: Date) => string;
/** 溢出逐件下载时的落地名：路径分隔符压成 `_`，保住来源夹（不同夹同名不会互相盖）。 */
export declare const spillName: (path: string) => string;
export interface BackupPorts {
    /** 取一件的 at-rest 字节（加密件应给密文；拿不到 → null，进失败清单）。 */
    readBytes(path: string): Promise<Blob | null>;
    /** 打包（宿主接 zip.ts 的 zipPack，STORE 不压缩——ora/png 本就是压缩流）。 */
    pack(entries: {
        path: string;
        data: Blob;
    }[]): Promise<Blob>;
    /** 交付一个 blob 给用户（宿主接 triggerDownload）。 */
    deliver(blob: Blob, filename: string): void;
    onProgress?(done: number, total: number, path: string): void;
    /** 单件失败的诊断出口（不打断整批）。 */
    onError?(path: string, err: unknown): void;
}
export interface BackupReport {
    total: number;
    zipped: number;
    spilled: number;
    failed: string[];
    bytes: number;
    archiveName: string | null;
    overBudget: boolean;
}
/** 逐件取字节 → 进包或溢出下载 → 最后封包交付。整个过程只读。 */
export declare function runLibraryBackup(files: BackupFileRef[], ports: BackupPorts, opts?: {
    budget?: number;
    now?: Date;
}): Promise<BackupReport>;
