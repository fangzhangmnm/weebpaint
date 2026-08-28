// library-backup.ts —— #18「下载全库备份」的逻辑内核。
// created 2026-08-28 by Claude Opus 5 (subagent)。
//
// **纯模块**：零 store / 零 DOM / 零网络 —— 列举、读字节、打包、下载全是注入的端口（→ node 可测）。
//
// 为什么要自己走一遍树：store 的**唯一列举面 = files.watchFolder（订阅当前夹）**（app-store.ts 头注释 +
//   库 create-store.ts「网盘模型」）——没有也不会有全库列举 API（全树 list 是被否决的退化设计）。
//   所以「整库清单」只能逐夹一次性快照 + 递归。本模块把这条路拆成四件可测的东西：
//     ① snapshotFolderOnce —— 把订阅式「两帧节律」（立即本地帧 → 云端帧）收成一次性 Promise，拿到
//        权威帧（complete）即退订；拿不到就诚实标 authoritative:false（离线/未登录/列举失败）。
//     ② walkLibrary        —— BFS 递归成扁平清单（去重 / 防环 / 上限 / 记下列不全的夹）。
//     ③ createByteBudget   —— 累计字节预算：超了就从那一件起改「逐件下载」（内存护栏）。
//     ④ runLibraryBackup   —— 编排：逐件读字节 → 进 zip 或溢出逐件下载 → 诚实回执（失败清单不吞）。
//
// **备份是只读动作**：本模块只经 readBytes 端口读，绝不写库、绝不碰同步态。
// 加密作品给不给密文由端口侧决定（宿主接 getEncryptedBlob）——**明文永不落备份包**是红线，
//   本模块不认识内容格式，也不做任何解密。

import { downloadStamp } from "../naming.ts";

/** 备份 zip 的内存护栏（超过就不再往包里塞，剩下的逐件下载）。常量可调。 */
export const BACKUP_BUDGET_BYTES = 512 * 1024 * 1024;

/** 清单里的一件（size 只是列举给的估值，可能缺；真预算用读到的字节算）。 */
export interface BackupFileRef { path: string; size?: number; syncState?: string }   // syncState 原样透传（宿主判「备份前是否已缓存」→ 配额归还）

