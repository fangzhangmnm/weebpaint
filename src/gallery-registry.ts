// gallery-registry.ts —— P3 图库名册器官（device-local；ADR-0024：per-gallery / device-local / 永不同步）。
// created 2026-08-27 by Claude Fable 5. 契约 = ai-docs/20260827-p3-gallery-multiinstance-grill-verdicts.md §3。
//
// 名册只记「这台设备见过哪些图库」：铸 opaque id + 来源引用（OneDrive 账号 / FSA 句柄）+ 派生标签快照
//   + lastActive。id 非路径非身份主张——0607「registry=灾难」判的是 per-file/跨设备同步的 registry，
//   本器官 per-gallery / device-local / 永不同步（ADR-0024 划界）。
// 源内永不写 id：`.weebpaint/` 只是存在标记/管理容器（verdicts §1.3 界线——身份标记维持否决）；
//   同夹二挂查重只靠 isSameEntry；文件夹整拷再挂 = isSameEntry 不等 = 新 id = 拷贝即分叉。
// 标签纯派生不可编辑（folder→夹名 / OneDrive→「OneDrive · 账号名」）；attach 时 relabel 尽力自愈
//   （FSA 无反查现名 API，改名后 name 可能停旧值——真机批项，不承诺）。撞名不设机制（user 拍板：
//   picker 卡标来源即可）。
// app 自己的小 IDB（0825 拍板「device-local 小 IDB」；库名带 GUID 前缀防 file:// 共桶撞，
//   纪律：永不枚举非自己前缀的库）。lastActive 是 LWW 便利值（双 tab 双库合法，晚 touch 者胜，非红线）。
// 结构：逻辑走 RegistryKV port（node Map 假件可测，见 test/gallery-registry.test.mjs）；
//   IDB 适配器只搬运（句柄 structured clone 入库；适配器形状抄 crash-store，刻意 WET——平台层家规）。

// ── A3 序列化口径（2026-08-28 user 拍板「generic JSON dict：旧 json 永不需要 migration，代码层改名随意」）──
//   ① 条目 = generic dict：**所有 mutation 一律 spread 保留未知字段**（{ ...e, 改动 }）——未来版本加的字段
//     被旧版本碰过也不丢；契约测试钉在 test/gallery-registry.test.mjs（别把 spread 改成逐字段重建）。
//   ② kind 是开放扩展位：加 "gdrive" 等 = 纯增量，旧条目零迁移。
//   ③ 已持久化字段**永不改名**（改名=migration=否决）；homeAccountId 是 onedrive 域专属引用，
//     未来 provider 各自**加自己的**引用字段（additive），不复用不改名。
export type GalleryKind = "onedrive" | "folder";

/** FSA 目录句柄的最小面（node 可测；浏览器 FileSystemDirectoryHandle 结构满足）。 */
export interface DirHandleLike { readonly name: string; isSameEntry(other: DirHandleLike): Promise<boolean> }

export interface GalleryEntry {
  id: string;                    // 铸的 opaque id（本机局部）
  kind: GalleryKind;
  label: string;                 // 派生快照（attach 时 relabel 刷新）；不可编辑
  dbId: string;                  // store databaseId：legacy OneDrive = "defaultStore"（既有缓存/dirty 零迁移）；新铸 = `gallery-<id>`
  homeAccountId?: string;        // kind=onedrive 域专属账号引用（MSAL 词；别的 provider 加自己的字段，见 A3 口径③）
  handle?: DirHandleLike;        // kind=folder：FSA 句柄
  lastActive: number | null;     // null = 未激活/已卸下
  createdAt: number;
}

/** 存储 port（结构 clone 语义；IDB 适配器/Map 假件同形）。 */
export interface RegistryKV {
  put(e: GalleryEntry): Promise<void>;
  delete(id: string): Promise<void>;
  list(): Promise<GalleryEntry[]>;
}

export interface GalleryRegistry {
  list(): Promise<GalleryEntry[]>;
  /** isSameEntry 查重：同夹二挂复用旧条目（顺手刷新 label）；查不到才铸新 id。 */
  mintFolder(handle: DirHandleLike): Promise<GalleryEntry>;
  /** 同账号查重复用；首个 OneDrive 条目认领 legacy 命名空间 "defaultStore"（既有数据零迁移）。 */
  mintOneDrive(homeAccountId: string, username: string): Promise<GalleryEntry>;
  touch(id: string): Promise<void>;              // lastActive = now
  clearLastActive(): Promise<void>;              // 卸下 → 全条目 lastActive=null（boot 进无库模式）
  relabel(id: string, label: string): Promise<void>;   // attach 时派生刷新（尽力自愈）；非用户编辑面
  forget(id: string): Promise<void>;             // 只删条目不动源；缓存库 GC 挂深清（P7）
  lastActive(): Promise<GalleryEntry | null>;
  /** 播种（幂等，靠 dedup 不靠标记；每次 auth 变化调都安全）：既有登录态 → legacy OneDrive 条目即激活。 */
  seedLegacyOneDrive(p: { homeAccountId: string; username: string }): Promise<void>;
}

