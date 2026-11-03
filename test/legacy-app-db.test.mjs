// 老库搬家（src/storage.ts migrateLegacyAppDb；家族工单 B2，Fable 2026-11-03 裁定）。created 2026-11-03 by Claude Opus 5.5
//   跑的是 storage.ts 里真的搬家代码，IDB 换成本文件的最小假工厂（本仓 node 环境没有 IndexedDB）：
//   版本 / onupgradeneeded(oldVersion) / 升级事务 abort = 新建作废、事务按序执行 + complete、getAll / getAllKeys / count / put、
//   deleteDatabase 遇到不让路的连接 = blocked。真浏览器那一半 = tools/standalone-smoke.mjs site（同一段代码在 Chromium 里搬一次）。
import { describe, it, eq, assert } from "./runner.mjs";
const { migrateLegacyAppDb, LEGACY_DB_NAME } = await import("../src/storage.ts");
const { APP_NS } = await import("../src/config.ts");
const NEW_DB = `${APP_NS}.app`;

function fakeIDB({ failPut } = {}) {
  const dbs = new Map();   // name → { version, stores: Map<storeName, Map<keyStr, {key, value}>>, conns: Set }
  const later = (fn) => setTimeout(fn, 0);
  const ks = (k) => JSON.stringify(k);
  const clone = (stores) => new Map([...stores].map(([n, m]) => [n, new Map(m)]));
  function conn(name, rec) {
    const c = {
      name, onversionchange: null, _closed: false,
      get version() { return rec.version; },
      objectStoreNames: { contains: (n) => rec.stores.has(n), get length() { return rec.stores.size; } },
      close() { c._closed = true; rec.conns.delete(c); },
      createObjectStore(n) { rec.stores.set(n, new Map()); return {}; },
      deleteObjectStore(n) { rec.stores.delete(n); },
      transaction(names, mode) { return tx(name, rec, [].concat(names), mode); },
    };
    rec.conns.add(c);
    return c;
  }
  function tx(dbName, rec, names, mode) {
    const queue = [];
    const t = { oncomplete: null, onerror: null, onabort: null, error: null, _failed: false };
    const req = (op) => { const r = { onsuccess: null, onerror: null, result: undefined, error: null }; queue.push(() => op(r)); return r; };
    t.objectStore = (n) => {
      if (!names.includes(n) || !rec.stores.has(n)) throw new Error("NotFoundError: " + n);
      const st = rec.stores.get(n);
      const sorted = () => [...st.values()].sort((a, b) => (ks(a.key) < ks(b.key) ? -1 : ks(a.key) > ks(b.key) ? 1 : 0));
      const w = (fn) => { if (mode !== "readwrite") throw new Error("ReadOnlyError"); return fn(); };
      return {
        get: (k) => req((r) => { r.result = st.get(ks(k))?.value; r.onsuccess?.(); }),
        count: (k) => req((r) => { r.result = k === undefined ? st.size : st.has(ks(k)) ? 1 : 0; r.onsuccess?.(); }),
        getAll: () => req((r) => { r.result = sorted().map((e) => e.value); r.onsuccess?.(); }),
        getAllKeys: () => req((r) => { r.result = sorted().map((e) => e.key); r.onsuccess?.(); }),
        put: (v, k) => w(() => req((r) => {
          if (failPut?.(dbName, n, k)) { r.error = new Error("QuotaExceededError"); t._failed = true; t.error = r.error; r.onerror?.(); return; }
          st.set(ks(k), { key: k, value: v }); r.result = k; r.onsuccess?.();
        })),
        delete: (k) => w(() => req((r) => { st.delete(ks(k)); r.onsuccess?.(); })),
      };
    };
    const snapshot = clone(rec.stores);
    later(function drain() {
      while (queue.length) { queue.shift()(); if (t._failed) break; }
      if (t._failed) { rec.stores = snapshot; t.onerror?.(); t.onabort?.(); return; }   // 事务失败 = 整个回滚
      t.oncomplete?.();
    });
    return t;
  }
  const factory = {
    open(name, version) {
      const r = { onsuccess: null, onerror: null, onupgradeneeded: null, onblocked: null, result: undefined, error: null, transaction: null };
      later(() => {
        const existed = dbs.has(name);
        const rec = existed ? dbs.get(name) : { version: 0, stores: new Map(), conns: new Set() };
        const oldVersion = rec.version;
        const newVersion = version ?? (existed ? rec.version : 1);
        if (version != null && version < oldVersion) { r.error = new Error("VersionError"); r.onerror?.({ preventDefault() {} }); return; }
        if (!existed) dbs.set(name, rec);
        if (newVersion > oldVersion) {
          const before = clone(rec.stores);
          rec.version = newVersion;
          const c = conn(name, rec); r.result = c;
          let aborted = false;
          r.transaction = { abort() { aborted = true; } };
          r.onupgradeneeded?.({ target: r, oldVersion, newVersion });
          r.transaction = null;
          if (aborted) {   // 升级被 abort：新建的库作废、已有的库回到原样
            c.close();
            if (!existed) dbs.delete(name); else { rec.version = oldVersion; rec.stores = before; }
            r.result = undefined; r.error = new Error("AbortError"); r.onerror?.({ preventDefault() {} });
            return;
          }
          r.onsuccess?.(); return;
        }
        r.result = conn(name, rec); r.onsuccess?.();
      });
      return r;
    },
    deleteDatabase(name) {
      const r = { onsuccess: null, onerror: null, onblocked: null };
      later(() => {
        const rec = dbs.get(name);
        if (!rec) { r.onsuccess?.(); return; }
        for (const c of [...rec.conns]) c.onversionchange?.({});
        const tryFinish = () => { if (rec.conns.size) return false; dbs.delete(name); r.onsuccess?.(); return true; };
        if (!tryFinish()) { r.onblocked?.(); const iv = setInterval(() => { if (tryFinish()) clearInterval(iv); }, 5); }
      });
      return r;
    },
    // 测试面
    _names: () => [...dbs.keys()].sort(),
    _count: (db, st) => dbs.get(db)?.stores.get(st)?.size ?? null,
    _get: (db, st, k) => dbs.get(db)?.stores.get(st)?.get(ks(k))?.value,
    _seed(name, version, stores) {
      const rec = { version, stores: new Map(), conns: new Set() };
      for (const [st, entries] of Object.entries(stores)) rec.stores.set(st, new Map(entries.map(([k, v]) => [ks(k), { key: k, value: v }])));
      dbs.set(name, rec);
    },
    /** 模拟一个不让路的老 tab：开着连接、不理 versionchange。返回关闭它的函数。 */
    _stubbornConn(name) { const rec = dbs.get(name); const c = { onversionchange: null }; rec.conns.add(c); return () => rec.conns.delete(c); },
  };
  return factory;
}

