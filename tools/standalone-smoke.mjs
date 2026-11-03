// 单文件两种形态的 headless smoke（Chromium；playwright 档，不进 npm test 硬线）。
// created 2026-08-27 by Claude Fable 5（file: 形）· 2026-11-03 Claude Opus 5.5 加 itch 形（家族规则书 §4 第 9 项 / 工单 B 第 5 步）
// 用法：bash scripts/build-standalone.sh && node tools/standalone-smoke.mjs [site|local|itch]（不给 = 三个都跑）
//   site = 官网形态对照（仓根经 http://127.0.0.1 服 index.html，同 tools/preflight/harness.mjs）：网盘入口是真入口、不灰、没有开局一行——「不退化」那一列。
//
// 两种形态 = 家族规则书 §2 的两列（同一份字节，itch 那份 <head> 多烤一行部署标记，scripts/pack-standalone.mjs 第 7 步）：
//   local（备用版）= dist/weebpaint-standalone.html 以 file:// 顶层打开（双击）。
//   itch            = dist/weebpaint-itch.html 由 http://127.0.0.1:P2 服、套在 http://localhost:P1 的外页 iframe 里——两个端口两个 host
//                     = 跨站子框（itch 真机 = itch.io 页面套 html-classic.itch.zone，同样跨站）：选文件框被禁、存储按顶层站点分区。
// 两种都核：开得起来（canvas）· EMBED 生效 · 没 SW · **没载 MSAL**（window.msal 不在、网络里没有微软登录 / Graph 请求）·
//   网盘入口灰 + 副标题带「weebpaint.com」· 开局一行在 · 记住口令按 §2（local：库被读过 = 开着；itch：原样不动 = 关着）·
//   **脏文档关页时挽留框弹不弹**（page.close({ runBeforeUnload: true }) + page.on("dialog")，如实打印，不弹 = FAIL）。
//   itch 另核：存 = 下载（点顶栏「保存」→ download 事件；和 Ctrl+S 同一个函数）。
// ⚠ 夹具不是真 itch：itch 的 iframe 还带 sandbox / allow 列表（以真机为准，攒批）；这里验的是「跨站子框」这一层浏览器行为。
import { chromium } from "playwright";
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const which = process.argv[2] ?? "all";
const REMEMBER_DB = "weebpaint-bd6cece69075d759.remember";
const SITE_HOST = "weebpaint.com";
const MS_HOSTS = /login\.microsoftonline\.com|login\.live\.com|graph\.microsoft\.com|onedrive\.live\.com/;
const settle = (ms = 3000) => new Promise((r) => setTimeout(r, ms));
const failures = [];
const fail = (shape, msg) => { failures.push(`[${shape}] ${msg}`); console.error(`FAIL [${shape}]: ${msg}`); };

// 「在这台设备上记住密码」库：塞一条合法记录 / 读回来 / 收拾（file:// 共桶、跨站分区都别留东西）。
const idbRecord = (target, mode) => target.evaluate(([db, mode]) => new Promise((resolve) => {
  if (mode === "drop") { const q = indexedDB.deleteDatabase(db); q.onsuccess = q.onerror = q.onblocked = () => resolve("dropped"); return; }
  const req = indexedDB.open(db, 1);
  req.onupgradeneeded = () => req.result.createObjectStore("secret");
  req.onerror = () => resolve("idb-unavailable");
  req.onsuccess = async () => {
    const d = req.result, done = (v) => { d.close(); resolve(v); };
    if (mode === "seed") {
      const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
      const iv = crypto.getRandomValues(new Uint8Array(12)); const expiresAt = Date.now() + 86400_000;
      const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: new TextEncoder().encode(`internal-encryption.remember.v1|${expiresAt}`) }, key, new TextEncoder().encode("smoke-pw"));
      const tx = d.transaction("secret", "readwrite"); tx.objectStore("secret").put({ v: 1, key, iv, ct, expiresAt }, "password"); tx.oncomplete = () => done("seeded");
    } else {
      const g = d.transaction("secret").objectStore("secret").get("password"); g.onsuccess = () => done(g.result ? "present" : "absent");
    }
  };
}), [REMEMBER_DB, mode]);

