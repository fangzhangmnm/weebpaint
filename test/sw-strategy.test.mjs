// service-worker.js 策略路由 mock 测（无浏览器/真机）：vm 载入 SW + mock self/caches/fetch/Response，
// 驱动 fetch 事件，断言 prod=cache-first、dev=network-first、prod 跳 /dev/、导航离线回退 index.html。
// 修「/dev/ 无 SW → 闪退离线打不开」(ai-docs/20260630-pwa-offline-dev-sw.md) 的回归守护。
import { describe, it, assert, eq } from "./runner.mjs";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const SW_PATH = fileURLToPath(new URL("../service-worker.js", import.meta.url));
const ORIGIN = "https://x.test";
const eqJson = (a, b, msg) => eq(JSON.stringify(a), JSON.stringify(b), msg);   // runner 的 eq 是 ===，数组用这个

class MockResponse {
  constructor(body, init = {}) {
    this.body = body;
    this.status = init.status ?? 200;
    this.ok = this.status >= 200 && this.status < 400;
    this._h = init.headers ?? {};
  }
  clone() { return this; }
  get headers() { return { get: (k) => this._h[k] ?? null }; }
}

// scopePath = SW 脚本自己的 pathname（决定 SCOPE_IS_DEV / SCOPE_PATH）。
// installedCache = 模拟「上一次 install 已建好、activate 已清到只剩它」的 weebpaint-<hash> cache 名（重启回归测用；
//   不传 = 没有任何既有 cache，SW 只能开 boot 名——这是 install 从没跑过的沙箱态，老测试全走这条）。
// caches mock 是**名字感知**的（open(name) 按名开、开即建——跟真浏览器一样；keys() 回真名单）：
//   审计 L4 的坏法正是「开错名 → 空 cache」，单一共享 cache 的 mock 看不见这个 bug。
// 返回 { handlers, store(SW 该开的那份), stores(全部), opened(open 过的名), seed, setFetch }。
function loadSW(scopePath, { installedCache = null } = {}) {
  const handlers = {};
  const stores = new Map();   // cache name → Map<url, resp>
  const opened = [];
  const storeOf = (name) => { let m = stores.get(name); if (!m) { m = new Map(); stores.set(name, m); } return m; };
  const cacheOf = (name) => {
    const m = storeOf(name);
    return {
      match: async (reqOrStr) => m.get(typeof reqOrStr === "string" ? reqOrStr : reqOrStr.url) ?? null,
      put: async (reqOrStr, resp) => { m.set(typeof reqOrStr === "string" ? reqOrStr : reqOrStr.url, resp); },
    };
  };
  if (installedCache) storeOf(installedCache);
  const store = storeOf(installedCache ?? "weebpaint-boot");
  let fetchImpl = async () => { throw new Error("offline"); };
  const ctxObj = {
    self: {
      location: { pathname: scopePath, origin: ORIGIN },
      addEventListener: (type, fn) => { handlers[type] = fn; },
      skipWaiting: async () => {},
      clients: { matchAll: async () => [], claim: async () => {} },
      registration: { scope: ORIGIN + "/" },
      __NETWORK_FIRST_TIMEOUT_MS: 40,   // test seam：prod 是 6000，测试不等那么久
    },
    caches: {
      open: async (name) => { opened.push(name); return cacheOf(name); },
      keys: async () => [...stores.keys()],
      delete: async (name) => stores.delete(name),
    },
    // signal 透传：networkFirst 用 AbortController 给 fetch 加超时（v417），mock 得能收下第二个参数。
    fetch: (req, opts) => fetchImpl(req, opts),
    Response: MockResponse,
    URL,
    // 真实 ServiceWorkerGlobalScope 有这三个；vm 沙箱默认没有。缺了的话 networkFirst 里
    //   `new AbortController()` 会抛 → 被它自己的 catch 吞掉 → 静默退化成 cache-first。
    //   （v417 就是这样让两条 dev network-first 测试变红的——沙箱不够真，不是产品坏。）
    AbortController,
    setTimeout,
    clearTimeout,
    console: { warn() {}, log() {}, error() {} },
  };
  vm.createContext(ctxObj);
  vm.runInContext(readFileSync(SW_PATH, "utf8"), ctxObj);
  return {
    handlers, store, stores, opened,
    seed: (url, resp) => store.set(url, resp),
    setFetch: (fn) => { fetchImpl = fn; },
  };
}

