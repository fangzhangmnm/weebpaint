// P5 preferences 门面：scope 路由（device=device-kv / gallery=collection / session=RAM）+ 播种幂等。
// created 2026-08-27 by Claude Fable 5. node 无 localStorage → device 层走内存降级（无地同路）。
import { describe, it, assert, eq } from "./runner.mjs";
import { preferences, PREF_REGISTRY, wirePreferences, seedDevicePrefsFromLegacy } from "../src/app-prefs.ts";

function fakeCollection(init = {}) {
  const m = new Map(Object.entries(init));
  return {
    init: async () => {},
    getItem: (k, def) => (m.has(k) ? m.get(k) : def),
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
    const local = fakeCollection(), synced = fakeCollection();
    wirePreferences(local, synced);
    eq(preferences.get("single-finger-draw"), false, "默认");
    preferences.set("single-finger-draw", true);
    eq(preferences.get("single-finger-draw"), true);
    eq(synced._m.size, 0, "device 键零 collection 写");
    eq(local._m.size, 0);
    preferences.set("single-finger-draw", false);   // 复位（module 级 device-kv 内存层跨测试共享）
  });
  it("gallery 键：走 collection；未注入前读返 default（boot 安全）", () => {
    wirePreferences(undefined, undefined);
    eq(preferences.get("gen-ai"), false, "未注入 → default");
    const synced = fakeCollection({ "gen-ai": true });
    wirePreferences(fakeCollection(), synced);
    eq(preferences.get("gen-ai"), true, "注入后 = collection 值");
    preferences.set("gen-ai", false);
    eq(synced._m.get("gen-ai"), false, "写直达 collection（LWW/防抖归库）");
  });
  it("session 键（show-fps）：RAM 有效、零持久化", () => {
    const local = fakeCollection(), synced = fakeCollection();
    wirePreferences(local, synced);
    eq(preferences.get("show-fps"), false);
    preferences.set("show-fps", true);
    eq(preferences.get("show-fps"), true, "session 内生效");
    eq(synced._m.size, 0, "不落任何持久层");
  });
});

describe("preferences · legacy 播种（幂等）", () => {
  it("collection 有非默认值 && device-kv 空 → 拷；已有值绝不覆盖", () => {
    const local = fakeCollection({ "color-theme": "night" });
    const synced = fakeCollection();
    wirePreferences(local, synced);
    seedDevicePrefsFromLegacy();
    eq(preferences.get("color-theme"), "night", "从 legacy 迁入");
    local._m.set("color-theme", "day");
    seedDevicePrefsFromLegacy();
    eq(preferences.get("color-theme"), "night", "★ 幂等：已有值不被 legacy 倒灌");
    preferences.set("color-theme", "auto");   // 复位共享内存层
  });
});