// 页面内探针（顶层页或 iframe 都行）
const probe = (target) => target.evaluate(async (site) => {
  const g = window;
  const canvas = document.querySelector("canvas");
  const box = document.getElementById("galleryConnectBox");
  const grey = box?.querySelector(".menu-item-unavailable");
  const notices = [...document.querySelectorAll("[data-notice-id]")].map((n) => ({ id: n.dataset.noticeId, text: n.textContent || "" }));
  return {
    embed: !!g.__WEEBPAINT_EMBED__,
    embedKeys: g.__WEEBPAINT_EMBED__ ? Object.keys(g.__WEEBPAINT_EMBED__).length : 0,
    swRegs: await (async () => { try { return "serviceWorker" in navigator ? (await navigator.serviceWorker.getRegistrations()).length : 0; } catch { return 0; } })(),   // file:// 查询本身就抛 = 无 SW
    hasCanvas: !!canvas,
    msalLoaded: typeof g.msal !== "undefined",
    deploymentMeta: document.querySelector('meta[name="deployment"]')?.getAttribute("content") ?? null,
    cloudEntryGrey: !!grey,
    cloudEntryAriaDisabled: grey?.getAttribute("aria-disabled") ?? null,
    cloudEntrySub: grey?.querySelector(".menu-item-sub")?.textContent ?? null,
    folderEntry: !!box && [...box.querySelectorAll(".menu-item")].some((b) => b.querySelector("svg use")?.getAttribute("href") === "#folder-open"),
    siteHint: notices.find((n) => n.id === "site-hint")?.text ?? null,
    siteHintMentionsSite: notices.some((n) => n.id === "site-hint" && n.text.includes(site)),
    title: document.title,
  };
}, SITE_HOST);

// 在 canvas 中间画一笔（真输入 = 这一帧拿到用户激活，beforeunload 挽留框要它）
async function stroke(page, target) {
  const c = await target.$("canvas");
  const bb = await c.boundingBox();
  const x = bb.x + bb.width / 2, y = bb.y + bb.height / 2;
  await page.mouse.move(x - 60, y - 20); await page.mouse.down();
  for (let i = 0; i <= 12; i++) await page.mouse.move(x - 60 + i * 10, y - 20 + Math.sin(i / 2) * 15, { steps: 2 });
  await page.mouse.up();
  await settle(800);
  return target.evaluate(() => window.WeebPaint?.docState?.() ?? null);
}

// 关页挽留：脏着关页 → 浏览器弹 beforeunload 框吗（如实记）
async function closeWithBeforeUnload(page) {
  let dialog = null;
  page.on("dialog", (d) => { dialog = d.type(); d.accept().catch(() => {}); });
  await page.close({ runBeforeUnload: true });
  for (let i = 0; i < 30 && !dialog; i++) await settle(100);
  return dialog;   // "beforeunload" | null
}

function commonChecks(shape, p, msReqs) {
  if (!p.embed || p.embedKeys < 6) fail(shape, "embed 缺失");
  if (p.swRegs !== 0) fail(shape, "SW 注册数 = " + p.swRegs);
  if (!p.hasCanvas) fail(shape, "无 canvas（boot 挂了）");
  if (p.msalLoaded) fail(shape, "window.msal 在：网盘开关关着却载了 MSAL");
  if (msReqs.length) fail(shape, "网络里有微软登录 / Graph 请求：" + msReqs.slice(0, 3).join(" "));
  if (!p.cloudEntryGrey || p.cloudEntryAriaDisabled !== "true") fail(shape, "网盘入口没画灰");
  if (!p.cloudEntrySub?.includes(SITE_HOST)) fail(shape, "灰入口副标题没有「去官网 " + SITE_HOST + "」：" + p.cloudEntrySub);
  if (!p.siteHintMentionsSite) fail(shape, "开局一行没出（或没带官网网址）");
}

