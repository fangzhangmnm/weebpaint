// app 自己的 IndexedDB（库名 `weebpaint-bd6cece69075d759.app`；2026-11-03 之前叫裸名 `weebpaint`，见文末「老库搬家」）。**注意和 store 的库分开**：
//   作品字节在 store 的 `weebpaint.defaultStore` 库（分区 files/trash/backup/collections）；
//   这里只放 app 专属、store 管不着的东西。
//
// 现存 object store（v5 终态）：
//   · gallery-thumbs —— 图库缩略图缓存（加密件存**密文** peek，明文永不落盘）
//   · image-thumbs   —— 云盘图片 picker 缩略图缓存（自压 jpeg 派生物；与 gallery-thumbs 分开存 = user 2026-08-20 拍板）
//   · checkpoints    —— 撤销更改（revert）的打开态快照，key `<X.ora>:<slot>`，加密件存密文容器
//   （sessions —— v415 删；meta —— 2026-07 已删。都别加回来。）

import type { CheckpointRecord } from "./checkpoint-policy.ts";
import { APP_NS } from "./config.ts";   // 自家前缀 token

// 2026-11-03（家族规则书 §1 第 3 条；工单 B2，Fable 裁定「改，带一次性搬家」；Claude Opus 5.5）：裸名 `weebpaint` → 带前缀。
//   itch 上所有网页游戏共一个源、Chromium 双击打开的网页共一个桶，裸名会和别人撞；而且它就落在 store 自己 `weebpaint.` 命名空间的边上。
const DB_NAME = `${APP_NS}.app`;
/** 2026-11-03 之前的库名。同源的老 bundle（正式版没升级之前）还会继续写它 → 搬家要能一遍遍重复跑。 */
export const LEGACY_DB_NAME = "weebpaint";
// 版本史：v4（2026-07-18）建 checkpoints + 删 sessions；v5（2026-08-20，cloud-image-picker spec §6）建 image-thumbs。
// ⚠ v0.9.31（QA ②）起**不再硬编码 DB 版本**：prod（/）和 dev（/dev/）同源共享这个库，
//   硬编码版本 = dev 升库后旧渠道 open(旧版本号) 直接 VersionError，缩略图/revert 整库打不开。
//   自适应打开：先无版本号 open（任何现有版本都成功）→ 缺 store 才 close 并按 当前版本+1 升级补建。
//   本文件从此对版本号不敏感；旧渠道仍硬编码的历史版本追不回来（那是旧 bundle 的代码），
//   但从本版起两渠道再也不会互相打断。
const STORE_SESSIONS = "sessions";        // 仅 upgrade 里用来 deleteObjectStore，别再读写
const STORE_THUMBS = "gallery-thumbs";    // 图库缩略图缓存专用 store，key = store 文件身份 X.ora（cloud-thumb-cache.ts）
const STORE_IMAGE_THUMBS = "image-thumbs"; // 云盘图片缩略图缓存，key = 全名 path 含扩展名（gallery/image-thumbs.ts）
const STORE_CHECKPOINTS = "checkpoints";  // revert v1 单槽快照（legacy 只读兜底，v0.11.8 起停写；ring 接班）
const STORE_RING = "checkpoint-ring";     // revert v2 ring（P4 2026-08-26）：多档 at-rest 快照，字节预算滚动淘汰
const REQUIRED_STORES = [STORE_THUMBS, STORE_IMAGE_THUMBS, STORE_CHECKPOINTS, STORE_RING];

let _dbPromise: Promise<IDBDatabase> | null = null;

