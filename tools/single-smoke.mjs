// P6 单文件 headless smoke（Chromium file://）：boot 不炸、EMBED 生效、版本水印、SW 没注册。
// created 2026-08-27 by Claude Fable 5. 用法：bash scripts/build-single.sh && node tools/single-smoke.mjs（playwright 档，不进 npm test 硬线）
import { chromium } from "playwright";
import { resolve } from "node:path";

const file = "file://" + resolve("dist/weebpaint-single.html");
const browser = await chromium.launch();
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
page.on("console", (m) => { if (m.type() === "error") errors.push("console.error: " + m.text()); });
await page.goto(file, { waitUntil: "load" });
await page.waitForTimeout(3000);   // boot 收尾（异步链）

const probe = await page.evaluate(async () => {
  const g = window;
  const canvas = document.querySelector("canvas");
  return {
    embed: !!g.__WEEBPAINT_EMBED__,
    embedKeys: g.__WEEBPAINT_EMBED__ ? Object.keys(g.__WEEBPAINT_EMBED__).length : 0,
    swRegs: await (async () => { try { return "serviceWorker" in navigator ? (await navigator.serviceWorker.getRegistrations()).length : -1; } catch { return 0; } })(),   // file:// 查询本身就抛 = 无 SW
    hasCanvas: !!canvas,
    canvasSize: canvas ? [canvas.width, canvas.height] : null,
    title: document.title,
    bodyChildren: document.body.childElementCount,
  };
});
console.log(JSON.stringify(probe, null, 2));
const fatal = errors.filter((e) => !/favicon|manifest/.test(e));
if (fatal.length) { console.error("ERRORS:\n" + fatal.join("\n")); }
await browser.close();
if (!probe.embed || probe.embedKeys < 6) { console.error("FAIL: embed 缺失"); process.exit(1); }
if (probe.swRegs !== 0) { console.error("FAIL: SW 注册数 = " + probe.swRegs); process.exit(1); }
if (!probe.hasCanvas) { console.error("FAIL: 无 canvas（boot 挂了）"); process.exit(1); }
if (fatal.length) process.exit(1);
console.log("SMOKE OK");
