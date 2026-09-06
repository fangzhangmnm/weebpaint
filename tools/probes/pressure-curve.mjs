// 笔刷压感曲线真浏览器探针（playwright，Chromium；不进 npm test 硬线）。created 2026-09-05 by Claude Fable 5.1
// 用法：bash scripts/build.sh && node tools/probes/pressure-curve.mjs
// 契约：笔架「新建笔刷」→ 设置表「高级」出 pressureGamma 滑条 + 「改用曲线」→ 点 → 曲线编辑器出现（curveFromGamma(1) = 5 键）
//   且 gamma 滑条隐去 → 真指针拖中键 → 键 v 变 → 「改回 gamma」→ 编辑器隐去、滑条回来 → 取消不炸。
import { chromium } from "playwright";
import { CTX_ZH, startServer, bootPage, makeChecker, evClick } from "../preflight/harness.mjs";

const srv = await startServer();
const browser = await chromium.launch();
const context = await browser.newContext(CTX_ZH);
const c = makeChecker("pressure-curve probe");
const { page, errors } = await bootPage(context, srv.url);

await evClick(page, "brushRackNew");
await page.waitForSelector("#brushSettingsView:not(.hidden)", { timeout: 5000 });
await page.waitForTimeout(200);

const findBtn = (text) => page.evaluate((t) => {
  const b = [...document.querySelectorAll("#brushSettingsBody button")].find((x) => (x.textContent || "").trim() === t);
  if (!b) throw new Error(`no button "${t}": ` + [...document.querySelectorAll("#brushSettingsBody button")].map((x) => x.textContent.trim()).join("|"));
  b.click();
}, text);
const readState = () => page.evaluate(() => {
  const body = document.getElementById("brushSettingsBody");
  const gammaRow = [...body.querySelectorAll(".brush-settings-row")].find((r) => (r.querySelector("label")?.textContent || "").trim() === "pressureGamma");
  const ed = body.querySelector(".curve-editor");
  return {
    hasGamma: !!gammaRow, hasEditor: !!ed,
    keyCount: ed ? +ed.dataset.keyCount : -1,
    keys: ed ? [...ed.querySelectorAll(".ce-key")].map((k) => ({ t: +k.dataset.t, v: +k.dataset.v })) : [],
    buttons: [...body.querySelectorAll("button")].map((b) => b.textContent.trim()).filter((s) => s.includes("曲线") || s.includes("gamma")),
  };
});

const s0 = await readState();
c.expect("初始：gamma 滑条在、无编辑器、有「改用曲线」", s0.hasGamma && !s0.hasEditor && s0.buttons.includes("改用曲线"), JSON.stringify(s0));

await findBtn("改用曲线");
await page.waitForTimeout(150);
const s1 = await readState();
c.expect("改用曲线后：编辑器出现（5 键恒等）、gamma 滑条隐去、按钮变「改回 gamma」", s1.hasEditor && !s1.hasGamma && s1.keyCount === 5 && s1.buttons.includes("改回 gamma"), JSON.stringify(s1));
c.expect("5 键落在恒等线上", s1.keys.every((k) => Math.abs(k.t - k.v) < 1e-3), JSON.stringify(s1.keys));

// 拖中键（t=0.5）向上
const mid = page.locator('#brushSettingsBody .ce-key[data-i="2"]');
await mid.scrollIntoViewIfNeeded();   // 设置表可滚动：键可能在视口外（鼠标事件落空）
await page.waitForTimeout(100);
const box = await mid.boundingBox();
const vp = page.viewportSize();
c.expect("中键在视口内", box && box.y >= 0 && box.y <= vp.height, JSON.stringify({ box, vp }));
const kx = box.x + box.width / 2, ky = box.y + box.height / 2;
await page.mouse.move(kx, ky); await page.mouse.down();
for (let i = 1; i <= 5; i++) await page.mouse.move(kx, ky - 10 * i);
await page.mouse.up();
await page.waitForTimeout(100);
const s2 = await readState();
const plotH = (await page.locator("#brushSettingsBody .ce-plot").boundingBox()).height;
const wantV = 0.5 + 50 / plotH;   // 上拖 50px = 50/绘图区高
c.expect("拖后中键 v ≈ 0.5 + 50/plotH（t 不变）", s2.keys[2] && Math.abs(s2.keys[2].v - wantV) < 0.02 && Math.abs(s2.keys[2].t - 0.5) < 1e-3, JSON.stringify({ got: s2.keys[2], wantV }));

await findBtn("改回 gamma");
await page.waitForTimeout(150);
const s3 = await readState();
c.expect("改回 gamma：编辑器隐去、滑条回来", !s3.hasEditor && s3.hasGamma && s3.buttons.includes("改用曲线"), JSON.stringify(s3));

await evClick(page, "brushSettingsCancel");
await page.waitForTimeout(200);
const hidden = await page.evaluate(() => document.getElementById("brushSettingsView").classList.contains("hidden"));
c.expect("取消后设置表关", hidden === true);

await browser.close(); await srv.close();
c.finish(errors);
