// 一次性吸色真浏览器探针（playwright，Chromium；不进 npm test 硬线）。created 2026-09-06 by Claude Fable 5.1（ADR-0012 §6 吸色搬家）
// 用法：bash scripts/build.sh && node tools/probes/pick-once.mjs
// 契约：① 顶栏无吸色钮；左栏两滑条之间有 #leftPick（吸管图标）；色板有 .cw-pick；
//   ② 点 #leftPick → picker 模式、钮 pressed；点画布（白纸）→ 笔色变 #ffffff、自动回 brush、钮不再 pressed；
//   ③ 从橡皮（E）按 I 进取样、吸一次 → 回**橡皮**（不是 brush）；④ 取样态再点 #leftPick = 取消，回原工具；
//   ⑤ 色板吸管钮同样进取样态；⑥ Alt+点画布（brush）= 临时吸色，不进 picker 模式。
import { chromium } from "playwright";
import { CTX_ZH, startServer, bootPage, makeChecker, evClick } from "../preflight/harness.mjs";

const srv = await startServer();
const browser = await chromium.launch();
const c = makeChecker("pick-once probe");
const ctx = await browser.newContext({ ...CTX_ZH, viewport: { width: 1200, height: 800 } });
const { page, errors } = await bootPage(ctx, srv.url);

const st = () => page.evaluate(() => ({
  tool: document.body.dataset.tool,
  hasTopPicker: !!document.getElementById("toolPicker"),
  leftPick: !!document.getElementById("leftPick"),
  leftPickIcon: document.querySelector("#leftPick use")?.getAttribute("href"),
  pressed: document.getElementById("leftPick")?.getAttribute("aria-pressed"),
  cwPick: !!document.querySelector("#colorPanel .cw-pick"),
  swatch: getComputedStyle(document.getElementById("activeSwatch")).backgroundColor,
  // 左栏顺序：取样钮应在 size 滑条之后、opacity 滑条之前
  order: [...document.querySelectorAll("#leftSidebar *")].map((e) => e.id).filter((s) => ["sizeSlider", "leftPick", "opacitySlider"].includes(s)),   // 组件挂在 display:contents 的 #leftDialMount 里，按文档序取
}));
const canvasCenter = async () => { const b = await page.locator("#board").boundingBox(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; };
const tapCanvas = async () => { const p = await canvasCenter(); await page.mouse.click(p.x, p.y); await page.waitForTimeout(150); };

const s0 = await st();
c.expect("顶栏无吸色钮，左栏有 #leftPick（吸管），色板有吸管钮", !s0.hasTopPicker && s0.leftPick && s0.leftPickIcon === "#eyedropper" && s0.cwPick, JSON.stringify(s0));
c.expect("取样钮在两滑条之间", s0.order.join(",") === "sizeSlider,leftPick,opacitySlider", s0.order.join(","));
c.expect("初始笔色非白（自证吸到白纸能看出变化）", s0.swatch !== "rgb(255, 255, 255)", s0.swatch);

// ② 左栏钮 → 吸一次 → 回 brush
await evClick(page, "leftPick"); await page.waitForTimeout(150);
const s1 = await st();
c.expect("点取样钮 → picker 模式、钮 pressed", s1.tool === "picker" && s1.pressed === "true", JSON.stringify(s1));
await tapCanvas();
const s2 = await st();
c.expect("吸白纸 → 笔色 #ffffff、回 brush、钮不 pressed", s2.swatch === "rgb(255, 255, 255)" && s2.tool === "brush" && s2.pressed === "false", JSON.stringify(s2));

// ③ 从橡皮 I → 吸 → 回橡皮
await page.keyboard.press("e"); await page.waitForTimeout(150);
c.expect("E → eraser", (await st()).tool === "eraser");
await page.keyboard.press("i"); await page.waitForTimeout(150);
c.expect("I → picker", (await st()).tool === "picker");
await tapCanvas();
c.expect("吸完回橡皮（原工具），不是 brush", (await st()).tool === "eraser", (await st()).tool);

// ④ 取样态再点钮 = 取消回原工具
await evClick(page, "leftPick"); await page.waitForTimeout(100);
c.expect("橡皮下点取样钮 → picker", (await st()).tool === "picker");
await evClick(page, "leftPick"); await page.waitForTimeout(100);
c.expect("再点 = 取消，回橡皮", (await st()).tool === "eraser", (await st()).tool);

// ⑤ 色板吸管钮
await page.keyboard.press("b"); await page.waitForTimeout(100);
await page.evaluate(() => document.querySelector("#colorPanel .cw-pick").click()); await page.waitForTimeout(150);
c.expect("色板吸管钮 → picker", (await st()).tool === "picker");
await tapCanvas();
c.expect("吸完回 brush", (await st()).tool === "brush");

// ⑥ Alt+点画布 = 临时吸色，不进 picker
await page.keyboard.down("Alt");
await tapCanvas();
await page.keyboard.up("Alt");
const s6 = await st();
c.expect("Alt+点：仍 brush（临时吸色不切模式）", s6.tool === "brush", s6.tool);

await browser.close(); await srv.close();
c.finish(errors);
