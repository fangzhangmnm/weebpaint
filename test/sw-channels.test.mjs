// test/sw-channels.test.mjs —— 正式版 / 开发版同一个 origin，壳缓存不许互删（家族 F-145，工单 G）。created 2026-11-03 by Claude Opus 5.5
//   把 service-worker.js 的源码在 node 里装起来，假 caches，真跑 activate。反证：把 isMyShellCache 改回 startsWith("weebpaint-") = 第一、二条红。
import { describe, it, eq, assert } from "./runner.mjs";
import fs from "node:fs";
const { isOwnShellCache, OWN_CACHE_PREFIX, DEV_CACHE_PREFIX } = await import("../src/shell-reset.ts");

function loadSw(pathname, keys) {
  const src = fs.readFileSync(new URL("../service-worker.js", import.meta.url), "utf8");
  const handlers = {};
  const store = new Set(keys);
  const fakeSelf = {
    location: { pathname, origin: "https://weebpaint.com", href: "https://weebpaint.com" + pathname },
    addEventListener: (t, fn) => { handlers[t] = fn; },
    skipWaiting: async () => {},
    clients: { claim: async () => {}, matchAll: async () => [] },
    registration: { scope: "https://weebpaint.com" + pathname.replace(/[^/]*$/, "") },
  };
  const fakeCaches = {
    keys: async () => [...store],
    delete: async (k) => store.delete(k),
    open: async (k) => { store.add(k); return { put: async () => {}, match: async () => undefined, keys: async () => [], delete: async () => true }; },
    match: async () => undefined,
  };
  new Function("self", "caches", "fetch", "console", "location", src)(fakeSelf, fakeCaches, async () => new Response(""), console, fakeSelf.location);
  return { handlers, store };
}
const activate = async (sw) => { let p; sw.handlers.activate({ waitUntil: (x) => { p = x; } }); await p; };

describe("service worker 缓存分频道（F-145）", () => {
  const ALL = ["weebpaint-aaa111", "weebpaint-boot", "weebpaint-dev-bbb222", "weebpaint-dev-boot", "pwa-models", "kudsrocket-dev-x"];
  it("开发版 activate：不删正式版的壳，也不碰兄弟 app 和共享模型", async () => {
    const sw = loadSw("/dev/service-worker.js", ALL);
    await activate(sw);
    assert(sw.store.has("weebpaint-aaa111"), "正式版的壳还在");
    assert(!sw.store.has("weebpaint-dev-bbb222"), "自己的旧壳清了");
    assert(sw.store.has("pwa-models") && sw.store.has("kudsrocket-dev-x"), "别人的不碰");
  });
  it("正式版 activate：不删开发版的壳", async () => {
    const sw = loadSw("/service-worker.js", ALL);
    await activate(sw);
    assert(sw.store.has("weebpaint-dev-bbb222"), "开发版的壳还在");
    assert(!sw.store.has("weebpaint-aaa111"), "自己的旧壳清了");
    assert(sw.store.has("pwa-models") && sw.store.has("kudsrocket-dev-x"), "别人的不碰");
  });
  it("重启后找回缓存名：只认自己频道的", () => {
    const src = fs.readFileSync(new URL("../service-worker.js", import.meta.url), "utf8");
    assert(/\(await caches\.keys\(\)\)\.filter\(\(k\) => isMyShellCache\(k\) && k !== BOOT_CACHE\)/.test(src));
    assert(/CACHE_NAME = `\$\{SHELL_PREFIX\}\$\{bundleHash\}`/.test(src), "开发版缓存名带 dev-");
  });
  it("强制更新（shell-reset）同一条规矩", () => {
    eq(OWN_CACHE_PREFIX, "weebpaint-"); eq(DEV_CACHE_PREFIX, "weebpaint-dev-");
    assert(isOwnShellCache("weebpaint-dev-x", true)); assert(!isOwnShellCache("weebpaint-x", true));
    assert(isOwnShellCache("weebpaint-x", false)); assert(!isOwnShellCache("weebpaint-dev-x", false));
    assert(!isOwnShellCache("pwa-models", false)); assert(!isOwnShellCache("pwa-models", true));
    const src = fs.readFileSync(new URL("../src/shell-reset.ts", import.meta.url), "utf8");
    assert(/if \(isOwnShellCache\(k, dev\)\) await caches\.delete\(k\)/.test(src), "清缓存走它");
    assert(!/k\.startsWith\(OWN_CACHE_PREFIX\)\) await caches\.delete/.test(src), "不许按总前缀删");
  });
});
