// created 2026-10-21 by Claude Opus 5.5（家族格式版本纪律 F-69 / 总账 #92；统筹护栏 3「打开 → 改一笔 → 存，断言未知键还在」、护栏 4「拒开不写任何东西」）
// F12 走真 app（OPFS 本地文件夹图库，退出到图库 = 推回文件夹 = 真写盘），三份未来样本（test/fixtures/format/synthetic/future-*，gen-future.mjs 拼）：
//   ① ora major 更新（format 4）：点开 → 拒开（警告通知说格式号、留在图库），文件字节一个都没变。
//   ② 每一部分 minor 更新 + 各带未知键 + 一个 `.weebpaint/` 未知 entry：点开 → 「更新版本写的」说一次 → 画一笔 → 回图库（推回文件夹）
//      → 读回文件：desk / 录像 / 参考清单的未知键、未知 entry 都还在，stack.xml 拍子写成本版的，那一笔在。
//   ③ 只有 desk 的 major 更新：点开 → 「有一部分设置是更新版本写的」说一次 → 画一笔 → 回图库 → editor-state.json 与原文件逐字节相同。
//   全程零 CSP 拦截。真机（iPad Edge）没验。
import { chromium } from "playwright";
import { readFileSync } from "node:fs";
import { CTX_ZH, startServer, bootPage, makeChecker, evClick, drawStroke } from "./harness.mjs";
import { ensureZipLoaded } from "../../test/zip-node.mjs";

ensureZipLoaded();
const { zipUnpack } = await import("../../src/backend/zip.ts");
const fx = (rel) => new Uint8Array(readFileSync(new URL(`../../test/fixtures/format/${rel}`, import.meta.url)));
const SAMPLES = { "f12-major": fx("synthetic/future-major/ora-4.ora"), "f12-minor": fx("synthetic/future-minor/all-parts.ora"), "f12-desk": fx("synthetic/future-major/desk-2.ora") };
const DIR = "f12-gallery";
const unzip = async (u8) => zipUnpack(new Blob([u8]));
const txt = (u8) => new TextDecoder().decode(u8);
const same = (a, b) => !!a && !!b && a.length === b.length && a.every((x, i) => x === b[i]);

const srv = await startServer();
const browser = await chromium.launch();
const context = await browser.newContext(CTX_ZH);
await context.addInitScript((dir) => {
  window.__csp = []; document.addEventListener("securitypolicyviolation", (e) => window.__csp.push(`${e.effectiveDirective} ${e.blockedURI}`));
  window.showDirectoryPicker = async () => (await navigator.storage.getDirectory()).getDirectoryHandle(dir, { create: true });
}, DIR);
const c = makeChecker("F12 format-discipline");
setTimeout(() => { console.error("[F12] WATCHDOG: 150s 硬切（挂死）"); process.exit(1); }, 150_000).unref?.();
const { page, errors } = await bootPage(context, srv.url);

const readBack = (name) => page.evaluate(async ([dir, n]) => {
  const d = await (await navigator.storage.getDirectory()).getDirectoryHandle(dir);
  return [...new Uint8Array(await (await (await d.getFileHandle(n)).getFile()).arrayBuffer())];
}, [DIR, `${name}.ora`]).then((a) => new Uint8Array(a));
const notices = () => page.evaluate(() => [...document.querySelectorAll(".notice .notice-text")].map((n) => n.textContent || ""));
const openTile = async (name) => {
  for (let i = 0; i < 20 && !(await page.evaluate((n) => [...document.querySelectorAll("#galleryMount .gallery-tile-name")].some((x) => x.textContent.trim() === n), name)); i++) await page.waitForTimeout(500);
  await page.evaluate((n) => { const t = [...document.querySelectorAll("#galleryMount .gallery-tile")].find((x) => x.querySelector(".gallery-tile-name")?.textContent.trim() === n); if (!t) throw new Error(`tile ${n} missing`); t.click(); }, name);
  await page.waitForTimeout(3000);
};
const toGallery = async () => { await evClick(page, "menuButton"); await evClick(page, "menuGallery"); await page.waitForTimeout(4000); };
const inGallery = () => page.evaluate(() => !document.getElementById("galleryFull").classList.contains("hidden"));

// OPFS 里先放好三张画（连接之前；folder provider 列举时就在）
await page.evaluate(async ([dir, entries]) => {
  const d = await (await navigator.storage.getDirectory()).getDirectoryHandle(dir, { create: true });
  for (const [n, bytes] of entries) { const w = await (await d.getFileHandle(`${n}.ora`, { create: true })).createWritable(); await w.write(new Uint8Array(bytes)); await w.close(); }
}, [DIR, Object.entries(SAMPLES).map(([n, b]) => [n, [...b]])]);