// 驱动一次 fetch 事件 → 返回 SW 给出的 Response（早退/未 respondWith → null）。
async function drive(handlers, { url, mode = "navigate" }) {
  let p = null;
  const event = { request: { url, method: "GET", mode }, respondWith: (pr) => { p = pr; } };
  handlers.fetch(event);
  return p ? await p : null;
}

describe("service-worker · 策略路由 (prod cache-first / dev network-first)", () => {
  it("prod：在线命中缓存 → 服缓存（cache-first）", async () => {
    const sw = loadSW("/service-worker.js");
    sw.seed(`${ORIGIN}/index.html`, new MockResponse("CACHED"));
    sw.setFetch(async () => new MockResponse("NET"));
    const r = await drive(sw.handlers, { url: `${ORIGIN}/index.html` });
    eq(r.body, "CACHED", "prod 应优先服缓存");
  });

  it("prod：离线 + 有缓存 → 服缓存", async () => {
    const sw = loadSW("/service-worker.js");
    sw.seed(`${ORIGIN}/index.html`, new MockResponse("CACHED"));
    sw.setFetch(async () => { throw new Error("offline"); });
    const r = await drive(sw.handlers, { url: `${ORIGIN}/index.html` });
    eq(r.body, "CACHED", "离线服缓存");
  });

  it("prod：离线导航 + 无该 url 缓存 → 回退缓存的 index.html", async () => {
    const sw = loadSW("/service-worker.js");
    sw.seed("./index.html", new MockResponse("INDEX"));   // navFallback 用相对键
    sw.setFetch(async () => { throw new Error("offline"); });
    const r = await drive(sw.handlers, { url: `${ORIGIN}/some/route`, mode: "navigate" });
    eq(r.body, "INDEX", "导航离线回退 index.html 壳");
  });

  it("prod：跳过 /dev/ 请求（不 respondWith，留给 dev SW）", async () => {
    const sw = loadSW("/service-worker.js");
    sw.setFetch(async () => new MockResponse("NET"));
    const r = await drive(sw.handlers, { url: `${ORIGIN}/dev/index.html` });
    eq(r, null, "prod 根 SW 应放行 /dev/");
  });

  it("dev：在线 → 永远抓网最新（network-first，不服旧缓存）", async () => {
    const sw = loadSW("/dev/service-worker.js");
    sw.seed(`${ORIGIN}/dev/index.html`, new MockResponse("OLD"));
    sw.setFetch(async () => new MockResponse("NET"));
    const r = await drive(sw.handlers, { url: `${ORIGIN}/dev/index.html` });
    eq(r.body, "NET", "dev 在线必须拿最新（改完即见）");
  });

  it("dev：离线 + 有缓存 → 回退缓存（崩溃可离线重开）", async () => {
    const sw = loadSW("/dev/service-worker.js");
    sw.seed(`${ORIGIN}/dev/index.html`, new MockResponse("CACHED"));
    sw.setFetch(async () => { throw new Error("offline"); });
    const r = await drive(sw.handlers, { url: `${ORIGIN}/dev/index.html` });
    eq(r.body, "CACHED", "dev 离线回退缓存");
  });

  // v417：这条守的是「Ctrl+Shift+R 后浏览器标签页一直转圈」。fetch 只在连接被明确拒绝时才 reject；
  //   半开 TCP / 强制门户下它**永远挂着**，respondWith 拿到永不 settle 的 promise → 页面吊死，
  //   而下面 catch 里的离线回退永远到不了（从没离开 try）。超时把"挂着"翻译成"离线"。
  it("dev：网络挂死（fetch 永不 settle）→ 超时后回退缓存，绝不吊死页面", async () => {
    const sw = loadSW("/dev/service-worker.js");
    sw.seed(`${ORIGIN}/dev/index.html`, new MockResponse("CACHED"));
    let aborted = false;
    sw.setFetch((_req, opts) => new Promise((_res, rej) => {
      // 真 fetch 的行为：收到 abort 信号才 reject，否则永远挂着。
      opts?.signal?.addEventListener?.("abort", () => { aborted = true; rej(new Error("aborted")); });
    }));
    const r = await drive(sw.handlers, { url: `${ORIGIN}/dev/index.html` });
    eq(aborted, true, "必须真的 abort 掉挂死的请求（否则连接一直占着）");
    eq(r.body, "CACHED", "★ 超时后回退缓存——宁可给旧版，也不让标签页一直转圈");
  });

  it("dev：离线导航 + 无该 url 缓存 → 回退 index.html 壳", async () => {
    const sw = loadSW("/dev/service-worker.js");
    sw.seed("./index.html", new MockResponse("INDEX"));
    sw.setFetch(async () => { throw new Error("offline"); });
    const r = await drive(sw.handlers, { url: `${ORIGIN}/dev/whatever`, mode: "navigate" });
    eq(r.body, "INDEX", "dev 导航离线回退 index.html");
  });

  it("dev：在线写穿缓存（下次离线能回退到刚抓的最新）", async () => {
    const sw = loadSW("/dev/service-worker.js");
    sw.setFetch(async () => new MockResponse("FRESH"));
    await drive(sw.handlers, { url: `${ORIGIN}/dev/index.html` });   // 在线一次 → cache.put
    assert(sw.store.get(`${ORIGIN}/dev/index.html`)?.body === "FRESH", "network-first 应顺手刷缓存");
  });
});

