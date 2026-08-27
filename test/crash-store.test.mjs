// T-crash 灾难恢复库（P2）契约测试：拒删/原子领养/单帧覆盖（verdicts §2.2 钉死项）。
// created 2026-08-26 by Claude Fable 5. IDB 适配器本体进真机批；这里用 Map 假件驱动 CrashKV port。
import { describe, it, assert, eq } from "./runner.mjs";
import { createCrashStore, mintLuggageTag } from "../src/crash-store.ts";

function mapKV() {
  const m = new Map();
  return {
    put: async (rec) => { m.set(rec.tag, rec); },
    get: async (tag) => m.get(tag) ?? null,
    take: async (tag) => { const r = m.get(tag) ?? null; if (r) m.delete(tag); return r; },   // Map 单线程天然原子
    delete: async (tag) => { m.delete(tag); },
    list: async () => [...m.values()],
    _m: m,
  };
}
const blob = (s) => new Blob([s]);
const meta = (over = {}) => ({ state: "crash", name: "夏音.ora", at: 1000, homeKind: "file", ...over });

describe("crash-store · 行李牌", () => {
  it("现铸现用、彼此不同（非身份，只是快照收件人地址）", () => {
    const a = mintLuggageTag(), b = mintLuggageTag();
    assert(a !== b && a.startsWith("tag-") && b.startsWith("tag-"));
  });
});

describe("crash-store · 单帧覆盖（同 tag 只留最新一帧）", () => {
  it("put 两次 → 只有一条记录，字节是后写的", async () => {
    const kv = mapKV(); const cs = createCrashStore(kv);
    await cs.put("tag-a", blob("v1"), meta({ at: 1000 }));
    await cs.put("tag-a", blob("v2"), meta({ at: 2000 }));
    eq(kv._m.size, 1, "同 tag 覆盖不堆积");
    eq((await cs.listAtBoot())[0].at, 2000);
  });
});

describe("crash-store · 正常关闭即删 vs pending 拒删（★契约钉）", () => {
  it("crash 态：dropOnCleanClose 删掉（正常关闭即焚）", async () => {
    const kv = mapKV(); const cs = createCrashStore(kv);
    await cs.put("tag-a", blob("x"), meta());
    await cs.dropOnCleanClose("tag-a");
    eq(kv._m.size, 0);
  });
  it("★ pending-adoption 态：dropOnCleanClose **拒绝**——redirect 期的 unload ≠ 关闭", async () => {
    // iOS 登录 redirect 前存的待领养记录：导航离开必然触发 unload/pagehide 的「正常关闭即删」，
    //   不拒的话待领养的画在起跳瞬间就被自己人烧了（回程领养扑空 = 丢画）。
    const kv = mapKV(); const cs = createCrashStore(kv);
    await cs.put("tag-p", blob("x"), meta({ state: "pending-adoption" }));
    await cs.dropOnCleanClose("tag-p");
    eq(kv._m.size, 1, "★ 记录必须幸存");
  });
  it("显式丢弃（discard，用户按钮）：pending 也删——用户明确决定高于自动清扫", async () => {
    const kv = mapKV(); const cs = createCrashStore(kv);
    await cs.put("tag-p", blob("x"), meta({ state: "pending-adoption" }));
    await cs.discard("tag-p");
    eq(kv._m.size, 0);
  });
  it("drop 不存在的 tag → 静默 no-op（清扫路径不许炸 unload）", async () => {
    const cs = createCrashStore(mapKV());
    await cs.dropOnCleanClose("tag-ghost");   // 不抛即过
  });
});

describe("crash-store · 领养（事务化取+删，防双领养）", () => {
  it("第一次 adopt 拿到字节并删记录；第二次 → null（双领养第二个必须扑空）", async () => {
    const kv = mapKV(); const cs = createCrashStore(kv);
    await cs.put("tag-a", blob("bytes"), meta());
    const first = await cs.adopt("tag-a");
    assert(first != null, "第一次拿到");
    eq(kv._m.size, 0, "取即删（事务化）");
    eq(await cs.adopt("tag-a"), null, "第二次扑空——绝不双领养");
  });
});

describe("crash-store · boot 扫描", () => {
  it("listAtBoot：只出 meta（不搬字节）、新→旧排序", async () => {
    const kv = mapKV(); const cs = createCrashStore(kv);
    await cs.put("tag-old", blob("x"), meta({ at: 1000, name: "旧.ora" }));
    await cs.put("tag-new", blob("y"), meta({ at: 2000, name: "新.ora" }));
    const l = await cs.listAtBoot();
    eq(l.length, 2);
    eq(l[0].name, "新.ora");
    eq(l[1].name, "旧.ora");
    assert(!("bytes" in l[0]), "meta 不带字节（boot 扫描别把大 blob 全搬内存）");
  });
});
