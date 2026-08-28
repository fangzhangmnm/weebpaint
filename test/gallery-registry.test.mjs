// P3 器官测试：gallery-registry（名册：铸 id / isSameEntry 查重 / legacy 播种 / lastActive）。
// created 2026-08-27 by Claude Fable 5. Map 假件替 IDB；假句柄 isSameEntry = 对象同一性（真机语义的等价假件）。
import { describe, it, assert, eq } from "./runner.mjs";
import { createGalleryRegistry } from "../src/gallery-registry.ts";

const mapKV = () => {
  const m = new Map();
  return {
    put: async (e) => { m.set(e.id, structuredClone ? { ...e } : e); },
    delete: async (id) => { m.delete(id); },
    list: async () => [...m.values()],
  };
};
const fakeHandle = (name) => {
  const h = { name, isSameEntry: async (other) => other === h };
  return h;
};

describe("gallery-registry · mintFolder（isSameEntry 查重 = 拷贝即分叉的机器面）", () => {
  it("同夹二挂复用 id + 刷新 label；不同夹（含整拷）= 新 id", async () => {
    const r = createGalleryRegistry(mapKV());
    const h1 = fakeHandle("作品");
    const e1 = await r.mintFolder(h1);
    assert(e1.id && e1.kind === "folder" && e1.dbId === `gallery-${e1.id}`, "铸新条目");
    eq(e1.label, "作品");
    h1.name = "改名后";                               // OS 改名 → 平台若更新 name，attach 重挂即自愈
    const e2 = await r.mintFolder(h1);
    eq(e2.id, e1.id);                                  // 复用（isSameEntry 命中）
    eq(e2.label, "改名后");                            // label 刷新
    const e3 = await r.mintFolder(fakeHandle("作品"));  // 整拷副本：同名不同 entry
    assert(e3.id !== e1.id, "拷贝即分叉：新 id");
    eq((await r.list()).length, 2);
  });
  it("句柄失活（isSameEntry throw）→ 视为不同，不炸", async () => {
    const r = createGalleryRegistry(mapKV());
    const dead = { name: "dead", isSameEntry: async () => { throw new Error("gone"); } };
    await r.mintFolder(dead);
    const e = await r.mintFolder(fakeHandle("新夹"));
    assert(e.id, "失活句柄不阻塞新挂");
    eq((await r.list()).length, 2);
  });
});

describe("gallery-registry · mintOneDrive / seedLegacyOneDrive（defaultStore 认领 = 零迁移）", () => {
  it("首个 OneDrive 条目认领 defaultStore；第二账号铸 gallery-<id>；同账号复用", async () => {
    const r = createGalleryRegistry(mapKV());
    const a = await r.mintOneDrive("acct-A", "a@example.com");
    eq(a.dbId, "defaultStore");
    eq(a.id, "default");                               // legacy 连续性：锁名/回执条键逐字节延续（Slice C 拍定）
    eq(a.label, "OneDrive · a@example.com");
    const b = await r.mintOneDrive("acct-B", "b@example.com");
    eq(b.dbId, `gallery-${b.id}`);                     // legacy 名额已被 A 认领
    const a2 = await r.mintOneDrive("acct-A", "a-renamed@example.com");
    eq(a2.id, a.id);                                   // 同账号复用
    eq(a2.label, "OneDrive · a-renamed@example.com");
    eq((await r.list()).length, 2);
  });
  it("播种幂等（dedup 不靠标记）；登录态即激活（cloud-enabled 键已随播种纪元退役 2026-08-28）", async () => {
    const r = createGalleryRegistry(mapKV());
    await r.seedLegacyOneDrive({ homeAccountId: "acct-A", username: "a@example.com" });
    await r.seedLegacyOneDrive({ homeAccountId: "acct-A", username: "a@example.com" });   // 重复调
    const [e] = await r.list();
    eq((await r.list()).length, 1);
    eq(e.dbId, "defaultStore");
    assert(e.lastActive !== null, "播种即激活（下次 boot 领养）");
    await r.seedLegacyOneDrive({ homeAccountId: "", username: "" });
    eq((await r.list()).length, 1);                     // 空账号不播
  });
});

describe("gallery-registry · lastActive / touch / clearLastActive / forget / relabel", () => {
  it("touch 后 lastActive() 返回最近者；clearLastActive → null（无库模式）；forget 只删条目", async () => {
    const r = createGalleryRegistry(mapKV());
    const a = await r.mintFolder(fakeHandle("A"));
    const b = await r.mintFolder(fakeHandle("B"));
    eq(await r.lastActive(), null);                     // 铸出来未激活
    await r.touch(a.id);
    await new Promise((res) => setTimeout(res, 2));     // 时钟粒度
    await r.touch(b.id);
    eq((await r.lastActive())?.id, b.id);
    await r.clearLastActive();
    eq(await r.lastActive(), null);
    await r.relabel(a.id, "新标签");
    eq((await r.list()).find((x) => x.id === a.id).label, "新标签");
    await r.forget(a.id);
    eq((await r.list()).length, 1);
    await r.forget("no-such-id");                       // 幂等不炸
  });
});