// 连接本地文件夹图库（新库 → 播种面选「出厂全新」）
await evClick(page, "menuButton"); await evClick(page, "menuConnectGallery"); await page.waitForTimeout(300);
await page.evaluate(() => { const b = [...document.querySelectorAll("button")].find((x) => (x.textContent || "").includes("连接本地文件夹")); if (!b) throw new Error("no connect-folder item"); b.click(); });
await page.waitForTimeout(1500);
await page.evaluate(() => { const b = [...document.querySelectorAll("#genericSheetChoices button")].find((x) => !x.textContent.includes("继承")); b?.click(); });
for (let i = 0; i < 40 && (await page.evaluate(() => document.body.hasAttribute("data-no-gallery"))); i++) await page.waitForTimeout(500);
c.expect("folder gallery attached", await page.evaluate(() => !document.body.hasAttribute("data-no-gallery")));
if (!(await inGallery())) { await evClick(page, "menuButton"); await evClick(page, "menuGallery"); await page.waitForTimeout(1000); }

// ① major 更新：拒开，什么都不写
await openTile("f12-major");
const n1 = await notices();
c.expect("① refused with a warning naming the format (4.0.0 vs 3.0.0)", n1.some((s) => /更新版本的 WeebPaint 写的（格式 4\.0\.0，这版只认到 3\.0\.0）/.test(s)), JSON.stringify(n1));
c.expect("① stayed in the gallery (not opened)", await inGallery());
await page.waitForTimeout(1500);
c.expect("① file bytes untouched", same(await readBack("f12-major"), SAMPLES["f12-major"]));

// ② minor 更新：能开能改能存，未知部分原样带回
await openTile("f12-minor");
c.expect("② opened in the editor", !(await inGallery()));
const n2 = await notices();
c.expect("② newer-minor notice shown once", n2.filter((s) => /这版没有的功能保存时不会丢/.test(s)).length === 1, JSON.stringify(n2));
await drawStroke(page);
await toGallery();
const out2 = await readBack("f12-minor");
c.expect("② file was rewritten (save happened)", !same(out2, SAMPLES["f12-minor"]));
{
  const a = await unzip(SAMPLES["f12-minor"]), b = await unzip(out2);
  const deskOut = JSON.parse(txt(b[".weebpaint/editor-state.json"]));
  const tlOut = JSON.parse(txt(b[".weebpaint/timelapse.json"]));
  const manOut = JSON.parse(txt(b[".weebpaint/references/manifest.json"]));
  const xml = txt(b["stack.xml"]);
  c.expect("② desk unknown key kept", JSON.stringify(deskOut.futureDesk) === JSON.stringify({ gizmo: true, level: 3 }), JSON.stringify(Object.keys(deskOut)));
  c.expect("② desk stamp rewritten to this version (1.0.0)", deskOut.version === 1 && deskOut.minor === 0 && deskOut.patch === 0, `${deskOut.version}.${deskOut.minor}.${deskOut.patch}`);
  c.expect("② timelapse unknown key kept", tlOut.futureTimelapse === "keep me", JSON.stringify(tlOut));
  c.expect("② reference manifest unknown key kept (library passthrough)", JSON.stringify(manOut.futureDeck) === JSON.stringify(["a", "b"]), JSON.stringify(manOut));
  c.expect("② unknown .weebpaint/ entry kept byte-for-byte", same(b[".weebpaint/future-notes.json"], a[".weebpaint/future-notes.json"]));
  c.expect("② stack.xml stamp = 3.0.0", /weebpaint:format="3" weebpaint:format-minor="0" weebpaint:format-patch="0"/.test(xml), xml.slice(0, 300));
  const layersChanged = Object.keys(b).filter((p) => p.startsWith("data/")).some((p) => !same(a[p], b[p]));
  c.expect("② the stroke is in the saved layers", layersChanged);
  const names = Object.keys(b);
  c.expect("② thumbnail still the last entry", names[names.length - 1] === "Thumbnails/thumbnail.png", names.join(" "));
}

// ③ desk major 更新：desk 原字节带回
await openTile("f12-desk");
c.expect("③ opened in the editor", !(await inGallery()));
const n3 = await notices();
c.expect("③ part-too-new notice shown", n3.some((s) => /有一部分设置是更新版本写的/.test(s)), JSON.stringify(n3));
await drawStroke(page);
await toGallery();
const out3 = await readBack("f12-desk");
{
  const a = await unzip(SAMPLES["f12-desk"]), b = await unzip(out3);
  c.expect("③ file was rewritten (save happened)", !same(out3, SAMPLES["f12-desk"]));
  c.expect("③ editor-state.json byte-identical to the newer version's", same(b[".weebpaint/editor-state.json"], a[".weebpaint/editor-state.json"]), txt(b[".weebpaint/editor-state.json"] ?? new Uint8Array()).slice(0, 200));
}

const csp = await page.evaluate(() => window.__csp);
c.expect("zero CSP violations", csp.length === 0, csp.join(" | "));
await browser.close(); await srv.close();
c.finish(errors);
