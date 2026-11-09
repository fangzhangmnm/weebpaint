#!/usr/bin/env node
// test/probes/probe-edit-lock.mjs —— 「源文件原则上只读」无头验收（家族 CLAUDE.md 那一节；设计稿 = 家族根 ai-docs/20261108-design-lock-star-versions.md）。created 2026-11-08 by Claude Fable 5.1
//   真 bundle、真库、真图库库；假的只有两头：MSAL 脚本和 Graph（内存小网盘，test/probes/fake-cloud.mjs）。headless。
//   用法：bash scripts/build.sh 之后 `node test/probes/probe-edit-lock.mjs`（≈ 20 s）。
//   验：新建不锁、存下来带解锁、刷新后还解着；锁上后落笔 / 撤销 / Ctrl+S / 新建图层都改不动，只闪不弹、没有报错横幅；平移缩放照常；
//       门上「存一版再改」= 多出一版（生来锁着）、**人还在画布上**、这幅解锁能画能存；打开那一版是锁着的；加了星的删不掉。
import { createRequire } from "node:module";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MSAL_STUB, fakeDrive } from "./fake-cloud.mjs";
const here = path.dirname(fileURLToPath(import.meta.url)), repo = path.join(here, "../..");
const { chromium } = createRequire(path.join(repo, "package.json"))("playwright");
const ORIGIN = "http://127.0.0.1:8767";
const MIME = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".json": "application/json", ".wasm": "application/wasm", ".webmanifest": "application/manifest+json" };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fails = []; const ok = (c, what) => { console.log(c ? "  ✓" : "  ✗", what); if (!c) fails.push(what); };
const browser = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });   // 无头
const ctx = await browser.newContext({ viewport: { width: 1100, height: 720 }, serviceWorkers: "block", locale: "zh-CN" });
await ctx.route(`${ORIGIN}/**`, async (route) => { let p = decodeURIComponent(new URL(route.request().url()).pathname); if (p === "/") p = "/index.html"; const f = path.join(repo, p); if (!existsSync(f)) return route.fulfill({ status: 404, body: "" }); await route.fulfill({ status: 200, contentType: MIME[path.extname(f)] ?? "application/octet-stream", body: readFileSync(f) }); });
const drive = fakeDrive(); await drive.attach(ctx);
await ctx.route(/msal-browser\.min\.js/, (r) => r.fulfill({ contentType: "text/javascript", body: MSAL_STUB }));
await ctx.addInitScript(() => { if (!localStorage.getItem("__fake_msal")) localStorage.setItem("__fake_msal", "ok"); });
const page = await ctx.newPage(); page.setDefaultTimeout(20000);
// 锁着时点「新建图层」：写门抛的 WriteRefusedError 没人接是设计（app 的全局筛子把它翻成门闪一下，下面 ③ 验「没有报错横幅」）——它不算页面错误。
const errs = []; page.on("pageerror", (e) => { if (!/write refused \(edit-locked\)/.test(e.message)) errs.push(e.message); });
const P = (fn, a) => page.evaluate(fn, a);
const ready = () => page.waitForFunction(() => globalThis.__wpProbe);
const settled = () => page.waitForFunction(() => { const p = globalThis.__wpProbe; return p && !p.gate.isRunning() && !p.session.saving; });
const onCanvas = () => P(() => document.body.dataset.mode !== "gallery" && !!document.querySelector("#board, canvas")?.getBoundingClientRect().width);
const stroke = async (dx = 0) => { const box = await page.locator("#board, canvas").first().boundingBox(); const cx = box.x + box.width / 2 + dx, cy = box.y + box.height / 2; await page.mouse.move(cx - 60, cy - 30); await page.mouse.down(); await page.mouse.move(cx + 60, cy + 30, { steps: 8 }); await page.mouse.up(); await sleep(200); };
const door = () => P(() => { const el = document.querySelector('[data-notice-id="edit-lock"]'); return el ? (el.textContent || "").replace(/\s+/g, " ").trim() : null; });
const banners = () => P(() => [...document.querySelectorAll(".toast.notice-error, .toast.notice-warning")].map((x) => (x.textContent || "").trim().slice(0, 80)));
const locked = () => P(() => globalThis.__wpProbe.editLocked());
const dirty = () => P(() => globalThis.__wpProbe.session.dirty);
const layerCount = () => P(() => document.querySelectorAll("#layersList > *, .layers-list > *").length);