async function runLocal(browser) {
  const shape = "local";
  const file = "file://" + resolve("dist/weebpaint-standalone.html");
  const context = await browser.newContext();
  const page = await context.newPage();
  const errors = [], msReqs = [];
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  page.on("console", (m) => { if (m.type() === "error") errors.push("console.error: " + m.text()); });
  page.on("request", (r) => { if (MS_HOSTS.test(r.url())) msReqs.push(r.url()); });
  await page.goto(file, { waitUntil: "load" }); await settle();
  // 记住口令（备用版 = 开着，2026-11-03）：塞一条 → 重开 → 开页恢复读到它、没 verifier → 忘掉 = 库里没了（读过 = 开着）
  const seeded = await idbRecord(page, "seed");
  let remember = seeded;
  if (seeded === "seeded") { await page.reload({ waitUntil: "load" }); await settle(); remember = await idbRecord(page, "read"); await idbRecord(page, "drop"); }
  const p = await probe(page);
  p.rememberRecordAfterReload = remember;
  const st = await stroke(page, page);
  p.dirtyAfterStroke = st?.dirty ?? null;
  p.beforeUnloadDialog = await closeWithBeforeUnload(page);
  console.log(`[${shape}] ` + JSON.stringify(p, null, 2));
  commonChecks(shape, p, msReqs);
  if (p.deploymentMeta !== null) fail(shape, "备用版不该有 itch 标记");
  if (remember !== "absent" && remember !== "idb-unavailable") fail(shape, "备用版的「记住密码」库没被读过（应开着）: " + remember);
  if (!p.folderEntry) fail(shape, "备用版（Chromium）应能挂本地文件夹图库");
  if (p.dirtyAfterStroke !== true) fail(shape, "画了一笔文档没变脏（关页挽留测不了）: " + JSON.stringify(st));
  if (p.beforeUnloadDialog !== "beforeunload") fail(shape, "脏文档关页没弹挽留框");
  const fatal = errors.filter((e) => !/favicon|manifest/.test(e));
  if (fatal.length) fail(shape, "页面错误：\n" + fatal.join("\n"));
  await context.close();
}

function serve(handler) {
  return new Promise((res) => { const s = createServer(handler); s.listen(0, "127.0.0.1", () => res(s)); });
}

async function runItch(browser) {
  const shape = "itch";
  const itchHtml = readFileSync(resolve("dist/weebpaint-itch.html"));
  const inner = await serve((req, res) => {
    if (req.url === "/" || req.url.startsWith("/index.html")) { res.writeHead(200, { "content-type": "text/html; charset=utf-8" }); res.end(itchHtml); }
    else { res.writeHead(404); res.end(); }
  });
  const P2 = inner.address().port;
  const outer = await serve((req, res) => {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(`<!doctype html><meta charset="utf-8"><title>itch fixture</title><style>body{margin:0}iframe{display:block;width:100vw;height:100vh;border:0}</style>
<iframe id="game" src="http://127.0.0.1:${P2}/index.html" allow="fullscreen; gamepad"></iframe>`);
  });
  const P1 = outer.address().port;
  const context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage();
  const errors = [], msReqs = [];
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  page.on("console", (m) => { if (m.type() === "error") errors.push("console.error: " + m.text()); });
  page.on("request", (r) => { if (MS_HOSTS.test(r.url())) msReqs.push(r.url()); });
  const frame = async () => { for (let i = 0; i < 50; i++) { const f = page.frames().find((x) => x.url().startsWith(`http://127.0.0.1:${P2}/`)); if (f) return f; await settle(100); } throw new Error("game frame not found"); };
  await page.goto(`http://localhost:${P1}/`, { waitUntil: "load" }); await settle();
  // 记住口令（itch = 关着）：塞一条 → 重开 → 必须原样不动（官网 / 备用版没 verifier 时开页就删它 = 读过；这里不动 = 根本没读）
  let f = await frame();
  const seeded = await idbRecord(f, "seed");
  let remember = seeded;
  if (seeded === "seeded") { await page.reload({ waitUntil: "load" }); await settle(); f = await frame(); remember = await idbRecord(f, "read"); await idbRecord(f, "drop"); }
  const p = await probe(f);
  p.embedded = await f.evaluate(() => { try { return window.self !== window.top; } catch { return true; } });
  p.rememberRecordAfterReload = remember;
  const st = await stroke(page, f);
  p.dirtyAfterStroke = st?.dirty ?? null;
  // 存 = 下载：被跨站套着没有存文件框 → 点顶栏「保存」（和 Ctrl+S 同一个 smartSaveAndPush）走下载。
  //   为什么不按 Ctrl+S：headless 里在 canvas 上画一笔不会把键盘焦点带进 iframe（frame 的 document.hasFocus() = false），
  //   键落在外页上——真 itch 上是不是也这样 = 真机项（报告第 6 节），夹具不替它下结论。
  p.frameHasFocusAfterStroke = await f.evaluate(() => document.hasFocus());
  const dl = page.waitForEvent("download", { timeout: 8000 }).then((d) => d.suggestedFilename()).catch(() => null);
  await f.click("#topSaveBtn");
  p.saveDownload = await dl;
  p.dirtyAfterSave = (await f.evaluate(() => window.WeebPaint?.docState?.() ?? null))?.dirty ?? null;
  p.beforeUnloadDialog = await closeWithBeforeUnload(page);
  console.log(`[${shape}] ` + JSON.stringify(p, null, 2));
  commonChecks(shape, p, msReqs);
  if (p.deploymentMeta !== "itch") fail(shape, "itch 那份没有部署标记");
  if (!p.embedded) fail(shape, "夹具没套成（iframe 里 self === top）");
  if (remember !== "present" && remember !== "idb-unavailable") fail(shape, "itch 版读了「记住密码」的库（应整个关掉）: " + remember);
  if (p.folderEntry) fail(shape, "itch 版不该露「连接文件夹」");
  if (p.dirtyAfterStroke !== true) fail(shape, "画了一笔文档没变脏: " + JSON.stringify(st));
  if (!p.saveDownload || !/\.ora$/.test(p.saveDownload)) fail(shape, "「保存」没变成下载 .ora: " + p.saveDownload);
  if (p.beforeUnloadDialog !== "beforeunload") fail(shape, "脏文档关页没弹挽留框（跨站子框里的 beforeunload）——itch 行承重层少一片，报告标红");
  const fatal = errors.filter((e) => !/favicon|manifest/.test(e));
  if (fatal.length) fail(shape, "页面错误：\n" + fatal.join("\n"));
  await context.close();
  inner.close(); outer.close();
}