// 审计 L4（家族级坑，2026-09-04；同 WebXiaoHeiWu v0.1.7 修法）：浏览器 ~30s 杀掉空闲 SW，重启时顶层重跑、
//   CACHE_NAME 回落 "weebpaint-boot"，而 install 只在 SW 字节变了才重跑 → 此后每个 fetch 都开一个空 cache，
//   预缓存全成孤儿、离线能不能开靠运气。模拟法 = 全新 loadSW（顶层重跑）+ 既有 weebpaint-<hash> cache + **不发 install**。
describe("service-worker · 重启后找回 cache 名（审计 L4）", () => {
  const HASH_CACHE = "weebpaint-0123abcd4567";

  it("prod：重启（无 install）+ 既有 weebpaint-<hash> → fetch 从那份 cache 读，绝不开 boot 名", async () => {
    const sw = loadSW("/service-worker.js", { installedCache: HASH_CACHE });
    sw.seed(`${ORIGIN}/index.html`, new MockResponse("PRECACHED"));
    sw.setFetch(async () => { throw new Error("offline"); });
    const r = await drive(sw.handlers, { url: `${ORIGIN}/index.html` });
    eq(r.body, "PRECACHED", "★ 重启后离线必须命中上次 install 的预缓存");
    eqJson(sw.opened, [HASH_CACHE], "只准开 weebpaint-<hash>，一次都不准开 weebpaint-boot");
    eq(sw.stores.has("weebpaint-boot"), false, "不许顺手建出一个空的 boot cache");
  });

  it("prod：老版 SW 留下的空 weebpaint-boot cache 与 weebpaint-<hash> 并存 → 仍选 <hash>", async () => {
    const sw = loadSW("/service-worker.js", { installedCache: HASH_CACHE });
    sw.stores.set("weebpaint-boot", new Map());   // 修前的 SW 重启时真的会 open("weebpaint-boot") 建出这份
    sw.seed(`${ORIGIN}/index.html`, new MockResponse("PRECACHED"));
    sw.setFetch(async () => { throw new Error("offline"); });
    const r = await drive(sw.handlers, { url: `${ORIGIN}/index.html` });
    eq(r.body, "PRECACHED", "boot 名必须被排除在候选之外");
    eqJson(sw.opened, [HASH_CACHE]);
  });

  it("dev：重启（无 install）+ 离线 → network-first 回退到既有 weebpaint-<hash> cache", async () => {
    const sw = loadSW("/dev/service-worker.js", { installedCache: HASH_CACHE });
    sw.seed(`${ORIGIN}/dev/index.html`, new MockResponse("PRECACHED"));
    sw.setFetch(async () => { throw new Error("offline"); });
    const r = await drive(sw.handlers, { url: `${ORIGIN}/dev/index.html` });
    eq(r.body, "PRECACHED", "dev 离线重开也得找回预缓存");
    eqJson(sw.opened, [HASH_CACHE]);
  });

  it("并发 fetch 共享同一次解析：两条请求同时进来只查一次 keys、都开 <hash>", async () => {
    const sw = loadSW("/service-worker.js", { installedCache: HASH_CACHE });
    sw.seed(`${ORIGIN}/a.css`, new MockResponse("A"));
    sw.seed(`${ORIGIN}/b.css`, new MockResponse("B"));
    sw.setFetch(async () => { throw new Error("offline"); });
    const [a, b] = await Promise.all([
      drive(sw.handlers, { url: `${ORIGIN}/a.css`, mode: "no-cors" }),
      drive(sw.handlers, { url: `${ORIGIN}/b.css`, mode: "no-cors" }),
    ]);
    eqJson([a.body, b.body], ["A", "B"]);
    eqJson(sw.opened, [HASH_CACHE, HASH_CACHE]);
  });
});

