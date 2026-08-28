// store-absent —— 平台缺席探针 + 内存 collection 器官（2026-08-27 替身大清洗后的残余职责）。
//
// 历史：v0.8.7 起这里住着 createNullStore/createDormantAuth——给「随地引用全局 store」的代码垫的
//   结构镜像替身。2026-08-27 user 拍板 ambient store 退役（「依赖整理好」）：app-store 接缝改出
//   requireStore()/galleryBackend() 两口，消费点逐个表态，替身**物理退役**（每个 benign no-op 都是
//   一个没被迫回答的问题；无库加密探测谎报即其现行犯）。本文件只剩两个诚实职责：
//   - detectStoreAbsent()：平台探针「持久化器官被没收」（file:// Safari / ?nostore / env）→ kind:"none"
//     且 attach 永久禁用（能力位，与运行态「现在没挂库」正交但合流同一 GalleryBackend）。
//   - createMemoryCollection()：无库笔架的**合法器官**（builtin 种子、session 内可编辑、reload 失）——
//     显式选择（app-store._wireCollections kind:none 分支），不再是替身的副作用。
// ⚠ 本文件是接缝级（与 app-store.ts 同级），只准 import store 的**类型**——零 store 运行时代码、零 IDB。

import type { Collection, CollectionEntry, ReconcileResult } from "@internal/store";

export function detectStoreAbsent(): boolean {
  try {
    // node 子进程 boot smoke（test/nostore-boot-child.mjs）经 env 开缺席模式（浏览器不认 env）。
    const env = (globalThis as { process?: { env?: Record<string, string> } }).process?.env;
    if (env?.WEEBPAINT_NOSTORE === "1") return true;
    if (typeof location !== "undefined" && new URLSearchParams(location.search).has("nostore")) return true;
    if (typeof localStorage !== "undefined" && localStorage.getItem("weebpaint.nostore") === "1") return true;
  } catch { /* 环境无 location/localStorage（node）→ 视为在场（测试显式建 null store） */ }
  // P6 无地探针（survey §5.1：Safari file:// 裸存储访问 = SecurityError；旧私隐模式 setItem 必炸）：
  //   平台把持久化器官没收 → 缺席模式（Editor Only 纯内存），**不白屏**（0825 已知失败 §3.5 的降级路径）。
  //   注意方向与上面相反：上面 catch=视为在场（node 无 DOM），这里 probe 真炸=确证器官没收 → 缺席。
  if (typeof localStorage !== "undefined") {
    try {
      const k = "weebpaint.storage-probe";
      localStorage.setItem(k, "1");
      localStorage.removeItem(k);
    } catch { return true; }
  }
  return false;
}

// ---- 内存 Collection（满足 store/collection.ts 的 Collection 契约；无持久层）----
type InitItem = { id: string; value: unknown };
export function createMemoryCollection(opts: { getInitData?: () => InitItem[] | Promise<InitItem[]> } = {}): Collection {
  const map = new Map<string, CollectionEntry>();
  const subsAll = new Set<(changedIds: string[]) => void>();
  const subsKey = new Map<string, Set<() => void>>();
  let inited = false;
  const fire = (ids: string[]) => {
    for (const cb of subsAll) cb(ids);
    for (const id of ids) for (const cb of subsKey.get(id) ?? []) cb();
  };
  const col: Collection = {
    async init() {
      if (inited) return;
      inited = true;
      if (opts.getInitData) {
        try {
          const items = await opts.getInitData();
          for (const it of items) map.set(it.id, { id: it.id, uat: 1, value: it.value } as CollectionEntry);
          if (items.length) fire(items.map((i) => i.id));
        } catch { /* seed 失败 = 空库（与真 collection 新库无网同形） */ }
      }
    },
    async reconcileWithRemote(): Promise<ReconcileResult> { return { status: "offline" }; },
    setItem(id, value) {
      if (value === undefined) throw new Error("Collection.setItem: value must not be undefined");
      map.set(id, { id, uat: (map.get(id)?.uat ?? 0) + 1, value } as CollectionEntry);
      fire([id]);
    },
    deleteItem(id) { map.set(id, { id, uat: (map.get(id)?.uat ?? 0) + 1, value: null } as CollectionEntry); fire([id]); },
    getItem<V = unknown>(id: string, def?: V | (() => V)): V | undefined {
      const e = map.get(id);
      if (!e || e.value === null || e.value === undefined) return typeof def === "function" ? (def as () => V)() : def;
      return e.value as V;
    },
    getEntry(id) { const e = map.get(id); return e && e.value != null ? e : undefined; },
    entries() { return [...map.values()].filter((e) => e.value != null); },
    keys() { return [...map.values()].filter((e) => e.value != null).map((e) => e.id); },
    onChange(a: unknown, b?: unknown): () => void {
      if (typeof a === "string") {
        const set = subsKey.get(a) ?? new Set();
        subsKey.set(a, set);
        set.add(b as () => void);
        return () => set.delete(b as () => void);
      }
      subsAll.add(a as (ids: string[]) => void);
      return () => subsAll.delete(a as (ids: string[]) => void);
    },
    async flushLocal() { return { ok: true }; },
    isDirty() { return false; },
  };
  return col;
}