function _openRaw(idb: IDBFactory, version?: number): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = version == null ? idb.open(DB_NAME) : idb.open(DB_NAME, version);
    req.onupgradeneeded = (ev) => {
      const db = (ev.target as IDBOpenDBRequest).result;
      for (const s of REQUIRED_STORES) if (!db.objectStoreNames.contains(s)) db.createObjectStore(s);
      // sessions 死 store（v415 断供）：撞见就删。deleteObjectStore 只能在 upgrade 事务里调。
      if (db.objectStoreNames.contains(STORE_SESSIONS)) db.deleteObjectStore(STORE_SESSIONS);
      // 更旧的 ai-docs/layers stores 不主动删（如果存在），让 DevTools 翻历史；新代码不读不写它们。
    };
    // 升级被别的连接挡住（旧 bundle 的 tab 不听 versionchange、永不让路）→ 响亮 reject，
    //   别静默 pending 到天荒地老（长跑纪律：挂死→响亮红）。缩略图/revert 各自 catch，开画不受影响。
    req.onblocked = () => reject(new Error("IndexedDB upgrade blocked by another WeebPaint tab (old bundle holding the DB) — close other WeebPaint tabs"));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function _openAdaptive(idb: IDBFactory = indexedDB): Promise<IDBDatabase> {   // idb 参数只为单测注入假工厂（test/legacy-app-db.test.mjs）
  let db = await _openRaw(idb);                                 // 无版本号：现有库什么版本都打得开
  if (!REQUIRED_STORES.every((s) => db.objectStoreNames.contains(s))) {
    const next = db.version + 1;                                // 缺 store（新装/新增 store 的版本）→ 最小步升级补建
    db.close();
    db = await _openRaw(idb, next);
  }
  // 别的 tab 要升级时主动让路（旧代码不让路是 onblocked 挂死的根源，新代码别再当拦路者）；
  //   让路后清缓存，下次调用按新版本重开。
  db.onversionchange = () => { db.close(); if (_dbPromise) _dbPromise = null; };
  return db;
}

function openDB(): Promise<IDBDatabase> {
  if (_dbPromise) return _dbPromise;
  // 失败（VersionError 并发竞升 / blocked 瞬态）重试一次；仍失败则**不缓存 rejected promise**——
  //   否则一次瞬时失败会让本 session 的缩略图/revert 永久死透，连恢复机会都没有。
  _dbPromise = _openAdaptive().catch(async (e1) => {
    try { return await _openAdaptive(); }
    catch { _dbPromise = null; throw e1; }
  });
  return _dbPromise;
}

// sessions object store 的整套读写（getSession / putSession / deleteSession / listSessionIds /
//   renameSessionKey + SessionPkg）已于 v415 删除。
//   它是 store cutover 之前的本地 autosave 层。cutover 后写入侧（putSession）零调用者，
//   于是这个 store **只出不进、恒空**，而读侧 session.listSessions 还在读它 → 四个消费方静默失效
//   （详见 session.ts 里那段说明）。落盘真相现在唯一走 store.file + editor-session。
//   object store 本身已在 v4 的 upgrade 里 deleteObjectStore（见 openDB）。

// meta store（getMeta/setMeta + STORE_META object store）已于 2026-07 删除：笔架本地持久化迁到
//   store.collection("brush-rack")；设置/状态早已走 collection（app-prefs.ts / app-state.ts）。别再加回。

// gallery 缩略图缓存：weebpaint DB 的 gallery-thumbs store，key = store 文件身份 X.ora。value 见 cloud-thumb-cache。
export async function getThumb(key: string): Promise<unknown> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_THUMBS, "readonly");
    const req = tx.objectStore(STORE_THUMBS).get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function setThumb(key: string, value: unknown): Promise<void> {
  const db = await openDB();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_THUMBS, "readwrite");
    tx.objectStore(STORE_THUMBS).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// 删单条缩略图缓存（作废：bytes 变了）。
export async function deleteThumb(key: string): Promise<void> {
  const db = await openDB();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_THUMBS, "readwrite");
    tx.objectStore(STORE_THUMBS).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// 清空整个缩略图 store（返清掉的条数）。
