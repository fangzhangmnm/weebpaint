#!/usr/bin/env node
// test/probes/probe-cloud-gate.mjs —— 工单 G 无头验收：闸门（设计稿 §7）+ F-147 B（点「有新版本」前）+ F-148（第二台第一次开纯云端加密画）。created 2026-11-03 by Claude Opus 5.5
//   真 bundle、真库、真 7z；假的只有两头：MSAL 脚本（静默续签结果可控）和 Graph（内存小网盘，可挂起、可计数）。headless。
//   用法：bash scripts/build.sh 之后 `node test/probes/probe-cloud-gate.mjs [gate|reload|enc|exit|back]`（不给 = 全跑，≈ 90 s；⑤′ 真等 8 s）。
import { createRequire } from "node:module";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MSAL_STUB, fakeDrive } from "./fake-cloud.mjs";
const here = path.dirname(fileURLToPath(import.meta.url)), repo = path.join(here, "../..");
const { chromium } = createRequire(path.join(repo, "package.json"))("playwright");
const ORIGIN = "http://127.0.0.1:8767";
const MIME = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".json": "application/json", ".wasm": "application/wasm", ".webmanifest": "application/manifest+json", ".ico": "image/x-icon", ".jpg": "image/jpeg" };
const failures = [];
const eq = (a, b, what) => { if (a !== b) { failures.push(what); console.error(`  ✗ ${what}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); } else console.log("  ✓", what); };
const ok = (c, what) => eq(!!c, true, what);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const only = process.argv[2] ?? "all";
const PW = "probe-only-password";

const browser = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
async function device(drive, msal = "ok") {
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 720 }, deviceScaleFactor: 1, serviceWorkers: "block", locale: "zh-CN" });
  await ctx.route(`${ORIGIN}/**`, async (route) => {
    let p = decodeURIComponent(new URL(route.request().url()).pathname); if (p === "/") p = "/index.html";
    const f = path.join(repo, p);
    if (!existsSync(f)) return route.fulfill({ status: 404, body: "" });
    await route.fulfill({ status: 200, contentType: MIME[path.extname(f)] ?? "application/octet-stream", body: readFileSync(f) });
  });
  await drive.attach(ctx);
  await ctx.route(/msal-browser\.min\.js/, (r) => r.fulfill({ contentType: "text/javascript", body: MSAL_STUB }));
  await ctx.addInitScript((m) => {
    if (!localStorage.getItem("__fake_msal")) localStorage.setItem("__fake_msal", m);
    if (localStorage.getItem("__fake_offline") === "1") Object.defineProperty(navigator, "onLine", { get: () => false, configurable: true });
    window.__gateLog = [];
    const watch = () => {
      const g = document.getElementById("syncGateSheet");
      if (!g) return false;
      const rec = () => window.__gateLog.push({ t: performance.now(), up: g.hasAttribute("data-open"), title: document.getElementById("syncGateTitle")?.textContent ?? "" });
      new MutationObserver(rec).observe(g, { attributes: true, attributeFilter: ["data-open"] });
      return true;
    };
    if (!watch()) new MutationObserver((_, o) => { if (watch()) o.disconnect(); }).observe(document, { childList: true, subtree: true });
  }, msal);
  const page = await ctx.newPage(); page.setDefaultTimeout(20000);
  page.on("pageerror", (e) => { failures.push("pageerror: " + e.message); console.error("  ✗ pageerror:", e.message.slice(0, 200)); });
  const P = (fn, arg) => page.evaluate(fn, arg);
  const h = {
    ctx, page, drive,
    ready: () => page.waitForFunction(() => globalThis.__wpProbe),
    settled: (timeout = 20000) => page.waitForFunction(() => { const p = globalThis.__wpProbe; return p && !p.gate.isRunning() && !p.session.saving; }, null, { timeout }),
    gateUp: () => P(() => document.getElementById("syncGateSheet").hasAttribute("data-open")),
    gateText: () => P(() => document.getElementById("syncGateSheet").textContent.replace(/\s+/g, " ").trim()),
    gateClick: (label) => page.locator("#syncGateActions button", { hasText: label }).click(),
    notices: () => P(() => [...document.querySelectorAll("[id^='notice'], .notice, .wb-notice")].map((n) => n.textContent).join(" | ")),
    diag: () => P(() => globalThis.__wpProbe.diag()),
    log: () => P(() => window.__gateLog),
    offline: () => P(() => globalThis.__wpProbe.isUserOffline()),
    state: () => P(async () => {
      const p = globalThis.__wpProbe, be = p.galleryBackend(); let storeDirty = -1;
      if (be.kind === "live") storeDirty = await be.store.files.dirty.count().catch(() => -2);
      return { home: p.session.home?.path ?? p.session.home?.kind ?? null, dirty: p.session.dirty, pp: p.session.pushPending, enc: p.session.enc.encrypted, storeDirty, att: p.galleryAttachment.state().kind };
    }),
    draw: async (dx = 0) => {
      const box = await page.locator("#board, canvas").first().boundingBox();
      const cx = box.x + box.width / 2 + dx, cy = box.y + box.height / 2;
      await page.mouse.move(cx - 60, cy - 30); await page.mouse.down(); await page.mouse.move(cx + 60, cy + 30, { steps: 8 }); await page.mouse.up();
      await sleep(150);
    },
    boot: async () => { await page.goto(`${ORIGIN}/`, { waitUntil: "load" }); await h.ready(); await sleep(400); await h.settled(); },
    reload: async (msalMode, offline = false) => {
      await P(([m, o]) => { localStorage.setItem("__fake_msal", m); if (o) localStorage.setItem("__fake_offline", "1"); else localStorage.removeItem("__fake_offline"); }, [msalMode, offline]);
      drive.requests = 0;
      await page.reload({ waitUntil: "load" }); await h.ready();
    },
    /** 一台登录好、挂着 OneDrive 的设备，开着一幅推上去的画。 */
    prepare: async () => {
      await h.boot();                 // 第一次：登录 → 名册播种
      await page.reload({ waitUntil: "load" }); await h.ready(); await sleep(400); await h.settled();   // 第二次：挂上
      await page.waitForFunction(() => globalThis.__wpProbe.galleryAttachment.state().kind === "attached");
      await h.draw();
      await page.waitForFunction(() => globalThis.__wpProbe.session.home?.kind === "gallery");
      await P(() => globalThis.__wpProbe.session.saveAndPush());
      await h.settled();
      return (await h.state()).home;
    },
    hide: () => P(() => { Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" }); document.dispatchEvent(new Event("visibilitychange", { bubbles: true })); }),
    show: () => P(() => { delete document.visibilityState; document.dispatchEvent(new Event("visibilitychange", { bubbles: true })); }),
  };
  return h;
}

// ─────────────────────────────── 闸门（§7）───────────────────────────────
if (only === "all" || only === "gate") {
  console.log("① 没挂库：零闸");
  {
    const d = await device(fakeDrive(), "none");
    await d.boot(); await sleep(800);
    eq((await d.log()).filter((x) => x.up).length, 0, "罩子从没出现");
    ok(/gate → no-gate/.test(await d.diag()), "黑匣子：no-gate");
    await d.ctx.close();
  }
  const drive = fakeDrive();
  const d = await device(drive);
  const docPath = await d.prepare();
  ok(docPath, `准备好：挂着 OneDrive，开着一幅画（${docPath}）`);
  console.log("② 登录好 + 云端没动：罩一下就放行，没有面");
  {
    await d.reload("ok"); await d.settled(); await sleep(300);
    const log = await d.log(), ups = log.filter((x) => x.up), downs = log.filter((x) => !x.up);
    const ms = ups.length && downs.length ? Math.round(downs.at(-1).t - ups[0].t) : -1;
    ok(ups.length >= 1 && !(await d.gateUp()), `罩了又走（${ms} ms）`);
    ok(ms >= 0 && ms < 300, `< 300 ms（${ms} ms）`);
    eq((await d.state()).home, docPath, "回到这幅画");
  }
  console.log("③ 续签失败：两个钮；离线继续 → 零请求；回线 → 条收掉");
  {
    await d.reload("interaction");
    await d.page.waitForFunction(() => /过期/.test(document.getElementById("syncGateSheet").textContent) && document.querySelectorAll("#syncGateActions button").length === 2);
    const t3 = await d.gateText();
    ok(/网盘没连上/.test(t3) && /登录过期了/.test(t3) && /重新登录/.test(t3) && /离线继续/.test(t3), `闸：${t3.slice(0, 40)}`);
    eq(await d.page.evaluate(() => globalThis.__wpProbe.allows("key:shortcut")), false, "罩着：键盘快捷键不放");
    eq(await d.page.evaluate(() => globalThis.__wpProbe.allows("pointer:draw")), false, "罩着：落笔不放");
    ok(/code=login_required/.test(await d.diag()), "⑧ 黑匣子有原因码");
    await d.gateClick("离线继续"); await d.settled();
    ok(!(await d.gateUp()) && (await d.offline()), "放行 + 离线");
    await sleep(300);
    ok(/离线/.test(await d.page.evaluate(() => document.body.innerText)), "常驻条在");
    const r0 = drive.requests, s0 = await d.page.evaluate(() => window.__fakeSilent ?? 0);
    await d.page.evaluate(async () => { const be = globalThis.__wpProbe.galleryBackend(); const c = be.store.collection("synced-app-state"); await c.reconcileWithRemote?.(); });
    await sleep(1200);
    eq(drive.requests, r0, "离线：Graph 零请求（含 collection，store 2.2.4）");
    eq(await d.page.evaluate(() => window.__fakeSilent ?? 0), s0, "离线：不再续签");
    await d.draw(5);
    eq(await d.page.evaluate(() => globalThis.__wpProbe.session.dirty), true, "离线照常能画");
    await d.page.evaluate(() => { localStorage.setItem("__fake_msal", "ok"); window.dispatchEvent(new Event("online")); });
    await d.page.waitForFunction(() => !globalThis.__wpProbe.isUserOffline());
    await sleep(400);
    ok(!(await d.offline()), "回线 + 续签成：离线收掉");
    ok(!/还有 \d+ 份没传上去/.test(await d.page.evaluate(() => document.body.innerText)), "常驻条收掉");
    await d.page.evaluate(() => globalThis.__wpProbe.session.saveAndPush()); await d.settled();
  }
  console.log("④ 没网：直接进闸，不等超时");
  {
    await d.reload("ok", true);
    await d.page.waitForFunction(() => /现在没有网络/.test(document.getElementById("syncGateSheet").textContent) && document.querySelectorAll("#syncGateActions button").length === 2);
    ok(true, "闸：现在没有网络");
    await d.gateClick("离线继续"); await d.settled();
    console.log("⑥ 已选离线且仍没网：醒来不弹闸，条还在");
    await d.hide(); await d.show(); await sleep(500);
    ok(!(await d.gateUp()), "没弹闸");
    ok(/离线/.test(await d.page.evaluate(() => document.body.innerText)), "条还在");
  }
  console.log("⑤ 云端慢：点「先离线用」立刻放行；不点 8 s 进闸");
  {
    await d.reload("hang");
    await d.page.waitForFunction(() => /先离线用/.test(document.getElementById("syncGateActions").textContent));
    const t0 = Date.now();
    await d.gateClick("先离线用"); await d.settled(3000);
    ok(Date.now() - t0 < 1500 && !(await d.gateUp()), `立刻放行（${Date.now() - t0} ms）`);
    await d.reload("hang");
    const t1 = Date.now();
    await d.page.waitForFunction(() => /网盘没有回应/.test(document.getElementById("syncGateSheet").textContent), null, { timeout: 14000 });
    const waited = Date.now() - t1;
    ok(waited > 5000 && waited < 13000, `8 s 左右进闸（${waited} ms）`);
    await d.gateClick("离线继续"); await d.settled();
  }
  console.log("⑥′ 醒来走同一套；登录好就放行");
  {
    await d.reload("ok"); await d.settled(); await sleep(300);
    await d.page.evaluate(() => { globalThis.__wpProbe.gateTune.recheckMs = 0; });
    const n = (await d.log()).filter((x) => x.up).length;
    await d.hide(); await d.show(); await sleep(500); await d.settled();
    ok((await d.log()).filter((x) => x.up).length > n, "回前台罩了一下");
    ok(!(await d.gateUp()), "放行");
    ok(/wake \(visible\)|gate: wake pass/.test(await d.diag()), "黑匣子记了");
  }
  await d.ctx.close();

  console.log("真分叉：这台有没传的改动，别的设备推了新版 → 开机弹库的面（叠在罩子上），选了才放行；Esc 能关");
  {
    const drive2 = fakeDrive();
    const A = await device(drive2), B = await device(drive2);
    const p = await A.prepare();
    await B.boot(); await B.page.reload({ waitUntil: "load" }); await B.ready(); await sleep(400); await B.settled();
    await B.page.waitForFunction(() => globalThis.__wpProbe.galleryAttachment.state().kind === "attached");
    await B.page.evaluate((x) => globalThis.__wpProbe.session.open({ name: x }), p); await B.settled();
    eq((await B.state()).home, p, "第二台开着同一幅");
    await B.draw(9);
    await B.page.evaluate(() => globalThis.__wpProbe.session.save()); await sleep(300);
    eq((await B.state()).storeDirty, 1, "第二台：有没传的改动");
    await A.draw(20);
    await A.page.evaluate(() => globalThis.__wpProbe.session.saveAndPush()); await A.settled();
    const puts = drive2.puts.length;
    await B.reload("ok");
    await B.page.waitForFunction(() => /云端有新版本/.test(document.getElementById("syncGateSheet").textContent) && document.querySelectorAll("#syncGateActions button").length >= 2, null, { timeout: 15000 });
    ok(true, "弹了库的面");
    eq(await B.page.evaluate(() => globalThis.__wpProbe.gate.isRunning()), true, "闸门还在等人");
    await sleep(8500);
    ok(/云端有新版本/.test(await B.gateText()), "人在看面：不拿 8 s 超时打断");
    await B.gateClick("打开本地");
    await B.settled(6000).catch(async () => { failures.push("gate stuck after face"); console.error("  ✗ 卡住：", (await B.gateText()).slice(0, 80)); console.error((await B.diag()).split("\n").slice(-10).map((l) => "    " + l.slice(0, 130)).join("\n")); });
    ok(!(await B.gateUp()), "选了才放行，罩子收了（栈没有留一张）；同一轮只问一次");
    eq(drive2.puts.length, puts, "没有替人推");
    await A.ctx.close(); await B.ctx.close();
  }
}

// ─────────────────────────────── F-147 B ───────────────────────────────
if (only === "all" || only === "reload") {
  console.log("F-147 B：点「有新版本」前");
  const drive = fakeDrive();
  const d = await device(drive);
  const p = await d.prepare();
  const reloadVia = async () => { const t0 = Date.now(); const nav = d.page.waitForEvent("load", { timeout: 20000 }); void d.page.evaluate(() => { void globalThis.__wpProbe.pwaReload(); }).catch(() => {}); await nav; await d.ready(); await sleep(400); await d.settled(); return Date.now() - t0; };
  await sleep(500);
  {
    const n0 = drive.puts.length, e0 = drive.items.get(`${p}.ora`)?.eTag;
    await reloadVia(); await sleep(1500);
    const st = await d.state();
    eq(drive.puts.length, n0, "干净的画：一次写都没有");
    eq(drive.items.get(`${p}.ora`)?.eTag, e0, "干净的画：云端 eTag 没变");
    eq(st.storeDirty, 0, "干净的画：store 不脏");
    ok(!/没传上去/.test(await d.page.evaluate(() => document.body.innerText)), "干净的画：不弹「没同步好」");
  }
  {
    await d.draw(5);
    void d.page.evaluate(() => { void globalThis.__wpProbe.pwaReload(); }).catch(() => {});
    await d.page.waitForFunction(() => /改过还没传上去/.test(document.body.innerText));
    ok(true, "改过没传：问人");
    await d.page.keyboard.press("Escape"); await sleep(400);
    eq((await d.state()).dirty, true, "取消：没刷新，改动还在内存");
    const nav = d.page.waitForEvent("load", { timeout: 20000 });
    void d.page.evaluate(() => { void globalThis.__wpProbe.pwaReload(); }).catch(() => {});
    await d.page.waitForFunction(() => /存好再刷新/.test(document.body.innerText));
    const n0 = drive.puts.length;
    await d.page.getByText("存好再刷新").click();
    await nav; await d.ready(); await sleep(400); await d.settled(); await sleep(1500);
    const st = await d.state();
    ok(drive.puts.length > n0, "存好再刷新：推上去了");
    eq(st.storeDirty, 0, "存好再刷新：store 不脏");
    ok(!/没传上去/.test(await d.page.evaluate(() => document.body.innerText)), "存好再刷新：不弹「没同步好」");
  }
  {
    await d.draw(9);
    const n0 = drive.puts.length;
    const nav = d.page.waitForEvent("load", { timeout: 20000 });
    void d.page.evaluate(() => { void globalThis.__wpProbe.pwaReload(); }).catch(() => {});
    await d.page.waitForFunction(() => /先不传/.test(document.body.innerText));
    await d.page.getByText("先不传").click();
    await nav; await d.ready(); await sleep(400); await d.settled(); await sleep(1200);
    eq(drive.puts.length, n0, "先不传：没推（WeebPaint 的推送 = 人按存）");
    eq((await d.state()).storeDirty, 1, "先不传：这一笔落在本机，store 记着");
    ok(/没传上去/.test(await d.page.evaluate(() => document.body.innerText)), "先不传：刷新后如实提醒");
    await d.page.evaluate(() => globalThis.__wpProbe.session.saveAndPush()); await d.settled();
  }
  {
    await d.draw(13);
    drive.holdPut = new Promise((r) => { drive.releasePut = r; });
    const t0 = Date.now();
    const nav = d.page.waitForEvent("load", { timeout: 25000 });
    void d.page.evaluate(() => { void globalThis.__wpProbe.pwaReload(); }).catch(() => {});
    await d.page.waitForFunction(() => /存好再刷新/.test(document.body.innerText));
    await d.page.getByText("存好再刷新").click();
    await nav;
    const ms = Date.now() - t0;
    ok(ms < 9000, `推卡住也会走，不等死（${ms} ms）`);
    await d.ready(); await sleep(400);
    const left = await d.page.evaluate(async (x) => { const be = globalThis.__wpProbe.galleryBackend(); return be.store.files.dirty.count(); }, p);
    ok(left >= 1, "脏留给库");
    drive.releasePut(); drive.holdPut = null;
    await d.settled();
  }
  await d.ctx.close();
}

// ─────────────────────────────── F-148 ───────────────────────────────
if (only === "all" || only === "enc") {
  console.log("F-148：第二台第一次开纯云端的加密画");
  const drive = fakeDrive();
  const A = await device(drive);
  const p = await A.prepare();
  const setAns = (dd, pw) => dd.page.evaluate((v) => globalThis.__wpProbe.setPassword(v), pw);
  await setAns(A, PW);
  await A.page.evaluate(() => globalThis.__wpProbe.session.encryptCurrent());
  await A.settled(); await sleep(600);
  ok(drive.items.has(`${p}.ora.zip`), `云端是容器（${[...drive.items.keys()].filter((k) => !k.startsWith(".")).join(" ")}）`);
  const second = async () => {
    const B = await device(drive);
    await B.boot(); await B.page.reload({ waitUntil: "load" }); await B.ready(); await sleep(400); await B.settled();
    await B.page.waitForFunction(() => globalThis.__wpProbe.galleryAttachment.state().kind === "attached");
    return B;
  };
  {
    const B = await second();
    await setAns(B, PW);
    const before = await B.page.evaluate((x) => globalThis.__wpProbe.requireStore().zip(`${x}.ora`, { mode: "existing" }).isEncrypted(), p);
    eq(before, false, "前提：解锁着、本地没字节，开之前库说不是加密的（老坑）");
    await B.page.evaluate((x) => globalThis.__wpProbe.session.open({ name: x }), p); await B.settled();
    const st = await B.state();
    eq(st.home, p, "第二台解锁着：打开了");
    eq(st.enc, true, "第二台第一次开：认得是加密的");
    await sleep(400);
    const list = await B.page.evaluate(() => globalThis.__wpProbe.session.listCheckpoints());
    ok(list.length >= 1 && list.every((c) => c.encrypted), `留底（打开点快照）是密文（${list.length} 条）`);
    const cipher = await B.page.evaluate((x) => globalThis.__wpProbe.requireStore().zip(`${x}.ora`, { mode: "existing" }).getEncryptedBlob().then((b) => !!b), p);
    ok(cipher, "本机字节是容器");
    // 分叉：别的设备推了新版，这台干净；拉取卡住时点「先继续画」
    await A.draw(30);
    await A.page.evaluate(() => globalThis.__wpProbe.session.saveAndPush()); await A.settled();
    const before2 = [...drive.items.keys()].filter((k) => !k.startsWith(".")).length;
    drive.hangDownload = new Promise((r) => { drive.releaseDownload = r; });
    const refreshing = B.page.evaluate(() => globalThis.__wpProbe.session.refreshOpenDoc());
    await B.page.waitForFunction(() => document.querySelectorAll("#syncGateActions button").length === 1 && document.getElementById("syncGateSheet").hasAttribute("data-open"), null, { timeout: 8000 });
    await B.page.locator("#syncGateActions button").first().click();
    await refreshing;
    drive.releaseDownload(); drive.hangDownload = null;
    await sleep(800);
    const after = await B.state();
    eq(after.home, null, "加密的画不分叉：放下回图库");
    eq([...drive.items.keys()].filter((k) => !k.startsWith(".")).length, before2, "网盘没有多一份明文");
    ok(!(await B.page.evaluate(() => new Promise((res) => { const be = globalThis.__wpProbe.galleryBackend(); const off = { f: null }; off.f = be.store.files.watchFolder("", (s) => { res(s.items.some((i) => /分叉/.test(i.identifier))); queueMicrotask(() => off.f?.()); }); }))), "库里没有分叉副本");
    await B.ctx.close();
  }
  {
    const B = await second();
    void B.page.evaluate((x) => globalThis.__wpProbe.session.open({ name: x }), p);
    const input = B.page.locator("input[type=password]:visible").first();
    await input.waitFor({ timeout: 10000 });
    ok(true, "这台锁着：认出是容器，问口令（以前只报打不开）");
    await input.fill(PW);
    await B.page.keyboard.press("Enter");
    await B.page.waitForFunction((x) => globalThis.__wpProbe.session.home?.path === x, p, { timeout: 15000 });
    await B.settled(); await sleep(300);
    eq((await B.state()).enc, true, "这台锁着：解开后认得是加密的");
    await B.ctx.close();
  }
  {
    // 第二台开着明文，第一台加密 → 第二台快进之后也要认得
    const drive2 = fakeDrive();
    const C = await device(drive2), D = await device(drive2);
    const q = await C.prepare();
    await D.boot(); await D.page.reload({ waitUntil: "load" }); await D.ready(); await sleep(400); await D.settled();
    await D.page.waitForFunction(() => globalThis.__wpProbe.galleryAttachment.state().kind === "attached");
    await D.page.evaluate((x) => globalThis.__wpProbe.session.open({ name: x }), q); await D.settled();
    eq((await D.state()).enc, false, "前提：第二台开着明文");
    await setAns(C, PW);
    await C.page.evaluate(() => globalThis.__wpProbe.session.encryptCurrent()); await C.settled(); await sleep(500);
    await setAns(D, PW);
    const r = await D.page.evaluate(() => globalThis.__wpProbe.session.refreshOpenDoc());
    eq(r, "fast-forwarded", "第二台快进");
    eq((await D.state()).enc, true, "快进之后认得是加密的");
    await C.ctx.close(); await D.ctx.close();
  }
  await A.ctx.close();
}

/** 用库自己的判据（真字节进页面问 appEncryption.isEncryptedBlob），不在探针里抄魔数。 */
const isContainerOn = (d, b) => !b ? Promise.resolve(false) : d.page.evaluate(async (b64) => {
  const bin = atob(b64), u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return globalThis.__wpProbe.isEncryptedBlob(new Blob([u8]));
}, Buffer.from(b).toString("base64"));
const dirtyDiag = (d) => d.page.evaluate(() => document.body.innerText.match(/[^\n]*没传上去[^\n]*/)?.[0] ?? "");

// ─────────────────────────────── 出门规则（规则书 §1 第 5 条；工单 G2）───────────────────────────────
if (only === "all" || only === "exit") {
  console.log("加密作品另存 / 导出：默认容器，明文要显式、写明");
  const drive = fakeDrive();
  const A = await device(drive);
  const p = await A.prepare();
  await A.page.evaluate((v) => globalThis.__wpProbe.setPassword(v), PW);
  await A.page.evaluate(() => globalThis.__wpProbe.session.encryptCurrent()); await A.settled(); await sleep(500);
  ok(await isContainerOn(A, drive.items.get(`${p}.ora.zip`)?.bytes), "前提：云端是容器");

  await A.page.evaluate(() => globalThis.__wpProbe.session.saveAs("副本")); await A.settled(); await sleep(500);
  ok(await isContainerOn(A, drive.items.get("副本.ora.zip")?.bytes), "另存为：云端新文件是容器");
  ok(!drive.items.has("副本.ora"), "另存为：云端没有明文 .ora");
  ok(await A.page.evaluate(async () => { const b = await globalThis.__wpProbe.requireStore().zip("副本.ora", { mode: "existing" }).getEncryptedBlob(); return !!b; }), "另存为：本地字节也是容器");
  eq((await A.state()).enc, true, "另存为之后：认得是加密的");
  eq((await A.state()).home, "副本", "另存为之后：开着新的这份");
  await A.draw(7);
  await A.page.evaluate(() => globalThis.__wpProbe.session.saveAndPush()); await A.settled(); await sleep(300);
  ok(await isContainerOn(A, drive.items.get("副本.ora.zip")?.bytes) && !drive.items.has("副本.ora"), "另存后再存一笔：云端还是容器");

  await A.page.evaluate(() => { window.showSaveFilePicker = undefined; });
  const hub = async () => { await A.page.evaluate(() => document.getElementById("menuExportImage").click()); await A.page.getByText("存为本地加密文件").waitFor(); return A.page.evaluate(() => [...document.querySelectorAll("button")].filter((b) => b.offsetParent && /存为本地|导出图片|复制一份/.test(b.textContent)).map((b) => ({ t: b.textContent.trim(), primary: !b.classList.contains("ghost") }))); };
  const rows = await hub();
  ok(rows.find((r) => r.primary)?.t.includes("存为本地加密文件"), `主按钮 = 加密文件（${rows.map((r) => r.t).join(" / ")}）`);
  ok(rows.find((r) => r.t.includes("存为本地 .ora"))?.t.includes("这份是明文、没有加密"), "明文 .ora：按钮上写着那句话");
  ok(rows.find((r) => r.t.includes("导出图片"))?.t.includes("这份是明文、没有加密"), "导出图片（PNG）：按钮上写着那句话");
  const dl1 = A.page.waitForEvent("download");
  await A.page.getByText("存为本地加密文件").click();
  const d1 = await dl1;
  ok(d1.suggestedFilename().endsWith(".ora.zip"), `默认那个：文件名 ${d1.suggestedFilename()}`);
  ok(await isContainerOn(A, readFileSync(await d1.path())), "默认那个：下载的字节是容器");
  await hub();
  const dl2 = A.page.waitForEvent("download");
  await A.page.getByText("这份是明文、没有加密").first().waitFor();
  await A.page.locator("button", { hasText: "存为本地 .ora" }).click();
  const d2 = await dl2;
  ok(d2.suggestedFilename().endsWith(".ora") && !(await isContainerOn(A, readFileSync(await d2.path()))), `显式明文：${d2.suggestedFilename()}`);
  await A.ctx.close();
}

// ─────────────────────────────── 回来时没传的分三种（规则书 §1 第 15 条，11-03 夜改写；工单 G2）───────────────────────────────
if (only === "all" || only === "back") {
  console.log("回来：(c) 不传不问进列表；(b) 续传不问；(a) 问一次；a + c 面上都说");
  const drive = fakeDrive();
  const d = await device(drive);
  const p = await d.prepare();
  const off = async () => {
    await d.reload("interaction");
    await d.page.waitForFunction(() => document.querySelectorAll("#syncGateActions button").length === 2);
    await d.gateClick("离线继续"); await d.settled();
    ok(await d.offline(), "前提：离线继续");
  };
  const back = async () => {
    await d.page.evaluate(() => { localStorage.setItem("__fake_msal", "ok"); window.dispatchEvent(new Event("online")); });
    await d.page.waitForFunction(() => !globalThis.__wpProbe.isUserOffline());
    await sleep(1800);   // 走一遍文件夹（settle 800 ms）+ 该弹的弹出来
  };
  const autosave = async () => { await d.hide(); await sleep(300); await d.show(); await sleep(200); };
  { // (c)
    await off(); await d.draw(3); await autosave();
    eq((await d.state()).storeDirty, 1, "(c) 前提：改动落了本机");
    const n0 = drive.puts.length;
    await back();
    eq(drive.puts.length, n0, "(c) 不传");
    ok(!(await d.gateUp()), "(c) 不问");
    ok(/1 份没传上去/.test(await dirtyDiag(d)), `(c) 进列表：${await dirtyDiag(d)}`);
    eq((await d.state()).storeDirty, 1, "(c) 还脏着");
    await d.page.evaluate(() => globalThis.__wpProbe.session.saveAndPush()); await d.settled();
    eq((await d.state()).storeDirty, 0, "(c) 人按存之后传上去");
  }
  { // (b)
    await off(); await d.draw(6);
    await d.page.evaluate(() => globalThis.__wpProbe.session.saveAndPush()); await d.settled();
    eq(await d.page.evaluate(() => globalThis.__wpProbe.session.pushOwed), true, "(b) 前提：按过存，没传成");
    const n0 = drive.puts.length;
    await back(); await d.settled();
    ok(drive.puts.length > n0, "(b) 自动续传");
    ok(!(await d.gateUp()), "(b) 不问");
    const st = await d.state();
    eq(st.storeDirty, 0, "(b) 传完不脏"); eq(st.pp, false, "(b) 不再显示没上云");
  }
  { // 按过存又改了 = (c)
    await off(); await d.draw(9);
    await d.page.evaluate(() => globalThis.__wpProbe.session.saveAndPush()); await d.settled();
    await d.draw(12); await autosave();
    eq(await d.page.evaluate(() => globalThis.__wpProbe.session.pushOwed), false, "按存之后又改：不算欠");
    const n0 = drive.puts.length;
    await back();
    eq(drive.puts.length, n0, "按存之后又改：不自动传");
    await d.page.evaluate(() => globalThis.__wpProbe.session.saveAndPush()); await d.settled();
  }
  { // (a)
    await off();
    await d.page.evaluate(() => globalThis.__wpProbe.session.newDoc({ name: "离线新建", w: 64, h: 64 })); await d.settled();
    await d.draw(2);
    await d.page.evaluate(() => globalThis.__wpProbe.session.saveAndPush()); await d.settled();
    const n0 = drive.puts.length;
    await back();
    await d.page.waitForFunction(() => /只在这台设备/.test(document.getElementById("syncGateTitle").textContent) && document.getElementById("syncGateSheet").hasAttribute("data-open"));
    const face = await d.gateText();
    ok(/有 1 份只在这台设备，现在传上去？/.test(face) && /现在传/.test(face) && /稍后/.test(face), `(a) 问：${face}`);
    eq(drive.puts.length, n0, "(a) 没点之前一次都没传");
    ok(!drive.items.has("离线新建.ora"), "(a) 云端还没有");
    await d.gateClick("现在传"); await d.settled(); await sleep(800);
    ok(drive.items.has("离线新建.ora"), "(a) 点了传上去");
    const st = await d.state();
    eq(st.storeDirty, 0, "(a) 传完不脏"); eq(st.pp, false, "(a) 开着的这份不再显示没上云");
  }
  { // a + c，稍后
    await d.page.evaluate((x) => globalThis.__wpProbe.session.open({ name: x }), p); await d.settled();
    await off(); await d.draw(4); await autosave();
    await d.page.evaluate(() => globalThis.__wpProbe.session.newDoc({ name: "离线新建二", w: 64, h: 64 })); await d.settled();
    await d.draw(1); await autosave();
    eq((await d.state()).storeDirty, 2, "a + c 前提：两份脏");
    const n0 = drive.puts.length;
    await back();
    await d.page.waitForFunction(() => /只在这台设备/.test(document.getElementById("syncGateTitle").textContent) && document.getElementById("syncGateSheet").hasAttribute("data-open"));
    ok(/有 1 份只在这台设备，还有 1 份改过没传。现在全传？/.test(await d.gateText()), `a + c 面上都说：${await d.gateText()}`);
    await d.page.keyboard.press("Escape"); await sleep(500);
    ok(!(await d.gateUp()), "Esc = 稍后：面收了");
    eq(drive.puts.length, n0, "稍后：什么都不推");
    ok(/2 份没传上去/.test(await dirtyDiag(d)), `稍后：都进列表（${await dirtyDiag(d)}）`);
    await d.page.evaluate(() => window.dispatchEvent(new Event("online"))); await sleep(1500);
    ok(!(await d.gateUp()), "这一页不再问");
    eq(drive.puts.length, n0, "这一页也不自己推");
    // 下一页再问；这回点
    await d.page.reload({ waitUntil: "load" }); await d.ready();
    await d.page.waitForFunction(() => /只在这台设备/.test(document.getElementById("syncGateTitle").textContent) && document.getElementById("syncGateSheet").hasAttribute("data-open"), null, { timeout: 15000 });
    ok(true, "下一页：再问一次");
    await d.gateClick("现在传"); await d.settled(); await sleep(1000);
    eq((await d.state()).storeDirty, 0, "点了：两份都传上去");
    ok(drive.items.has("离线新建二.ora"), "点了：从没传过的那份在云端");
  }
  await d.ctx.close();
}

await browser.close();
console.log(failures.length ? `\n✗ ${failures.length} 条失败：\n  ${failures.join("\n  ")}` : "\n✓ probe-cloud-gate OK");
process.exitCode = failures.length ? 1 : 0;