const mintId = () => "g" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const oneDriveLabel = (username: string) => "OneDrive · " + (username || "账号");
// legacy 连续性（P3 Slice C 拍定）：认领 "defaultStore" 命名空间的那个条目，id 同时取 **"default"**
//   （= SOLE_GALLERY_ID）——锁名 `default:名`、回执条键 `resume:default` 与 P3 前逐字节相同，零迁移。
const LEGACY_ID = "default";
const LEGACY_DB = "defaultStore";

export function createGalleryRegistry(kv: RegistryKV): GalleryRegistry {
  const findSame = async (entries: GalleryEntry[], handle: DirHandleLike) => {
    for (const e of entries) {
      if (e.kind !== "folder" || !e.handle) continue;
      try { if (await e.handle.isSameEntry(handle)) return e; } catch { /* 句柄失活 → 视为不同 */ }
    }
    return null;
  };
  return {
    list: () => kv.list(),
    async mintFolder(handle) {
      const entries = await kv.list();
      const same = await findSame(entries, handle);
      if (same) {
        const fresh = { ...same, handle, label: handle.name || same.label };   // 复用 id + 句柄/标签刷新
        await kv.put(fresh);
        return fresh;
      }
      const id = mintId();
      const e: GalleryEntry = { id, kind: "folder", label: handle.name || "文件夹", dbId: `gallery-${id}`, handle, lastActive: null, createdAt: Date.now() };
      await kv.put(e);
      return e;
    },
    async mintOneDrive(homeAccountId, username) {
      const entries = await kv.list();
      const same = entries.find((e) => e.kind === "onedrive" && e.homeAccountId === homeAccountId);
      if (same) {
        const fresh = { ...same, label: oneDriveLabel(username) };
        await kv.put(fresh);
        return fresh;
      }
      const legacyFree = !entries.some((e) => e.dbId === LEGACY_DB);
      const id = legacyFree ? LEGACY_ID : mintId();
      const e: GalleryEntry = { id, kind: "onedrive", label: oneDriveLabel(username), dbId: legacyFree ? LEGACY_DB : `gallery-${id}`, homeAccountId, lastActive: null, createdAt: Date.now() };
      await kv.put(e);
      return e;
    },
    async touch(id) {
      const e = (await kv.list()).find((x) => x.id === id);
      if (e) await kv.put({ ...e, lastActive: Date.now() });
    },
    async clearLastActive() {
      for (const e of await kv.list()) if (e.lastActive !== null) await kv.put({ ...e, lastActive: null });
    },
    async relabel(id, label) {
      const e = (await kv.list()).find((x) => x.id === id);
      if (e && label && e.label !== label) await kv.put({ ...e, label });
    },
    forget: (id) => kv.delete(id),
    async lastActive() {
      let best: GalleryEntry | null = null;
      for (const e of await kv.list()) if (e.lastActive !== null && (!best || e.lastActive > (best.lastActive as number))) best = e;
      return best;
    },
    async seedLegacyOneDrive(p) {
      if (!p.homeAccountId) return;
      const entries = await kv.list();
      if (entries.some((e) => e.kind === "onedrive" && e.homeAccountId === p.homeAccountId)) return;   // 幂等：见过就不再播
      const legacyFree = !entries.some((e) => e.dbId === LEGACY_DB);
      const id = legacyFree ? LEGACY_ID : mintId();
      await kv.put({
        id, kind: "onedrive", label: oneDriveLabel(p.username), homeAccountId: p.homeAccountId,
        dbId: legacyFree ? LEGACY_DB : `gallery-${id}`,   // 既有用户的数据物理在 defaultStore——条目认领它（id 同取 "default"），零迁移
        lastActive: Date.now(),
        createdAt: Date.now(),
      });
    },
  };
}

// ─── IDB 适配器（浏览器；node 测试用 Map 假件替代本段。形状抄 crash-store，刻意 WET）──────────
const DB_NAME = "weebpaint-bd6cece69075d759.gallery-registry";
const STORE = "entries";   // key = 铸的 id

let _dbPromise: Promise<IDBDatabase> | null = null;
function _openDB(): Promise<IDBDatabase> {
  if (_dbPromise) return _dbPromise;
  _dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => { const db = req.result; if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE); };
    req.onsuccess = () => { req.result.onversionchange = () => { req.result.close(); _dbPromise = null; }; resolve(req.result); };
    req.onerror = () => { _dbPromise = null; reject(req.error); };
    req.onblocked = () => reject(new Error("gallery-registry db upgrade blocked"));
  });
  return _dbPromise;
}
function _tx<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T> {
  return _openDB().then((db) => new Promise<T>((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    let out: IDBRequest<T> | void;
    try { out = run(tx.objectStore(STORE)); } catch (e) { reject(e); return; }
    tx.oncomplete = () => resolve(out ? out.result : (undefined as T));
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error("gallery-registry db tx aborted"));
  }));
}

export function idbRegistryKV(): RegistryKV {
  return {
    put: (e) => _tx("readwrite", (s) => { s.put(e, e.id); }),
    delete: (id) => _tx("readwrite", (s) => { s.delete(id); }),
    list: async (): Promise<GalleryEntry[]> => (await _tx<GalleryEntry[]>("readonly", (s) => s.getAll())) ?? [],
  };
}

/** 浏览器单例（懒开库：import 本身零 IDB 访问，node 测试 import 安全）。 */
export const galleryRegistry: GalleryRegistry = createGalleryRegistry(idbRegistryKV());