export async function clearThumbs(): Promise<number> {
  const db = await openDB();
  return new Promise<number>((resolve, reject) => {
    const tx = db.transaction(STORE_THUMBS, "readwrite");
    const store = tx.objectStore(STORE_THUMBS);
    const countReq = store.count();
    let n = 0;
    countReq.onsuccess = () => { n = countReq.result; store.clear(); };
    tx.oncomplete = () => resolve(n);
    tx.onerror = () => reject(tx.error);
  });
}

// ── image-thumbs（云盘图片 picker 缩略图缓存，key = 全名 path）──────────────────────────────
// 形状同 gallery-thumbs 四件套；value 形态见 gallery/image-thumbs.ts。
export async function getImageThumb(key: string): Promise<unknown> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE_IMAGE_THUMBS, "readonly").objectStore(STORE_IMAGE_THUMBS).get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
export async function setImageThumb(key: string, value: unknown): Promise<void> {
  const db = await openDB();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_IMAGE_THUMBS, "readwrite");
    tx.objectStore(STORE_IMAGE_THUMBS).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
export async function deleteImageThumb(key: string): Promise<void> {
  const db = await openDB();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_IMAGE_THUMBS, "readwrite");
    tx.objectStore(STORE_IMAGE_THUMBS).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
export async function clearImageThumbs(): Promise<number> {
  const db = await openDB();
  return new Promise<number>((resolve, reject) => {
    const tx = db.transaction(STORE_IMAGE_THUMBS, "readwrite");
    const store = tx.objectStore(STORE_IMAGE_THUMBS);
    const countReq = store.count();
    let n = 0;
    countReq.onsuccess = () => { n = countReq.result; store.clear(); };
    tx.oncomplete = () => resolve(n);
    tx.onerror = () => reject(tx.error);
  });
}

// ── checkpoints（撤销更改 / revert）────────────────────────────────────────────────────────
// 一条 = 一幅画在「本次打开那一刻」的 at-rest 字节快照。加密件存**密文容器**（明文永不落盘）。
// key/何时封存/加密处理的**策略**在纯模块 checkpoint-policy.ts（那边可 node 测）；这里只管落盘。
export async function getCheckpoint(key: string): Promise<CheckpointRecord | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_CHECKPOINTS, "readonly");
    const req = tx.objectStore(STORE_CHECKPOINTS).get(key);
    req.onsuccess = () => resolve((req.result as CheckpointRecord) || null);
    req.onerror = () => reject(req.error);
  });
}
export async function putCheckpoint(key: string, rec: CheckpointRecord): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_CHECKPOINTS, "readwrite");
    tx.objectStore(STORE_CHECKPOINTS).put(rec, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
export async function deleteCheckpoint(key: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_CHECKPOINTS, "readwrite");
    tx.objectStore(STORE_CHECKPOINTS).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// ── checkpoint-ring（revert v2，P4 2026-08-26；added by Claude Fable 5）──────────────────
// 一条 = 一幅画在某个封存时刻的 at-rest 字节快照（加密件=密文容器，明文永不落盘——红线同 v1）。
// key = record.id（存储层生成）；淘汰策略（字节预算/最旧先走）在 checkpoint-policy.planRingEviction，
//   编排在 session-state——这里只管搬运。旧单槽 checkpoints store 保留为 legacy 只读兜底
//   （升级窗口期已开着的画还能「回到打开时」），新写全进 ring。
import type { CheckpointTrigger, RingEntryMeta } from "./checkpoint-policy.ts";
export interface RingRecord extends RingEntryMeta { bytes: Blob }

export function mintRingId(at: number): string {
  return at.toString(36) + "-" + Math.random().toString(36).slice(2, 8);
}
export async function ringPut(rec: RingRecord): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_RING, "readwrite");
    tx.objectStore(STORE_RING).put(rec, rec.id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
export async function ringGet(id: string): Promise<RingRecord | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_RING, "readonly");
    const req = tx.objectStore(STORE_RING).get(id);
    req.onsuccess = () => resolve((req.result as RingRecord) || null);
    req.onerror = () => reject(req.error);
  });
}
/** 全 ring meta（不含 bytes 字段本身仍在记录里，但 Blob 是惰性引用——遍历 meta 不搬字节）。 */
export async function ringAll(): Promise<RingRecord[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_RING, "readonly");
    const req = tx.objectStore(STORE_RING).getAll();
    req.onsuccess = () => resolve((req.result as RingRecord[]) ?? []);
    req.onerror = () => reject(req.error);
  });
}
export async function ringDelete(ids: string[]): Promise<void> {
  if (!ids.length) return;
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_RING, "readwrite");
    const s = tx.objectStore(STORE_RING);
    for (const id of ids) s.delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