await page.goto(`${ORIGIN}/`, { waitUntil: "load" }); await ready(); await sleep(400); await settled();
await page.reload({ waitUntil: "load" }); await ready(); await sleep(400); await settled();
await page.waitForFunction(() => globalThis.__wpProbe.galleryAttachment.state().kind === "attached");

console.log("① 新建：空白画布上直接画（新建那一下不算锁着），存下来之后带着解锁");
ok(!(await locked()), "空白画布不锁"); ok((await door()) == null, "没有门");
await stroke();
await page.waitForFunction(() => globalThis.__wpProbe.session.home?.kind === "gallery");
await P(() => globalThis.__wpProbe.session.saveAndPush()); await settled();
const name = await P(() => globalThis.__wpProbe.session.home.path); const full = name + ".ora";
ok(!(await locked()), "存下来的新画还解着（库发了一枚解锁）");

console.log("② 刷新：解锁跟着设备，一天之内还在");
await page.reload({ waitUntil: "load" }); await ready(); await sleep(600); await settled();
ok((await P(() => globalThis.__wpProbe.session.home?.path)) === name, "刷新后开回这幅画"); ok(!(await locked()), "还解着");

console.log("③ 锁上（等于过期）：门出来；落笔 / 撤销 / Ctrl+S / 新建图层都改不动，只闪不弹");
await P((f) => globalThis.__wpProbe.requireStore().files.lock(f), full); await sleep(200);
ok(await locked(), "锁着"); ok(/接着改/.test((await door()) ?? "") && /存一版再改/.test((await door()) ?? ""), "门上两个钮");
await stroke(20);
ok(!(await dirty()), "落笔没进去（不脏）");
ok(await P(() => !!document.querySelector('[data-notice-id="edit-lock"].edit-lock-flash')), "门闪了一下");
await page.keyboard.press("Control+z"); await page.keyboard.press("Control+s"); await sleep(200);
ok(!(await dirty()) && !(await P(() => globalThis.__wpProbe.session.saving)), "Ctrl+Z / Ctrl+S 没动");
const n0 = await layerCount();
await P(() => document.getElementById("layerAddNewBtn")?.click()); await sleep(300);   // 图层面板：界面层在捕获阶段拦（v0.14.60）；它后面还有写门
ok((await layerCount()) === n0 && n0 > 0, `新建图层被拒（图层行数 ${n0} → ${await layerCount()}）`);
ok(!(await dirty()), "还是不脏"); ok((await banners()).length === 0, "没有报错横幅：" + JSON.stringify(await banners()));
ok(await P(() => getComputedStyle(document.querySelector(".layers-foot")).opacity === "0.5"), "图层面板的钮淡了一档");
ok(await P(() => { try { globalThis.__wpProbe.wp2begin("probe"); return false; } catch (e) { return e.name === "WriteRefusedError"; } }), "界面层后面那一道还在：直接开写令牌被拒");

console.log("③′ 看法：锁着也能关图层的眼睛；画不变脏、没有任何上传、不闪不报");
{
  const puts0 = drive.puts.length;
  await P(() => document.querySelector('[data-notice-id="edit-lock"]')?.classList.remove("edit-lock-flash"));
  const hidden0 = await P(() => document.querySelectorAll("#layersList .layer-vis.hidden-icon").length);
  await P(() => document.querySelector("#layersList .layer-vis")?.click()); await sleep(300);
  const hidden1 = await P(() => document.querySelectorAll("#layersList .layer-vis.hidden-icon").length);
  ok(hidden1 === hidden0 + 1, `眼睛关上了（隐藏的图层 ${hidden0} → ${hidden1}）`);
  ok(!(await dirty()), "不算有改动要存"); ok(drive.puts.length === puts0, "对文件零写入（没有任何上传）");
  ok(!(await P(() => !!document.querySelector('[data-notice-id="edit-lock"].edit-lock-flash'))) && (await banners()).length === 0, "不闪、不报");
  await sleep(1200);   // 等过自动落盘的节律
  ok(!(await dirty()) && drive.puts.length === puts0 && (await banners()).length === 0, "过一会儿也没有去存、没有报错");
  await P(() => document.querySelector("#layersList .layer-vis")?.click()); await sleep(200);
  ok((await P(() => document.querySelectorAll("#layersList .layer-vis.hidden-icon").length)) === hidden0, "再点一下开回来");
}

