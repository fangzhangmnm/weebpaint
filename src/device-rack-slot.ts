// created 2026-08-28 by Claude Fable 5
// 笔架的 device 槽器官（A2 收敛终案）：RackPersistence 的**无库**实现——IDB 单槽 write-through。
//
// **这不是 store**（否决案 2026-08-28，user：「store 应该单一职责，只负责数据持久化和云同步冲突解析，
//   不负责做容器」；「memory/兜底 store」= null-store 转世，已否决）：没有同步动词可装死，
//   没有的能力就是接口上的**缺席**（本器官不实现 reconcileWithRemote——无远端可对）。
// IDB 被平台没收（Safari file:// 等）→ 纯内存降级 + persistent()=false 诚实上报
//   （丢的是笔偏好不是作品——数据安全词典序第三档；无库笔架 reload 不丢 = user 唯一拍板，本器官即为它而生）。
// DB = weebpaint-bd6cece69075d759.device-rack（GUID 前缀：P7 factory-reset 的 app 自扫天然覆盖）。
// 语义对齐 collection 本地面（消费方 = brush-rack-controller，零改动惯性）：
//   setItem 同步改内存 + 同步 fire onChange + 400ms 防抖落盘；deleteItem = 真删（无跨设备墓碑需求）；
//   getInitData 只在槽**空**时 seed（同 collection eager-seed 约定：内置笔即刻可用）。
import type { RackPersistence, RackEntry } from "./brush-rack-controller.ts";   // 脑定义 port（type-only，无运行时环）

/** 槽的持久化 kv（注入口给 node 测试；prod 默认 = IDB 单键实现）。 */
export interface RackSlotKv {
  get(): Promise<{ items: { id: string; uat: number; value: unknown }[] } | null>;
  put(v: { items: { id: string; uat: number; value: unknown }[] }): Promise<void>;
}

const DB_NAME = "weebpaint-bd6cece69075d759.device-rack";
const STORE = "slot";
const KEY = "rack";

function idbKv(): RackSlotKv {
  let dbp: Promise<IDBDatabase> | null = null;
  const open = (): Promise<IDBDatabase> => (dbp ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => { req.result.createObjectStore(STORE); };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  }));
  const tx = async <T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> => {
    const db = await open();
    return new Promise<T>((resolve, reject) => {
      const t = db.transaction(STORE, mode);
      const r = run(t.objectStore(STORE));
      t.oncomplete = () => resolve(r.result);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error ?? new Error("idb tx aborted"));
    });
  };
  return {
    get: () => tx("readonly", (s) => s.get(KEY) as IDBRequest<{ items: { id: string; uat: number; value: unknown }[] } | undefined>).then((v) => v ?? null),
    put: (v) => tx("readwrite", (s) => s.put(v, KEY)).then(() => undefined),
  };
}

export function createDeviceRackSlot(opts: {
  getInitData?: () => { id: string; value: unknown }[] | Promise<{ id: string; value: unknown }[]>;
  kv?: RackSlotKv;                 // 测试注入；不传 = IDB（构造期不碰 IDB，init 才碰）
  writeDelayMs?: number;           // 防抖（默认 400，同 collection 本地写）
} = {}): RackPersistence & { persistent(): boolean } {
  const delay = opts.writeDelayMs ?? 400;
  const map = new Map<string, RackEntry>();
  const subs = new Set<(ids: string[]) => void>();
  let kv: RackSlotKv | null = null;
  let persistentOk = false;        // init 后为真相；降级（IDB 挂/没收）= false，内存照常工作
  let uatSeq = 1;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let inited = false;

  const fire = (ids: string[]) => { for (const cb of subs) { try { cb(ids); } catch { /* 订阅者事故不拦器官 */ } } };
  const snapshot = () => ({ items: [...map.values()].map((e) => ({ id: e.id, uat: e.uat, value: e.value })) });
  const persistNow = async (): Promise<{ ok: boolean; error?: unknown }> => {
    if (!kv) return { ok: false, error: new Error("device-rack-slot: not persistent (memory-degraded)") };
    try { await kv.put(snapshot()); return { ok: true }; }
    catch (e) { return { ok: false, error: e }; }
  };
  const schedule = () => {
    if (!kv) return;               // 降级态：无处可写，内存即全部
    if (timer != null) clearTimeout(timer);
    timer = setTimeout(() => { timer = null; void persistNow(); }, delay);
  };

  return {
    async init() {
      if (inited) return;
      inited = true;
      try {
        kv = opts.kv ?? idbKv();
        const stored = await kv.get();
        persistentOk = true;
        if (stored?.items?.length) {
          for (const it of stored.items) { map.set(it.id, { id: it.id, uat: it.uat, value: it.value }); uatSeq = Math.max(uatSeq, it.uat + 1); }
          return;
        }
      } catch { kv = null; persistentOk = false; }   // IDB 没收/坏 → 纯内存降级（诚实：persistent()=false）
      if (opts.getInitData) {
        try {
          const items = await opts.getInitData();
          for (const it of items) map.set(it.id, { id: it.id, uat: 1, value: it.value });
          if (items.length) { fire(items.map((i) => i.id)); schedule(); }
        } catch { /* seed 失败 = 空槽（与 collection 新库无网同形） */ }
      }
    },
    entries() { return [...map.values()]; },
    getItem<V>(id: string, def?: V | (() => V)): V | undefined {
      const e = map.get(id);
      if (!e || e.value == null) return typeof def === "function" ? (def as () => V)() : def;
      return e.value as V;
    },
    setItem(id: string, value: unknown) {
      if (value === undefined) throw new Error("device-rack-slot.setItem: value must not be undefined");
      map.set(id, { id, uat: uatSeq++, value });
      fire([id]);
      schedule();
    },
    deleteItem(id: string) {
      if (map.delete(id)) { fire([id]); schedule(); }
    },
    onChange(cb: (changedIds: string[]) => void) { subs.add(cb); return () => { subs.delete(cb); }; },
    async flushLocal() {
      if (timer != null) { clearTimeout(timer); timer = null; }
      return persistNow();
    },
    /** 降级诚实面：false = IDB 被没收/坏，本 session 内存工作、reload 会丢（UI 可据此提示，永不谎报）。 */
    persistent() { return persistentOk; },
  };
}