/** 按 docKey 清整份 ring（改名/删除作品、file 家正常关闭随行李牌焚）。 */
export async function ringDeleteByDoc(docKey: string): Promise<void> {
  const all = await ringAll();
  await ringDelete(all.filter((r) => r.docKey === docKey).map((r) => r.id));
}
export { type CheckpointTrigger as RingTrigger };

// ── 老库搬家（2026-11-03，家族工单 B2；Fable 裁定的规矩逐条照做；added by Claude Opus 5.5）──────────────────────────
// 搬什么：checkpoint-ring + checkpoints（「回到之前」的历史）；两个缩略图 store 不搬（派生缓存，新库里自己重建）。
// 规矩：① 不用 indexedDB.databases() 枚举（家规：永不枚举别人的前缀）——老库在不在用「无版本号 open + onupgradeneeded 里
//   oldVersion === 0 就 abort 这次升级」探：没有就不会被建出来；② 只在开机后的空闲片里跑（src/legacy-app-db.ts 排期），
//   **全部搬进新库、逐键核过才删老库**，任何一步不对就留着老库、下次开机再来（进黑匣子）；③ 可重复跑：同源的老 bundle 还会往老库写，
//   新库里已经有的键不覆盖（新库的那条更新），只补没有的。
// 和 Fable 原话的一处出入（报告 B2 节写明）：老库**不在**时不顺手 deleteDatabase——探完到删之间老 bundle 恰好新建了它的话，会把
//   还没搬的新记录删掉；探测时被 abort 的那次新建浏览器自己会丢弃，用不着补删。
const MIGRATED_STORES = [STORE_RING, STORE_CHECKPOINTS] as const;
export type LegacyAppDbMigration =
  | { outcome: "none" }                                                                     // 没有老库：什么都没建、什么都没动
  | { outcome: "migrated"; moved: Record<string, number>; copied: Record<string, number> }  // 搬完、核过、老库删了
  | { outcome: "kept"; why: string; moved: Record<string, number>; copied: Record<string, number> };   // 老库留着，下次再来

/** 老库在就打开（只读用），不在 = null，并且不把它建出来。 */
function _openLegacyIfExists(idb: IDBFactory): Promise<IDBDatabase | null> {
  return new Promise((resolve, reject) => {
    let absent = false;
    const req = idb.open(LEGACY_DB_NAME);                       // 无版本号：老库什么版本都打得开；不在 = 触发 oldVersion 0 的升级
    req.onupgradeneeded = (ev) => {
      if ((ev as IDBVersionChangeEvent).oldVersion === 0) { absent = true; req.transaction?.abort(); }   // 本来没有 → 撤销这次新建
    };
    req.onsuccess = () => {
      const db = req.result;
      if (absent) { db.close(); resolve(null); return; }       // 理论不可达（abort 之后不会 success），保险
      db.onversionchange = () => db.close();                   // 别人要删 / 升级它（老 bundle、还原出厂）→ 让路
      resolve(db);
    };
    req.onerror = (ev) => {
      if (absent) { (ev as Event).preventDefault?.(); resolve(null); return; }   // 我们自己 abort 的那次 = 「没有」
      reject(req.error);
    };
  });
}

const _keyStr = (k: IDBValidKey): string => (typeof k === "string" ? "s:" + k : "j:" + JSON.stringify(k));