console.log("④ 平移缩放照常");
await page.mouse.move(550, 360); await page.mouse.wheel(0, -240); await sleep(200);
ok(!(await dirty()), "滚轮缩放之后还是不脏");

console.log("⑤ 点门上的「存一版再改」：多出一版（生来锁着），人还在画布上，这幅解锁、能画、能存");
const putsBefore = drive.puts.length;
await page.locator('[data-notice-id="edit-lock"] button', { hasText: "存一版再改" }).first().click();
await page.waitForFunction(() => !globalThis.__wpProbe.editLocked()); await sleep(600); await settled();
ok(await onCanvas(), "没有被踢回图库"); ok((await door()) == null, "门收了");
ok(await dirty(), "锁着时动过看法（③′ 点过眼睛）→ 解锁那一刻转成待保存的改动（所见即所存）");
const versions = [...drive.items.keys()].filter((k) => k.includes(".backup-"));
ok(versions.length === 1 && versions[0].startsWith(name + ".backup-"), "云端多了一版：" + versions.join(","));
ok(!(await P((v) => globalThis.__wpProbe.requireStore().files.unlockOf(v), versions[0] ?? "x")), "那一版生来锁着");
await stroke(40);
ok(await dirty(), "解了锁：落笔进去了");
await P(() => globalThis.__wpProbe.session.saveAndPush()); await settled();
ok(!(await dirty()) && drive.puts.length > putsBefore, "存上去了");

console.log("⑤′ 画布文件菜单里的「锁上（先不改了）」：解着才出现；点了先存好再锁");
await stroke(55);
ok(await dirty(), "先留一笔没存的");
await page.locator("#menuButton").click(); await sleep(200);
ok(await P(() => !document.getElementById("menuLockEdit").classList.contains("hidden")), "解着：菜单里有「锁上」");
await P(() => document.getElementById("menuLockEdit").click());
await page.waitForFunction(() => globalThis.__wpProbe.editLocked()); await sleep(300); await settled();
ok(!(await dirty()), "那一笔先存好了"); ok(/接着改/.test((await door()) ?? ""), "锁上了，门回来了");
await page.locator("#menuButton").click(); await sleep(200);
ok(await P(() => document.getElementById("menuLockEdit").classList.contains("hidden")), "锁着：菜单里没有「锁上」（解锁在门上）");
await page.keyboard.press("Escape"); await sleep(100);

console.log("⑥ 加星：这幅删不掉");
ok(await P(async (f) => { const st = globalThis.__wpProbe.requireStore(); await st.files.star(f); try { await st.file(f, { mode: "existing" }).trash(); return false; } catch (e) { return e.name === "StarredError"; } }, full), "加了星的送回收站被库拒");

console.log("⑦ 打开那一版：锁着（门在），画不上去");
await P((v) => globalThis.__wpProbe.session.open({ name: v.replace(/\.ora$/, "") }), versions[0]); await sleep(600); await settled();
ok(await locked(), "版本打开是锁着的"); ok(/接着改/.test((await door()) ?? ""), "门在");
await stroke(60);
ok(!(await dirty()), "画不上去");

console.log("\n页面错误：", errs.length ? errs.join(" | ") : "无");
console.log(fails.length || errs.length ? `✗ probe-edit-lock：${fails.length} 条没过` : "✓ probe-edit-lock OK");
await browser.close(); process.exit(fails.length || errs.length ? 1 : 0);
