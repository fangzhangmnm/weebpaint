// P3 器官测试：gallery-attachment（挂载：五步 detach 契约 / 绿灯门 / 逃生 / 手势 persist / 锁域切换）。
// created 2026-08-27 by Claude Fable 5. deps 全假件，按调用记录断言步序。
import { describe, it, assert, eq } from "./runner.mjs";
import { createGalleryAttachment } from "../src/gallery-attachment.ts";

function rig({ dirty = 0, hasOpenDoc = false, storeAbsent = false } = {}) {
  const calls = [];
  const mkStore = () => ({
    dispose: async (opts) => { calls.push(["dispose", opts?.drain]); },
    files: { dirty: { count: async () => { calls.push(["dirtyCount"]); return dirty; } } },
  });
  const deps = {
    storeAbsent,
    buildStore: (entry) => { calls.push(["build", entry.id]); return mkStore(); },
    swap: async (next) => { calls.push(["swap", next === null ? null : "store"]); },
    registry: {
      touch: async (id) => { calls.push(["touch", id]); },
      relabel: async (id, label) => { calls.push(["relabel", id, label]); },
      clearLastActive: async () => { calls.push(["clearLastActive"]); },
    },
    hasOpenGalleryDoc: () => hasOpenDoc,
    requestPersist: () => { calls.push(["persist"]); },
    setActiveGalleryId: (id) => { calls.push(["lock", id]); },
  };
  return { a: createGalleryAttachment(deps), calls };
}
const entry = (id, kind = "onedrive", extra = {}) => ({ id, kind, label: id, dbId: `gallery-${id}`, lastActive: null, createdAt: 1, ...extra });

describe("gallery-attachment · attach（手势 persist → 建实例 → 换入 → 锁域 → touch）", () => {
  it("attach 步序 + 状态翻 attached(online) + onChange 通知", async () => {
    const { a, calls } = rig();
    const seen = [];
    a.onChange((s) => seen.push(s.kind));
    await a.attach(entry("g1"));
    eq(JSON.stringify(calls), JSON.stringify([["persist"], ["build", "g1"], ["swap", "store"], ["lock", "g1"], ["touch", "g1"]]));
    eq(a.state().kind, "attached");
    eq(a.state().online, true);
    eq(seen.join(","), "attached");
  });
  it("folder 条目 attach 顺手 relabel（标签尽力自愈）", async () => {
    const { a, calls } = rig();
    await a.attach(entry("g2", "folder", { handle: { name: "新夹名", isSameEntry: async () => false } }));
    assert(calls.some((c) => c[0] === "relabel" && c[2] === "新夹名"), "relabel 被调");
  });
  it("attached 时再 attach → throw（必须先过绿灯门 detach）；storeAbsent → throw", async () => {
    const { a } = rig();
    await a.attach(entry("g1"));
    let threw = false;
    try { await a.attach(entry("g2")); } catch { threw = true; }
    assert(threw, "二次 attach 拒绝");
    const { a: b } = rig({ storeAbsent: true });
    threw = false;
    try { await b.attach(entry("g1")); } catch { threw = true; }
    assert(threw, "absent 模式拒绝");
  });
});

describe("gallery-attachment · detach（绿灯门：收口开画 → dirty 扫 → drain 销毁；缓存保留）", () => {
  it("全绿：dispose(drain:true) → swap(null) → 锁域清 → clearLastActive → detached", async () => {
    const { a, calls } = rig();
    await a.attach(entry("g1"));
    calls.length = 0;
    const r = await a.detach();
    eq(r.ok, true);
    eq(JSON.stringify(calls), JSON.stringify([["dirtyCount"], ["dispose", true], ["swap", null], ["lock", null], ["clearLastActive"]]));
    eq(a.state().kind, "detached");
  });
  it("开画在场 → {ok:false, doc-open}，零副作用（一步都不走）", async () => {
    const { a, calls } = rig({ hasOpenDoc: true });
    await a.attach(entry("g1"));
    calls.length = 0;
    const r = await a.detach();
    eq(r.ok, false); eq(r.reason, "doc-open");
    eq(calls.length, 0);
    eq(a.state().kind, "attached");
  });
  it("dirty>0 → {ok:false, dirty, N}，不销毁（UI 走逃生 sheet）", async () => {
    const { a, calls } = rig({ dirty: 3 });
    await a.attach(entry("g1"));
    calls.length = 0;
    const r = await a.detach();
    eq(r.ok, false); eq(r.reason, "dirty"); eq(r.dirtyCount, 3);
    assert(!calls.some((c) => c[0] === "dispose"), "未销毁");
    eq(a.state().kind, "attached");
  });
  it("detached 时 detach 幂等 ok；forceDetach = dispose(drain:false)（dirty 留缓存下次补推）", async () => {
    const { a, calls } = rig({ dirty: 5 });
    eq((await a.detach()).ok, true);                       // 未挂 → 幂等
    await a.attach(entry("g1"));
    calls.length = 0;
    await a.forceDetach();
    assert(calls.some((c) => c[0] === "dispose" && c[1] === false), "快拆不 drain");
    eq(a.state().kind, "detached");
    await a.forceDetach();                                 // 幂等不炸
  });
});

describe("gallery-attachment · bootAdopt（legacy 领养预建实例：零换店零重灌）", () => {
  it("领养：不 build 不 swap，只 lock+touch；attach(opts.online:false) = 离线挂载", async () => {
    const { a, calls } = rig();
    const boot = { dispose: async () => {}, files: { dirty: { count: async () => 0 } } };
    a.bootAdopt(entry("default"), boot, { online: false });
    assert(!calls.some((c) => c[0] === "build" || c[0] === "swap"), "零换店零重灌");
    assert(calls.some((c) => c[0] === "lock" && c[1] === "default"), "active id 就位");
    eq(a.state().kind, "attached"); eq(a.state().online, false);
    let threw = false;
    try { a.bootAdopt(entry("g2"), boot); } catch { threw = true; }
    assert(threw, "attached 时 bootAdopt 拒绝");
    const r = await a.detach();                            // 领养的实例照样能走绿灯门卸下
    eq(r.ok, true);
    const { a: b, calls: c2 } = rig();
    await b.attach(entry("g1"), { online: false });
    eq(b.state().online, false);
    assert(c2.some((c) => c[0] === "build"), "正常 attach 仍建店");
  });
});

describe("gallery-attachment · 离线态翻牌（权限/token 掉 = 库离线不算 logoff）", () => {
  it("setOnline 只在 attached 生效；翻牌通知订阅者", async () => {
    const { a } = rig();
    a.setOnline(false);                                    // detached → no-op 不炸
    await a.attach(entry("g1"));
    const seen = [];
    a.onChange((s) => seen.push(s.kind === "attached" ? s.online : "x"));
    a.setOnline(false);
    a.setOnline(false);                                    // 同值去重不重复通知
    a.setOnline(true);
    eq(seen.join(","), "false,true");
    eq(a.state().online, true);
  });
});