async function runSite(browser) {
  const shape = "site";
  const { startServer } = await import("./preflight/harness.mjs");
  const srv = await startServer();
  const context = await browser.newContext();
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  await page.goto(srv.url, { waitUntil: "load" }); await settle(4000);   // 仓根 index.html（harness 的 url 已带结尾斜杠）
  const p = await page.evaluate(() => {
    const box = document.getElementById("galleryConnectBox");
    const items = box ? [...box.querySelectorAll(".menu-item")] : [];
    const cloud = items.find((b) => b.querySelector("svg use")?.getAttribute("href") === "#cloud");
    return {
      hasCanvas: !!document.querySelector("canvas"),
      deploymentMeta: document.querySelector('meta[name="deployment"]')?.getAttribute("content") ?? null,
      cloudEntry: !!cloud, cloudEntryGrey: !!cloud?.classList.contains("menu-item-unavailable"),
      siteHint: !![...document.querySelectorAll("[data-notice-id]")].find((n) => n.dataset.noticeId === "site-hint"),
    };
  });
  console.log(`[${shape}] ` + JSON.stringify(p, null, 2));
  if (!p.hasCanvas) fail(shape, "无 canvas（boot 挂了）");
  if (p.deploymentMeta !== null) fail(shape, "官网不该有 itch 标记");
  if (!p.cloudEntry || p.cloudEntryGrey) fail(shape, "官网的「连接 OneDrive…」应是真入口（在、不灰）");
  if (p.siteHint) fail(shape, "官网不该出开局一行");
  if (errors.length) fail(shape, "页面错误：\n" + errors.join("\n"));
  await context.close(); srv.close();
}

const browser = await chromium.launch();
try {
  if (which === "all" || which === "site") await runSite(browser);
  if (which === "all" || which === "local") await runLocal(browser);
  if (which === "all" || which === "itch") await runItch(browser);
} finally { await browser.close(); }
if (failures.length) { console.error(`\nSMOKE FAIL (${failures.length})`); process.exit(1); }
console.log("SMOKE OK");
