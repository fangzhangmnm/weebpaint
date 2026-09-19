// 手指 / 模糊 / 锐化（GPU 区域程序）真浏览器探针（playwright，Chromium；不进 npm test 硬线）。created 2026-09-18 by Claude Fable 5.1
//   源 = 09-05 的 tmp/smudge-ui-probe.mjs（手指工具 UI 契约）+ 本轮追加：模糊 / 锐化各画一笔走 RegionStroke（ADR-0014），零 pageerror / console.error。
// 用法：bash scripts/build-standalone.sh && node tools/probes/smudge-region.mjs
// 契约：① 顶栏有手指钮 #toolSmudge，点它进 filterBrush（smudge）、滤镜条可见、手指单独 dial（opacity 50）；
//      ② 手指画一笔零错误；③ 通过 wp:enter-filter-brush {id:"sharpenBlur", variant} 进模糊 / 锐化各画一笔零错误（区域程序 + W₀ 快照路径）；
//      ④ 二次点手指钮开笔架而非重进；切回画笔后手指钮灭、滤镜条藏。
import { chromium } from "playwright";
import { resolve } from "node:path";
const file = "file://" + resolve("dist/weebpaint-standalone.html");
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
page.on("console", (m) => { if (m.type() === "error") errors.push("console.error: " + m.text()); });
await page.goto(file, { waitUntil: "load" });
await page.waitForTimeout(3000);
const r = {};
async function strokeOnCanvas(label) {
  const canvas = await page.$("canvas");
  const box = canvas ? await canvas.boundingBox() : null;
  if (!box) { r[label] = "no-canvas"; return; }
  const before = errors.length;
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
  await page.mouse.move(cx - 60, cy);
  await page.mouse.down();
  for (let i = 1; i <= 24; i++) await page.mouse.move(cx - 60 + i * 5, cy + Math.sin(i / 3) * 6);
  await page.mouse.up();
  await page.waitForTimeout(300);
  r[label] = { newErrors: errors.length - before, tool: await page.evaluate(() => document.body.dataset.tool) };
}
// ① 手指
r.hasSmudgeBtn = await page.$("#toolSmudge") !== null;
await page.click("#toolSmudge");
await page.waitForTimeout(300);
r.toolAfterSmudge = await page.evaluate(() => document.body.dataset.tool);
r.fbToolbarVisible = await page.evaluate(() => { const t = document.getElementById("filterBrushToolbar"); return !!t && !t.classList.contains("hidden"); });
r.smudgeDial = await page.evaluate(() => ({ opacity: document.getElementById("opacitySlider")?.value, size: document.getElementById("sizeSlider")?.value }));
// ② 手指画一笔
await strokeOnCanvas("smudgeStroke");
// ③ 模糊 / 锐化（fx 菜单笔刷类的程序化入口 = toolbar.ts 同一事件）
for (const variant of ["blur", "sharp"]) {
  await page.evaluate((v) => window.dispatchEvent(new CustomEvent("wp:enter-filter-brush", { detail: { id: "sharpenBlur", variant: v } })), variant);
  await page.waitForTimeout(300);
  r[`fbTitle_${variant}`] = await page.evaluate(() => document.getElementById("filterBrushTitle")?.textContent);
  await strokeOnCanvas(`${variant}Stroke`);
}
// ④ 手指钮二次点 = 开笔架；切回画笔
await page.click("#toolSmudge"); await page.waitForTimeout(200);
await page.click("#toolSmudge"); await page.waitForTimeout(200);
r.rackAfterSecondTap = await page.evaluate(() => { const p = document.getElementById("rackFilterBrush") || document.querySelector('[data-panel*="filter"]'); return p ? !p.classList.contains("hidden") : "no-el"; });
await page.click("#toolPen"); await page.waitForTimeout(200);
r.smudgePressedAfterPen = await page.getAttribute("#toolSmudge", "aria-pressed");
r.fbToolbarHiddenAfterPen = await page.evaluate(() => document.getElementById("filterBrushToolbar")?.classList.contains("hidden"));
r.errors = errors;
console.log(JSON.stringify(r, null, 2));
await browser.close();
const ok = errors.length === 0 && r.toolAfterSmudge === "filterBrush" && r.fbToolbarVisible && r.smudgeStroke?.newErrors === 0 && r.blurStroke?.newErrors === 0 && r.sharpStroke?.newErrors === 0;
console.log(ok ? "[probe] ✓ smudge-region" : "[probe] ✗ smudge-region");
process.exit(ok ? 0 : 1);
