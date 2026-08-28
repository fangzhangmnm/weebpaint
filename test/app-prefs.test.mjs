// P5 preferences 门面：scope 路由（device=device-kv / gallery=collection / session=RAM）+ 播种幂等。
// created 2026-08-27 by Claude Fable 5. node 无 localStorage → device 层走内存降级（无地同路）。
import { describe, it, assert, eq } from "./runner.mjs";
import { preferences, PREF_REGISTRY, wirePreferences, setGalleryLayerLive } from "../src/app-prefs.ts";

function fakeCollection(init = {}) {
  const m = new Map(Object.entries(init));
  return {
    init: async () => {},
    getItem: (k, def) => (m.has(k) ? m.get(k) : def),
    getEntry: (k) => (m.has(k) ? { id: k, uat: 1, value: m.get(k) } : undefined),   // P6 cascade 用（entry 形状同库）
    setItem: (k, v) => { m.set(k, v); },
    onChange: () => () => {},
    flushLocal: async () => ({ ok: true }),
    reconcileWithRemote: async () => {},
    _m: m,
  };
}

describe("preferences · scope 路由", () => {
  it("registry：每键必有 scope（新键必答「换机？换人？」两问）", () => {
    for (const [k, v] of Object.entries(PREF_REGISTRY)) assert(["device", "gallery", "session"].includes(v.scope), k);
  });
  it("device 键：同步读写（无 hydrate 枷锁），不碰 collection", () => {
    const synced = fakeCollection();
    wirePreferences(synced);
    eq(preferences.get("single-finger-draw"), false, "默认");
    preferences.set("single-finger-draw", true);
    eq(preferences.get("single-finger-draw"), true);
    eq(synced._m.size, 0, "device 键零 collection 写");
    preferences.set("single-finger-draw", false);   // 复位（module 级 device-kv 内存层跨测试共享）
  });
  it("gallery 键：走 collection；未注入前读返 default（boot 安全）", () => {
    wirePreferences(undefined);
    eq(preferences.get("gen-ai"), false, "未注入 → default");
    const synced = fakeCollection({ "gen-ai": true });
    wirePreferences(synced);
    eq(preferences.get("gen-ai"), true, "注入后 = collection 值");
    preferences.set("gen-ai", false);
    eq(synced._m.get("gen-ai"), false, "写直达 collection（LWW/防抖归库）");
  });
  it("session 键（show-fps）：RAM 有效、零持久化", () => {
    const synced = fakeCollection();
    wirePreferences(synced);
    eq(preferences.get("show-fps"), false);
    preferences.set("show-fps", true);
    eq(preferences.get("show-fps"), true, "session 内生效");
    eq(synced._m.size, 0, "不落任何持久层");
  });
});

describe("preferences · P6 gallery cascade（gallery ?? device ?? 工厂；P5 §9.7 真落地）", () => {
  it("无库：gallery scope 读写落 device 层（lang 无库也有家）；挂回后 gallery 层覆盖、缺项仍兜底", () => {
    const synced = fakeCollection();
    wirePreferences(synced);
    setGalleryLayerLive(false);                       // 无库模式（null-store）
    eq(preferences.get("lang"), null, "工厂默认起步");
    preferences.set("lang", "ja");                    // 无库写 → device 层
    eq(preferences.get("lang"), "ja", "无库写读一致（真落盘 device）");
    eq(synced._m.has("lang"), false, "★ 没写进 gallery collection（无库时它是内存假象）");
    setGalleryLayerLive(true);                        // 挂上库（gallery 层空）
    eq(preferences.get("lang"), "ja", "★ cascade：gallery 层缺项 → device 兜底可见");
    synced._m.set("lang", "tok");                     // 库自带的 per-gallery 值
    eq(preferences.get("lang"), "tok", "gallery 层有值 → 覆盖 device");
    preferences.set("lang", "en");                    // 挂库时写 → gallery 层
    eq(synced._m.get("lang"), "en", "有库写进 collection");
    eq(preferences.get("lang"), "en");
    preferences.set("lang", null); setGalleryLayerLive(false); preferences.set("lang", null); setGalleryLayerLive(true);   // 复位共享层
  });
});
