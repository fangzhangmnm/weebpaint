// created 2026-10-21 by Claude Opus 5.5（家族格式版本纪律 F-69 / 总账 #92）· rewritten 2026-10-21 by Claude Fable 5.1（对抗性审计：第二层回来 + 两层并存）
// F12 走真 app（OPFS 本地文件夹图库，退出到图库 = 推回文件夹 = 真写盘），五份未来样本（test/fixtures/format/synthetic/future-*，gen-future.mjs 拼）：
//   ① ora major 更新（format 4）：点开 → 拒开（警告通知说格式号、留在图库），文件字节一个都没变。
//   ② 每一部分 minor 更新 + 各带未知键 + 一个 `.weebpaint/` 未知 entry（wrote-with 也是更新的 app）：点开 → 「更新版本写的」说一次 + 第二层警告 + 顶栏红边
//      → 画一笔 → 失焦抢救 flush **不写**（没确认）→ 回图库 → 确认覆盖 → 读回文件：未知键 / 未知 entry 都在，拍子写成本版的，那一笔在。
//   ③ 只有 desk 的 major 更新：点开 → 「工作台设置是更新版本写的…改动存不下来」→ 画一笔 → 回图库（确认）→ editor-state.json 与原文件逐字节相同。
//   ④ 拍子全是本版、只有 wrote-with 更新（第二层的纯样本）：点开 → 警告 + 红边 → 画一笔 → 失焦不写 → 回图库 → **取消** → 留在画布、文件没变、红边还在
//      → 再回图库 → 确认 → 写了：wrote-with 换成本版、图层上那个未知属性没了（这就是要确认的原因）、红边撤。
//   ⑤ 只有参考清单的 major 更新：点开 → 「参考清单是更新版本写的…不能加参考」→ 从文件入口导入一张图 → 被拒（状态行）、牌组仍空
//      → 回图库（确认，wrote-with 更新）→ manifest / r0.png 逐字节相同。
//   全程零 CSP 拦截。真机（iPad Edge）没验。
import { chromium } from "playwright";
import { readFileSync } from "node:fs";
import { CTX_ZH, startServer, bootPage, makeChecker, evClick } from "./harness.mjs";
import { ensureZipLoaded } from "../../test/zip-node.mjs";

ensureZipLoaded();
const { zipUnpack } = await import("../../src/backend/zip.ts");
const { WEEBPAINT_VERSION } = await import("../../src/version.ts");
const fx = (rel) => new Uint8Array(readFileSync(new URL(`../../test/fixtures/format/${rel}`, import.meta.url)));
const SAMPLES = {
  "f12-major": fx("synthetic/future-major/ora-4.ora"), "f12-minor": fx("synthetic/future-minor/all-parts.ora"), "f12-desk": fx("synthetic/future-major/desk-2.ora"),
  "f12-app": fx("synthetic/future-app/newer-app-same-format.ora"), "f12-refs": fx("synthetic/future-major/references-2.ora"),
};
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
setTimeout(() => { console.error("[F12] WATCHDOG: 200s 硬切（挂死）"); process.exit(1); }, 200_000).unref?.();
const { page, errors } = await bootPage(context, srv.url);
const consoleTail = [];   // 失败时倒出来看（store 的 push 失败只走 reportError → console）
page.on("console", (m) => { consoleTail.push(`[${m.type()}] ${m.text().slice(0, 400)}`); if (consoleTail.length > 80) consoleTail.shift(); });
const dumpState = async (tag) => {
  const st = await page.evaluate(() => ({
    status: document.getElementById("statusLabel")?.textContent, inGallery: !document.getElementById("galleryFull").classList.contains("hidden"),
    sheets: [...document.querySelectorAll(".sheet[data-open]")].map((x) => `${x.id}:${x.querySelector("h3")?.textContent}`),
    notices: [...document.querySelectorAll(".notice .notice-text")].map((n) => (n.textContent || "").slice(0, 40)),
    tiles: [...document.querySelectorAll("#galleryMount .gallery-tile")].map((x) => `${x.querySelector(".gallery-tile-name")?.textContent.trim()}=${x.querySelector("[class*=badge]")?.getAttribute("title") || x.querySelector("[class*=badge]")?.className || "?"}`),
  }));
  console.log(`  [f12 dump ${tag}] ${JSON.stringify(st)}\n  console tail:\n    ${consoleTail.filter((l) => !/favicon/.test(l)).slice(-25).join("\n    ")}`);
};
const T0 = Date.now();
const trace = (m) => console.log(`  [f12 +${((Date.now() - T0) / 1000).toFixed(1)}s] ${m}`);