const ring = (id, docKey, at) => ({ id, docKey, at, bytes: `bytes-${id}` });
function seedLegacy(f, { ringIds = ["r1", "r2", "r3"], checkpoints = [["猫.ora:open", { v: 1 }]] } = {}) {
  f._seed(LEGACY_DB_NAME, 5, {
    "gallery-thumbs": [["猫.ora", "thumb-a"], ["狗.ora", "thumb-b"]],
    "image-thumbs": [["pic.png", "t"]],
    checkpoints,
    "checkpoint-ring": ringIds.map((id, i) => [id, ring(id, "猫.ora", 100 + i)]),
  });
}

describe("老库搬家（weebpaint → weebpaint-bd6cece69075d759.app）", () => {
  it("有老库 → 搬完：新库里 ring / checkpoints 条数 = 老库，缩略图不搬（新库里重建），老库没了", async () => {
    const f = fakeIDB(); seedLegacy(f);
    const r = await migrateLegacyAppDb({ idb: f });
    eq(r.outcome, "migrated", JSON.stringify(r));
    eq(f._count(NEW_DB, "checkpoint-ring"), 3, "ring 条数 = 老库");
    eq(f._count(NEW_DB, "checkpoints"), 1, "checkpoints 条数 = 老库");
    eq(f._get(NEW_DB, "checkpoint-ring", "r2").bytes, "bytes-r2", "字节原样");
    eq(f._count(NEW_DB, "gallery-thumbs"), 0, "缩略图不搬");
    eq(f._count(NEW_DB, "image-thumbs"), 0, "图片缩略图不搬");
    assert(!f._names().includes(LEGACY_DB_NAME), "老库删了：" + f._names().join(","));
    eq(JSON.stringify(r.moved), JSON.stringify({ "checkpoint-ring": 3, checkpoints: 1 }));
  });
  it("没老库 → 什么库都不建（不长出裸名 weebpaint，也不顺手建新库）", async () => {
    const f = fakeIDB();
    const r = await migrateLegacyAppDb({ idb: f });
    eq(r.outcome, "none");
    eq(f._names().join(","), "", "一个库都没有");
  });
  it("可重复跑：新库里已有的键不覆盖（新的那条更新），只补没有的；第二遍没老库 = none", async () => {
    const f = fakeIDB();
    f._seed(NEW_DB, 1, { "gallery-thumbs": [], "image-thumbs": [], checkpoints: [], "checkpoint-ring": [["r1", ring("r1", "新.ora", 999)]] });
    seedLegacy(f, { ringIds: ["r1", "r9"] });   // 老 bundle 又写了一条 r9；r1 两边都有
    const r = await migrateLegacyAppDb({ idb: f });
    eq(r.outcome, "migrated", JSON.stringify(r));
    eq(f._get(NEW_DB, "checkpoint-ring", "r1").docKey, "新.ora", "新库已有的 r1 没被老的覆盖");
    eq(f._get(NEW_DB, "checkpoint-ring", "r9").docKey, "猫.ora", "老库独有的 r9 补进来了");
    eq(r.copied["checkpoint-ring"], 1, "只写了没有的那一条");
    eq((await migrateLegacyAppDb({ idb: f })).outcome, "none", "第二遍：老库已经没了");
  });
  it("老 tab 不让路 → 记录已搬、老库留着（kept）；下次（它关了）再跑 → 删掉", async () => {
    const f = fakeIDB(); seedLegacy(f);
    const release = f._stubbornConn(LEGACY_DB_NAME);
    const r1 = await migrateLegacyAppDb({ idb: f, blockedTimeoutMs: 60 });
    eq(r1.outcome, "kept", JSON.stringify(r1));
    assert(/delete blocked/.test(r1.why), r1.why);
    eq(f._count(NEW_DB, "checkpoint-ring"), 3, "记录已经在新库里");
    release();
    await new Promise((res) => setTimeout(res, 30));   // 上一次排着的 deleteDatabase 等到它关了也会自己完成
    const r2 = await migrateLegacyAppDb({ idb: f });
    assert(r2.outcome === "none" || r2.outcome === "migrated", JSON.stringify(r2));
    assert(!f._names().includes(LEGACY_DB_NAME), "老库最终删了");
    eq(f._count(NEW_DB, "checkpoint-ring"), 3, "没多也没少");
  });
  it("往新库写失败 → 整个搬家不算数、老库一条不少地留着（下次再来）", async () => {
    const f = fakeIDB({ failPut: (db, st, k) => db === NEW_DB && st === "checkpoint-ring" && k === "r2" });
    seedLegacy(f);
    let r, err = null;
    try { r = await migrateLegacyAppDb({ idb: f }); } catch (e) { err = e; }
    assert(err || r?.outcome === "kept", "失败要么抛、要么 kept：" + JSON.stringify(r) + String(err));
    assert(f._names().includes(LEGACY_DB_NAME), "老库还在");
    eq(f._count(LEGACY_DB_NAME, "checkpoint-ring"), 3, "老库一条不少");
  });
});