// 审计 L5（同 WebXiaoHeiWu）：家族模型包主机 /pwa-models/ 与本站同源（fangzhangmnm.github.io）。
//   SW 只接管自己目录（SCOPE_PATH = 脚本所在目录）之内的同源请求，scope 外一律放行、不复制进壳缓存。
describe("service-worker · 同源 scope 外请求不接管（审计 L5）", () => {
  // prod 真实部署 = GitHub Pages project site 子目录（fangzhangmnm.github.io/weebpaint/），SCOPE_PATH=/weebpaint/；
  //   /pwa-models/ 是同源的兄弟目录。（SW 若真在站根 / 那它本来就拥有整个 origin，无所谓 scope 外。）
  it("prod(scope=/weebpaint/)：兄弟目录 /pwa-models/… 不 respondWith；自己目录内照常", async () => {
    const sw = loadSW("/weebpaint/service-worker.js");
    sw.setFetch(async () => new MockResponse("NET"));
    const r = await drive(sw.handlers, { url: `${ORIGIN}/pwa-models/sensevoice/manifest.json`, mode: "cors" });
    eq(r, null, "scope 外同源请求应放行");
    eqJson(sw.opened, [], "放行的请求不许开 cache");
    const own = await drive(sw.handlers, { url: `${ORIGIN}/weebpaint/index.html` });
    eq(own.body, "NET", "自己目录内正常接管");
  });

  it("dev(scope=/dev/)：站根 /index.html 与 /pwa-models/… 都不接管；/dev/ 内照常", async () => {
    const sw = loadSW("/dev/service-worker.js");
    sw.setFetch(async () => new MockResponse("NET"));
    eq(await drive(sw.handlers, { url: `${ORIGIN}/index.html` }), null, "dev SW 不碰站根");
    eq(await drive(sw.handlers, { url: `${ORIGIN}/pwa-models/x.bin`, mode: "cors" }), null, "dev SW 不碰模型包");
    const r = await drive(sw.handlers, { url: `${ORIGIN}/dev/index.html` });
    eq(r.body, "NET", "自己 scope 内正常接管");
  });
});