const readBack = (name) => page.evaluate(async ([dir, n]) => {
  const d = await (await navigator.storage.getDirectory()).getDirectoryHandle(dir);
  return [...new Uint8Array(await (await (await d.getFileHandle(n)).getFile()).arrayBuffer())];
}, [DIR, `${name}.ora`]).then((a) => new Uint8Array(a));
const notices = () => page.evaluate(() => [...document.querySelectorAll(".notice .notice-text")].map((n) => n.textContent || ""));
const redBar = () => page.evaluate(() => document.body.dataset.docNewer === "1");
const inGallery = () => page.evaluate(() => !document.getElementById("galleryFull").classList.contains("hidden"));
// 面的开合 = data-open 属性（ui/sheet.ts；.hidden 不是它的态）。只认标题是覆盖确认的那张。
const sheetUp = () => page.evaluate(() => { const s = document.getElementById("genericSheet"); return !!s && s.hasAttribute("data-open") && document.getElementById("genericSheetTitle")?.textContent === "覆盖更新版本写的画？"; });
const openTile = async (name) => {
  for (let i = 0; i < 20 && !(await page.evaluate((n) => [...document.querySelectorAll("#galleryMount .gallery-tile-name")].some((x) => x.textContent.trim() === n), name)); i++) await page.waitForTimeout(500);
  await page.evaluate((n) => { const t = [...document.querySelectorAll("#galleryMount .gallery-tile")].find((x) => x.querySelector(".gallery-tile-name")?.textContent.trim() === n); if (!t) throw new Error(`tile ${n} missing`); t.click(); }, name);
  await page.waitForTimeout(3000);
};
/** 回图库；expectSheet = 第二层的覆盖确认面该不该弹；choice = confirm | cancel。 */
const toGallery = async (expectSheet, choice = "confirm") => {
  await evClick(page, "menuButton"); await evClick(page, "menuGallery");
  let up = false;
  for (let i = 0; i < 12 && !up; i++) { await page.waitForTimeout(500); up = await sheetUp(); }   // 面可能晚一点才弹（app 忙着缩略图 / 列举）
  c.expect(`overwrite-confirm sheet ${expectSheet ? "shown" : "not shown"}`, up === expectSheet);
  if (up) { await evClick(page, choice === "confirm" ? "genericSheetConfirm" : "genericSheetCancel"); }
  await page.waitForTimeout(4000);
};
/** 画一笔，落点必须真在画布上：参考窗 / 通知条可能盖着中心（⑤ 的 desk 说参考窗开着、牌组却因带着被清空 = 一个空窗浮在中间）。
 *  从中心往外试几个点，取第一个 elementFromPoint 命中 canvas#board 的；一个都没有 = 响亮失败。 */
const drawOnBoard = async () => {
  const pt = await page.evaluate(() => {
    const b = document.getElementById("board").getBoundingClientRect();
    const cands = [[0.5, 0.5], [0.3, 0.5], [0.7, 0.5], [0.5, 0.3], [0.3, 0.3], [0.7, 0.3], [0.5, 0.7], [0.2, 0.2]];
    for (const [fx, fy] of cands) { const x = b.x + b.width * fx, y = b.y + b.height * fy; const el = document.elementFromPoint(x, y); if (el && el.id === "board") return { x, y }; }
    return null;
  });
  if (!pt) throw new Error("[F12] no free point on the canvas (something covers it everywhere)");
  const dx = 120;
  await page.mouse.move(pt.x - dx / 2, pt.y); await page.mouse.down();
  for (let i = 1; i <= 8; i++) await page.mouse.move(pt.x - dx / 2 + (dx * i) / 8, pt.y + Math.sin(i) * 6);
  await page.mouse.up(); await page.waitForTimeout(300);
};
const blurFlush = async () => { await page.evaluate(() => window.dispatchEvent(new Event("blur"))); await page.waitForTimeout(1500); };
/** 等文件被改写（退出推回文件夹是异步的，单跑 ③ 实测近 5 s；全跑时更慢）：最多 20 s，变了就返回新字节，没变返回原字节。 */
const waitWritten = async (name) => {
  for (let i = 0; i < 40; i++) { const b = await readBack(name); if (!same(b, SAMPLES[name])) return b; await page.waitForTimeout(500); }
  return readBack(name);
};