/** watchFolder 快照的**结构型**端口（刻意不 import 库类型：本模块零 store 依赖）。 */
export interface WatchSnapshot {
  path: string;
  items: { path: string; size?: number; syncState?: string }[];
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

const toProbe = (folder: string, snap: WatchSnapshot | null): FolderProbe => ({
  path: folder,
  files: (snap?.items ?? []).map((it) => ({ path: it.path, size: it.size, syncState: it.syncState })),
  folders: snap?.folders ?? [],
  authoritative: snap?.complete === true && snap.stale !== true,
});

/** 订阅 → 一次性快照。退出条件（先到先算）：
 *  · 收到权威帧（complete && !stale）——正常在线路径，一次云列举就返回；
 *  · 收到 ≥2 帧（库的两帧节律：本地帧 + 云端帧都到齐了）——离线/未登录时云端帧 complete:false，就是终局；
 *  · settleMs 内没有新帧 / 超过 timeoutMs —— 兜底，拿手上最后一帧诚实返回（authoritative:false）。
 *  无论走哪条都**必定退订**（备份绝不留下常驻订阅）。 */
export function snapshotFolderOnce(
  watch: WatchFolderFn,
  folder: string,
  opts: { settleMs?: number; timeoutMs?: number } = {},
): Promise<FolderProbe> {
  const settleMs = opts.settleMs ?? 800;
  const timeoutMs = opts.timeoutMs ?? 30_000;
  return new Promise<FolderProbe>((resolve) => {
    let last: WatchSnapshot | null = null;
    let frames = 0;
    let settled = false;
    let unsub: (() => void) | null = null;
    let settleTimer: ReturnType<typeof setTimeout> | null = null;
    let hardTimer: ReturnType<typeof setTimeout> | null = null;

    const finish = (): void => {
      if (settled) return;
      settled = true;
      if (settleTimer) clearTimeout(settleTimer);
      if (hardTimer) clearTimeout(hardTimer);
      // 同步首帧（测试替身）时 unsub 还没赋值 —— 推到 microtask 再退，保证不漏退订。
      const off = (): void => { try { unsub?.(); } catch { /* store 已 dispose：无所谓，本就是要退订 */ } };
      if (unsub) off(); else queueMicrotask(off);
      resolve(toProbe(folder, last));
    };
    const armSettle = (): void => {
      if (settleTimer) clearTimeout(settleTimer);
      settleTimer = setTimeout(finish, settleMs);
    };

    hardTimer = setTimeout(finish, timeoutMs);
    armSettle();
    unsub = watch(folder, (snap) => {
      if (settled) return;
      if (snap.path !== folder) return;   // 库内已有同款守卫；这里再挡一次，绝不把别夹内容算进本夹
      last = snap;
      frames++;
      if (snap.complete && snap.stale !== true) { finish(); return; }
      if (frames >= 2) { finish(); return; }
      armSettle();
    });
  });
}

/** 全库清单。partialFolders = 没拿到权威帧的夹（诚实性：清单可能缺项，UI 要说出来）。 */
export interface LibraryManifest {
  files: BackupFileRef[];
  partialFolders: string[];
  foldersVisited: number;
  truncated: boolean;   // 撞上 maxFolders 上限，树没走完
}

/** 逐夹快照 → 全库扁平清单（BFS；同 path 去重、子夹去重防环、maxFolders 兜住病态深树）。 */
export async function walkLibrary(
  probe: (folder: string) => Promise<FolderProbe>,
  opts: { root?: string; maxFolders?: number; onFolder?: (folder: string, visited: number) => void } = {},
): Promise<LibraryManifest> {
  const maxFolders = opts.maxFolders ?? 1000;
  const queue: string[] = [opts.root ?? ""];
  const seen = new Set<string>(queue);
  const byPath = new Map<string, BackupFileRef>();
  const partialFolders: string[] = [];
  let visited = 0;
  let truncated = false;
  while (queue.length) {
    if (visited >= maxFolders) { truncated = true; break; }
    const folder = queue.shift() as string;
    const p = await probe(folder);
    visited++;
    opts.onFolder?.(folder, visited);
    if (!p.authoritative) partialFolders.push(folder);
    for (const f of p.files) if (!byPath.has(f.path)) byPath.set(f.path, f);
    for (const sub of p.folders) if (!seen.has(sub)) { seen.add(sub); queue.push(sub); }
  }
  const files = [...byPath.values()].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return { files, partialFolders, foldersVisited: visited, truncated };
}

/** 累计字节预算。admit 返 "spill" = 这件（及之后全部）不进 zip，改逐件下载。
 *  一旦溢出就**不再回头**——包一旦封顶就是封顶，别让小文件插队造成「有的进包有的没进」的迷惑顺序。 */
export function createByteBudget(budget: number): {
  admit(bytes: number): "zip" | "spill";
  used(): number;
  spilling(): boolean;
} {
  let used = 0;
  let spilling = false;
  return {
    admit(bytes: number): "zip" | "spill" {
      if (spilling) return "spill";
      if (used + bytes > budget) { spilling = true; return "spill"; }
      used += bytes;
      return "zip";
    },
    used: () => used,
    spilling: () => spilling,
  };
}

/** 备份包文件名 = weebpaint-backup-YYYYMMDD-HHMM.zip（复用命名器官的下载分钟戳）。 */
export const backupArchiveName = (now: Date = new Date()): string => `weebpaint-backup-${downloadStamp(now)}.zip`;

/** 溢出逐件下载时的落地名：路径分隔符压成 `_`，保住来源夹（不同夹同名不会互相盖）。 */
export const spillName = (path: string): string => path.replace(/\//g, "_");

export interface BackupPorts {
  /** 取一件的 at-rest 字节（加密件应给密文；拿不到 → null，进失败清单）。 */
  readBytes(path: string): Promise<Blob | null>;
  /** 打包（宿主接 zip.ts 的 zipPack，STORE 不压缩——ora/png 本就是压缩流）。 */
  pack(entries: { path: string; data: Blob }[]): Promise<Blob>;
  /** 交付一个 blob 给用户（宿主接 triggerDownload）。 */
  deliver(blob: Blob, filename: string): void;
  onProgress?(done: number, total: number, path: string): void;
  /** 单件失败的诊断出口（不打断整批）。 */
  onError?(path: string, err: unknown): void;
}

export interface BackupReport {
  total: number;                 // 清单件数
  zipped: number;                // 进了备份包的件数
  zippedNames: string[];         // 进包名单（透明账：manifest/回执用）
  spilled: number;               // 溢出后逐件下载的件数
  spilledNames: string[];        // 溢出名单（0828 user：溢出必须对用户透明并说明是哪些——注意这不是驱逐，一件不丢，只是改逐件下载）
  failed: string[];              // 取不到字节的（**诚实清单**，绝不静默跳过）
  bytes: number;                 // 成功取到的总字节
  archiveName: string | null;    // 真打了包才有
  overBudget: boolean;           // 触发过预算分流
}

/** 逐件取字节 → 进包或溢出下载 → 最后封包交付。整个过程只读。 */
export async function runLibraryBackup(
  files: BackupFileRef[],
  ports: BackupPorts,
  opts: { budget?: number; now?: Date; renderManifest?: (r: { zipped: string[]; spilled: string[]; failed: string[] }) => string } = {},
): Promise<BackupReport> {
  const budget = createByteBudget(opts.budget ?? BACKUP_BUDGET_BYTES);
  const entries: { path: string; data: Blob }[] = [];
  const failed: string[] = [];
  const spilledNames: string[] = [];
  let bytes = 0;
  for (let i = 0; i < files.length; i++) {
    const path = files[i].path;
    ports.onProgress?.(i, files.length, path);
    let blob: Blob | null = null;
    try { blob = await ports.readBytes(path); }
    catch (e) { ports.onError?.(path, e); blob = null; }
    if (!blob) { failed.push(path); continue; }
    bytes += blob.size;
    if (budget.admit(blob.size) === "zip") entries.push({ path, data: blob });
    else { ports.deliver(blob, spillName(path)); spilledNames.push(path); }
  }
  const zippedNames = entries.map((e) => e.path);   // manifest 追加之前定格（计数/名单都不含 manifest 自己）
  let archiveName: string | null = null;
  if (entries.length) {
    archiveName = backupArchiveName(opts.now ?? new Date());
    // 透明账（0828 user 拍板方向）：包内自带 manifest——进包/溢出（逐件下载）/失败三份名单全列，
    //   离线打开备份包也能对账（宿主给 renderManifest 才写；纯函数保持零 i18n 依赖）。
    if (opts.renderManifest) {
      entries.push({ path: "backup-manifest.txt", data: new Blob([opts.renderManifest({ zipped: entries.map((e) => e.path), spilled: spilledNames, failed })], { type: "text/plain" }) });
    }
    ports.deliver(await ports.pack(entries), archiveName);
  }
  return {
    total: files.length,
    zipped: zippedNames.length,
    zippedNames,
    spilled: spilledNames.length,
    spilledNames,
    failed,
    bytes,
    archiveName,
    overBudget: budget.spilling(),
  };
}
