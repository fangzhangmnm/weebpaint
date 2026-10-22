// created 2026-10-21 by Claude Opus 5.5（收参考窗 0.5.0；家族格式版本纪律 F-69）
// F11 两件事，走真 app：
//   ① 「更新版本写的」提示：OPFS 本地图库里放一张参考清单 minor 比本库新的画（冻结样本 real/v3 改出来：manifest minor=9 + 一个不认识的顶层键），
//      从图库打开 → 通知条说一次「这张画是更新版本的 WeebPaint 写的…」；不认识的键保存后原样还在（库的直通）。
//   ② 视频参考：从参考窗的文件入口导入一段 webm（参考窗库自带的 20 帧灰阶测试片）→ 视频卡、只放内存、上一帧 / 下一帧两颗钮有中文提示、图标在 sprite 里。
//   全程零 CSP 拦截。真机（iPad Edge）逐帧没验——WebKit 和 Chromium 的 seek 精度不同，归 user。
import { chromium } from "playwright";
import { readFileSync } from "node:fs";
import { CTX_ZH, startServer, bootPage, makeChecker, evClick } from "./harness.mjs";
import { ensureZipLoaded } from "../../test/zip-node.mjs";

ensureZipLoaded();
const { zipUnpack, zipPack } = await import("../../src/backend/zip.ts");
const SAMPLE = new URL("../../test/fixtures/format/real/v3/references-live-timelapse.ora", import.meta.url);
const VIDEO = new URL("../../../20260929 internal-reference-window/test/probes/fixtures/gray-steps-10fps.webm", import.meta.url);

// ── 造一张「参考清单 minor 更新」的画（node 侧改冻结样本）──
const files = await zipUnpack(new Blob([readFileSync(SAMPLE)]));
const MAN = ".weebpaint/references/manifest.json";
const man = JSON.parse(new TextDecoder().decode(files[MAN]));
man.minor = 9; man.futureTopLevel = { keep: "me" };
files[MAN] = new TextEncoder().encode(JSON.stringify(man));
const newerOra = new Uint8Array(await (await zipPack(Object.entries(files).map(([path, data]) => ({ path, data })))).arrayBuffer());

const srv = await startServer();
const browser = await chromium.launch();
const context = await browser.newContext(CTX_ZH);
await context.addInitScript(() => {
  window.__csp = []; document.addEventListener("securitypolicyviolation", (e) => window.__csp.push(`${e.effectiveDirective} ${e.blockedURI}`));
  window.showDirectoryPicker = async () => (await navigator.storage.getDirectory()).getDirectoryHandle("f11-gallery", { create: true });
});
const c = makeChecker("F11 reference-video");
setTimeout(() => { console.error("[F11] WATCHDOG: 120s 硬切（挂死）"); process.exit(1); }, 120_000).unref?.();
const { page, errors } = await bootPage(context, srv.url);

// OPFS 里先放好那张画（连接之前；folder provider 列举时就在）
await page.evaluate(async (bytes) => {
  const dir = await (await navigator.storage.getDirectory()).getDirectoryHandle("f11-gallery", { create: true });
  const fh = await dir.getFileHandle("f11-newer.ora", { create: true });
  const w = await fh.createWritable(); await w.write(new Uint8Array(bytes)); await w.close();
}, [...newerOra]);

// 连接本地文件夹图库（新库 → 播种面选「出厂全新」）
await evClick(page, "menuButton"); await evClick(page, "menuConnectGallery"); await page.waitForTimeout(300);
await page.evaluate(() => { const b = [...document.querySelectorAll("button")].find((x) => (x.textContent || "").includes("连接本地文件夹")); if (!b) throw new Error("no connect-folder item"); b.click(); });
await page.waitForTimeout(1500);
await page.evaluate(() => { const b = [...document.querySelectorAll("#genericSheetChoices button")].find((x) => !x.textContent.includes("继承")); b?.click(); });
for (let i = 0; i < 40 && (await page.evaluate(() => document.body.hasAttribute("data-no-gallery"))); i++) await page.waitForTimeout(500);
c.expect("folder gallery attached", await page.evaluate(() => !document.body.hasAttribute("data-no-gallery")));
if (await page.evaluate(() => document.getElementById("galleryFull").classList.contains("hidden"))) { await evClick(page, "menuButton"); await evClick(page, "menuGallery"); }
for (let i = 0; i < 20 && !(await page.evaluate(() => [...document.querySelectorAll("#galleryMount .gallery-tile-name")].some((n) => n.textContent.trim() === "f11-newer"))); i++) await page.waitForTimeout(500);

// ① 打开它 → 通知条说一次
await page.evaluate(() => { const t = [...document.querySelectorAll("#galleryMount .gallery-tile")].find((x) => x.querySelector(".gallery-tile-name")?.textContent.trim() === "f11-newer"); if (!t) throw new Error("tile f11-newer missing"); t.click(); });
await page.waitForTimeout(3000);
const notices = await page.evaluate(() => [...document.querySelectorAll(".notice .notice-text")].map((n) => n.textContent));
c.expect("newer-minor notice shown once (references manifest minor 9)", notices.filter((s) => /更新版本的 WeebPaint 写的/.test(s)).length === 1, JSON.stringify(notices));
c.expect("deck restored (3 cards)", await page.evaluate(() => document.getElementById("referencePanel").deck.cards().length === 3));

// ② 视频参考（状态行 1.8 s 后自己回「就绪」——用 observer 把这段时间写过的字都记下来）
await page.evaluate(() => { window.__status = []; const el = document.getElementById("statusLabel"); new MutationObserver(() => window.__status.push(el.textContent || "")).observe(el, { childList: true, characterData: true, subtree: true }); });
await page.setInputFiles("#referenceFileInput", { name: "gray-steps-10fps.webm", mimeType: "video/webm", buffer: readFileSync(VIDEO) });
await page.waitForTimeout(2500);
const vid = await page.evaluate(() => {
  const el = document.getElementById("referencePanel");
  const cards = el.deck.cards(); const v = cards.find((x) => x.kind === "video");
  const sr = el.shadowRoot;
  const titled = (s) => sr ? [...sr.querySelectorAll("[title], [aria-label]")].filter((n) => n.getAttribute("title") === s || n.getAttribute("aria-label") === s).length : -1;
  return { n: cards.length, hasVideo: !!v, ram: v?.ram ?? null, open: el.open, prevBtn: titled("上一帧"), nextBtn: titled("下一帧"),
    sprite: ["skip-prev", "skip-next"].every((id) => !!document.querySelector(`svg symbol#${id}`)) };
});
c.expect("video card added", vid.hasVideo && vid.n === 4, JSON.stringify(vid));
c.expect("video card is memory-only by default (ram set)", !!vid.ram, JSON.stringify(vid));
c.expect("reference window opened", vid.open === true, JSON.stringify(vid));
c.expect("frame step buttons labelled 上一帧 / 下一帧", vid.prevBtn > 0 && vid.nextBtn > 0, JSON.stringify(vid));
c.expect("skip-prev / skip-next inlined in sprite", vid.sprite);
c.expect("video-added status said", (await page.evaluate(() => window.__status)).some((x) => /已加视频参考/.test(x)), JSON.stringify(await page.evaluate(() => window.__status)));

const csp = await page.evaluate(() => window.__csp);
c.expect("zero CSP violations", csp.length === 0, csp.join(" | "));
await browser.close(); await srv.close();
c.finish(errors);