// OPFS 里先放好五张画（连接之前；folder provider 列举时就在）
await page.evaluate(async ([dir, entries]) => {
  const d = await (await navigator.storage.getDirectory()).getDirectoryHandle(dir, { create: true });
  for (const [n, bytes] of entries) { const w = await (await d.getFileHandle(`${n}.ora`, { create: true })).createWritable(); await w.write(new Uint8Array(bytes)); await w.close(); }
}, [DIR, Object.entries(SAMPLES).map(([n, b]) => [n, [...b]])]);

trace("connect folder gallery (OPFS as FSA)");
await evClick(page, "menuButton"); await evClick(page, "menuConnectGallery"); await page.waitForTimeout(300);
await page.evaluate(() => { const b = [...document.querySelectorAll("button")].find((x) => (x.textContent || "").includes("连接本地文件夹")); if (!b) throw new Error("no connect-folder item"); b.click(); });
await page.waitForTimeout(1500);
await page.evaluate(() => { const b = [...document.querySelectorAll("#genericSheetChoices button")].find((x) => !x.textContent.includes("继承")); b?.click(); });
for (let i = 0; i < 40 && (await page.evaluate(() => document.body.hasAttribute("data-no-gallery"))); i++) await page.waitForTimeout(500);
c.expect("folder gallery attached", await page.evaluate(() => !document.body.hasAttribute("data-no-gallery")));
if (!(await inGallery())) { await evClick(page, "menuButton"); await evClick(page, "menuGallery"); await page.waitForTimeout(1000); }

trace("① major 更新：拒开，什么都不写");
await openTile("f12-major");
const n1 = await notices();
c.expect("① refused with a warning naming the format (4.0.0 vs 3.0.0)", n1.some((s) => /更新版本的 WeebPaint 写的（格式 4\.0\.0，这版只认到 3\.0\.0）/.test(s)), JSON.stringify(n1));
c.expect("① stayed in the gallery (not opened)", await inGallery());
await page.waitForTimeout(1500);
c.expect("① file bytes untouched", same(await readBack("f12-major"), SAMPLES["f12-major"]));

trace("② minor 更新 + 较新 app：说一次、红边、失焦不写、确认后写回未知部分");
await openTile("f12-minor");
c.expect("② opened in the editor", !(await inGallery()));
const n2 = await notices();
c.expect("② newer-minor notice shown once", n2.filter((s) => /这版没有的功能保存时不会丢/.test(s)).length === 1, JSON.stringify(n2));
c.expect("② newer-app warning shown (second layer)", n2.some((s) => /这画由 v9\.9\.9-future 写的/.test(s)), JSON.stringify(n2));
c.expect("② red top bar on", await redBar());
await drawOnBoard();
await blurFlush();
c.expect("② blur flush wrote nothing before confirm", same(await readBack("f12-minor"), SAMPLES["f12-minor"]));
await toGallery(true, "confirm");
const out2 = await waitWritten("f12-minor");
c.expect("② file was rewritten after confirm", !same(out2, SAMPLES["f12-minor"]));
c.expect("② red top bar off after confirm", !(await redBar()));
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
  c.expect("② stack.xml stamp = 3.0.0 + wrote-with = this build", /weebpaint:format="3" weebpaint:format-minor="0" weebpaint:format-patch="0"/.test(xml) && xml.includes(`weebpaint:wrote-with="${WEEBPAINT_VERSION}"`), xml.slice(0, 300));
  const layersChanged = Object.keys(b).filter((p) => p.startsWith("data/")).some((p) => !same(a[p], b[p]));
  c.expect("② the stroke is in the saved layers", layersChanged);
  const names = Object.keys(b);
  c.expect("② thumbnail still the last entry", names[names.length - 1] === "Thumbnails/thumbnail.png", names.join(" "));
}