function _readAll(db: IDBDatabase, store: string): Promise<{ key: IDBValidKey; value: unknown }[]> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readonly");
    const s = tx.objectStore(store);
    const kq = s.getAllKeys(), vq = s.getAll();                // 同一事务、同一 store：两者按键序一一对应
    tx.oncomplete = () => resolve((kq.result as IDBValidKey[]).map((key, i) => ({ key, value: (vq.result as unknown[])[i] })));
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error("legacy read aborted"));
  });
}

/** 新库里没有这个键才写（新库已有的那条更新，不覆盖）。返回实际写了几条。事务 complete 才算数。 */
function _putIfAbsent(db: IDBDatabase, store: string, entries: { key: IDBValidKey; value: unknown }[]): Promise<number> {
  if (!entries.length) return Promise.resolve(0);
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readwrite");
    const s = tx.objectStore(store);
    let written = 0;
    for (const e of entries) {
      const c = s.count(e.key);
      c.onsuccess = () => { if (c.result === 0) { s.put(e.value, e.key); written++; } };
    }
    tx.oncomplete = () => resolve(written);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error("copy into new DB aborted"));
  });
}

function _keySet(db: IDBDatabase, store: string): Promise<Set<string>> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readonly");
    const q = tx.objectStore(store).getAllKeys();
    tx.oncomplete = () => resolve(new Set((q.result as IDBValidKey[]).map(_keyStr)));
    tx.onerror = () => reject(tx.error);
  });
}

function _deleteDb(idb: IDBFactory, name: string, blockedTimeoutMs: number): Promise<"deleted" | "blocked" | "error"> {
  return new Promise((resolve) => {
    let done = false;
    const finish = (r: "deleted" | "blocked" | "error") => { if (!done) { done = true; clearTimeout(timer); resolve(r); } };
    const timer = setTimeout(() => finish("blocked"), blockedTimeoutMs);   // 老 tab 不让路：这次算没删成（已搬的记录留在新库，下次再删）
    const req = idb.deleteDatabase(name);
    req.onsuccess = () => finish("deleted");
    req.onerror = () => finish("error");
  });
}

/** 把老库 `weebpaint` 的「回到之前」历史搬进新库，全部核过才删老库。没有老库 = 什么都不建（outcome "none"）。 */
export async function migrateLegacyAppDb(opts: { idb?: IDBFactory; blockedTimeoutMs?: number } = {}): Promise<LegacyAppDbMigration> {
  const idb = opts.idb ?? indexedDB;
  const legacy = await _openLegacyIfExists(idb);
  if (!legacy) return { outcome: "none" };
  const moved: Record<string, number> = {}, copied: Record<string, number> = {};
  const shared = idb === globalThis.indexedDB;                 // 正式路径用本模块共用的那条连接（不关）；单测注入的工厂另开另关
  let own: IDBDatabase | null = null;
  try {
    const target = shared ? await openDB() : (own = await _openAdaptive(idb));
    for (const st of MIGRATED_STORES) {
      if (!legacy.objectStoreNames.contains(st)) { moved[st] = 0; copied[st] = 0; continue; }
      const entries = await _readAll(legacy, st);
      moved[st] = entries.length;
      copied[st] = await _putIfAbsent(target, st, entries);
      const have = await _keySet(target, st);
      const missing = entries.filter((e) => !have.has(_keyStr(e.key))).length;
      if (missing) return { outcome: "kept", why: `${st}: ${missing} record(s) not in the new DB after copy`, moved, copied };
    }
    legacy.close();
    const del = await _deleteDb(idb, LEGACY_DB_NAME, opts.blockedTimeoutMs ?? 5000);
    if (del !== "deleted") return { outcome: "kept", why: `old DB delete ${del} (records already copied; retry next boot)`, moved, copied };
    return { outcome: "migrated", moved, copied };
  } finally {
    try { legacy.close(); } catch { /* 已关 */ }
    try { own?.close(); } catch { /* 已关 */ }
  }
}