trace("③ desk major 更新：说清改动存不下来，原字节带回");
await openTile("f12-desk");
c.expect("③ opened in the editor", !(await inGallery()));
const n3 = await notices();
c.expect("③ part-too-new notice says desk edits won't be saved", n3.some((s) => /工作台设置/.test(s) && /存不下来/.test(s)), JSON.stringify(n3));
await drawOnBoard();
await toGallery(true, "confirm");
const out3 = await waitWritten("f12-desk");
if (same(out3, SAMPLES["f12-desk"])) await dumpState("③ not written");
{
  const a = await unzip(SAMPLES["f12-desk"]), b = await unzip(out3);
  c.expect("③ file was rewritten (save happened)", !same(out3, SAMPLES["f12-desk"]));
  c.expect("③ editor-state.json byte-identical to the newer version's", same(b[".weebpaint/editor-state.json"], a[".weebpaint/editor-state.json"]), txt(b[".weebpaint/editor-state.json"] ?? new Uint8Array()).slice(0, 200));
}

trace("④ 只有 wrote-with 更新：第二层纯样本，取消留在画布、确认才写");
await openTile("f12-app");
c.expect("④ opened in the editor", !(await inGallery()));
const n4 = await notices();
c.expect("④ newer-app warning shown", n4.some((s) => /这画由 v9\.9\.9-future 写的/.test(s)), JSON.stringify(n4));
c.expect("④ no newer-minor notice (stamps are this version's)", !n4.some((s) => /这版没有的功能保存时不会丢/.test(s)), JSON.stringify(n4));
c.expect("④ red top bar on", await redBar());
await drawOnBoard();
await blurFlush();
c.expect("④ blur flush wrote nothing", same(await readBack("f12-app"), SAMPLES["f12-app"]));
await toGallery(true, "cancel");
c.expect("④ cancel → still in the editor", !(await inGallery()));
c.expect("④ cancel → file untouched", same(await readBack("f12-app"), SAMPLES["f12-app"]));
c.expect("④ cancel → red top bar still on", await redBar());
await toGallery(true, "confirm");
c.expect("④ confirm → in the gallery", await inGallery());
const out4 = await waitWritten("f12-app");
{
  const xmlBefore = txt((await unzip(SAMPLES["f12-app"]))["stack.xml"]), xmlAfter = txt((await unzip(out4))["stack.xml"]);
  c.expect("④ confirm → written by this build", xmlAfter.includes(`weebpaint:wrote-with="${WEEBPAINT_VERSION}"`), xmlAfter.slice(0, 300));
  c.expect("④ the newer app's layer attribute was in the sample and is gone after our save (why confirmation exists)", xmlBefore.includes("future-layer-flag") && !xmlAfter.includes("future-layer-flag"));
  c.expect("④ red top bar off after confirm", !(await redBar()));
}

trace("⑤ 参考清单 major 更新：目录带着、拒收导入、存回逐字节相同");
await openTile("f12-refs");
c.expect("⑤ opened in the editor", !(await inGallery()));
const n5 = await notices();
c.expect("⑤ references-too-new notice", n5.some((s) => /参考清单是更新版本写的/.test(s)), JSON.stringify(n5));
await page.evaluate(() => { window.__status = []; const el = document.getElementById("statusLabel"); new MutationObserver(() => window.__status.push(el.textContent || "")).observe(el, { childList: true, characterData: true, subtree: true }); });
await page.setInputFiles("#referenceFileInput", { name: "pix.png", mimeType: "image/png", buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64") });
await page.waitForTimeout(2000);
const st5 = await page.evaluate(() => window.__status);
c.expect("⑤ import refused with the carried-references status", st5.some((s) => /参考清单是更新版本写的/.test(s)), JSON.stringify(st5));
c.expect("⑤ deck still empty", await page.evaluate(() => document.getElementById("referencePanel").deck.cards().length === 0));
await drawOnBoard();
await toGallery(true, "confirm");
const out5 = await waitWritten("f12-refs");
{
  const a = await unzip(SAMPLES["f12-refs"]), b = await unzip(out5);
  c.expect("⑤ file was rewritten (save happened)", !same(out5, SAMPLES["f12-refs"]));
  for (const p of [".weebpaint/references/manifest.json", ".weebpaint/references/r0.png"]) c.expect(`⑤ ${p} byte-identical`, same(b[p], a[p]));
}

const csp = await page.evaluate(() => window.__csp);
c.expect("zero CSP violations", csp.length === 0, csp.join(" | "));
await browser.close(); await srv.close();
c.finish(errors);
