// 顶栏动词位 + 子工具长按真浏览器探针（playwright，Chromium；不进 npm test 硬线）。created 2026-09-06 by Claude Fable 5.1（UI 抽象轮 U3，ADR-0012）
// 用法：bash scripts/build.sh && node tools/probes/verb-toolbar.mjs
// 契约：① 顶栏没有形状笔/油漆桶独立钮；笔/手指/套索位带小三角；② 长按笔位（真指针按住 600ms）→ 子工具菜单 → 选「形状笔」
//   → editMode=shapeBrush、笔位图标换 #shapes、形状条出现；长按后的 click 被吞（不切回 freehand）；③ 键盘 B → 回 brush、图标回 #pencil；
//   ④ 套索位长按选「油漆桶」→ fill 模式、图标 #paint-bucket；⑤ 手指位长按选「模糊」→ filterBrush + sharpenBlur/blur 且手指位亮、adjust 钮不亮；
//   ⑥ 375 宽顶栏不横向溢出。
import { chromium } from "playwright";
import { CTX_ZH, startServer, bootPage, makeChecker, evClick, drawStroke } from "../preflight/harness.mjs";

const srv = await startServer();
const browser = await chromium.launch();
const c = makeChecker("verb-toolbar probe");
const allErrors = [];

const state = (page) => page.evaluate(() => ({
  tool: document.body.dataset.tool,
  pen: document.querySelector("#toolPen use")?.getAttribute("href"),
  penPressed: document.getElementById("toolPen").getAttribute("aria-pressed"),
  penCaret: !!document.querySelector("#toolPen .tool-caret"),
  eraserCaret: !!document.querySelector("#toolEraser .tool-caret"),
  smudge: document.querySelector("#toolSmudge use")?.getAttribute("href"),
  smudgePressed: document.getElementById("toolSmudge").getAttribute("aria-pressed"),
  lasso: document.querySelector("#toolLasso use")?.getAttribute("href"),
  lassoPressed: document.getElementById("toolLasso").getAttribute("aria-pressed"),
  adjustPressed: document.getElementById("topAdjustBtn").getAttribute("aria-pressed"),
  shapeToolbarVisible: !document.getElementById("shapeToolbarStack").classList.contains("hidden"),
  fbToolbarVisible: !document.getElementById("filterBrushToolbar").classList.contains("hidden"),
  fbTitle: document.querySelector("#filterBrushToolbar .ct-title")?.textContent ?? "",
  hasShapeBtn: !!document.getElementById("toolShape"), hasFillBtn: !!document.getElementById("toolFill"),
  menuLabels: [...document.querySelectorAll(".popup-menu-item, [role=menuitem]")].map((b) => (b.textContent || "").trim()),
}));
const longPress = async (page, id, ms = 600) => {
  const b = await page.locator("#" + id).boundingBox();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(ms);
  await page.mouse.up();
  await page.waitForTimeout(150);
};
const pickMenu = (page, text) => page.evaluate((t) => {
  const items = [...document.querySelectorAll(".popup-menu-item, [role=menuitem]")];
  const it = items.find((b) => (b.textContent || "").includes(t));
  if (!it) throw new Error(`menu item "${t}" not found in [${items.map((b) => b.textContent.trim()).join("|")}]`);
  it.click();
}, text);

{
  const ctx = await browser.newContext({ ...CTX_ZH, viewport: { width: 1200, height: 800 } });
  const { page, errors } = await bootPage(ctx, srv.url);
  allErrors.push(...errors);
  await drawStroke(page);
  const s0 = await state(page);
  c.expect("顶栏无形状笔/油漆桶独立钮", !s0.hasShapeBtn && !s0.hasFillBtn);
  c.expect("笔位有小三角、橡皮位（单子工具）无", s0.penCaret && !s0.eraserCaret, JSON.stringify(s0));
  c.expect("初始：笔位 #pencil 亮，tool=brush", s0.pen === "#pencil" && s0.penPressed === "true" && s0.tool === "brush", JSON.stringify(s0));

  // ② 长按笔位 → 菜单 → 形状笔
  await longPress(page, "toolPen");
  const s1 = await state(page);
  c.expect("长按后出子工具菜单（含 形状笔）", s1.menuLabels.some((l) => l.includes("形状笔")), s1.menuLabels.join("|"));
  c.expect("长按后的 click 被吞：仍是 brush", s1.tool === "brush", s1.tool);
  await pickMenu(page, "形状笔");
  await page.waitForTimeout(200);
  const s2 = await state(page);
  c.expect("选形状笔 → editMode shapeBrush、笔位图标 #shapes、仍亮", s2.tool === "shapeBrush" && s2.pen === "#shapes" && s2.penPressed === "true", JSON.stringify(s2));
  c.expect("形状工具条出现", s2.shapeToolbarVisible);
  // ③ 键盘 B → 回 freehand（记忆同步）
  await page.keyboard.press("b"); await page.waitForTimeout(200);
  const s3 = await state(page);
  c.expect("B → brush、笔位图标回 #pencil", s3.tool === "brush" && s3.pen === "#pencil", JSON.stringify(s3));
  // ④ 套索位长按 → 油漆桶
  await longPress(page, "toolLasso");
  await pickMenu(page, "油漆桶"); await page.waitForTimeout(200);
  const s4 = await state(page);
  c.expect("套索位选油漆桶 → fill、图标 #paint-bucket、套索位亮", s4.tool === "fill" && s4.lasso === "#paint-bucket" && s4.lassoPressed === "true", JSON.stringify(s4));
  // 单击套索位（已激活）→ 不切子工具、仍 fill
  await evClick(page, "toolLasso"); await page.waitForTimeout(150);
  c.expect("已激活再点套索位：仍 fill", (await state(page)).tool === "fill");
  // ⑤ 手指位长按 → 模糊
  await longPress(page, "toolSmudge");
  await pickMenu(page, "模糊"); await page.waitForTimeout(300);
  const s5 = await state(page);
  c.expect("手指位选模糊 → filterBrush、手指位亮、adjust 不亮、图标 #blur、滤镜条标题=锐化/模糊", s5.tool === "filterBrush" && s5.smudgePressed === "true" && s5.adjustPressed === "false" && s5.smudge === "#blur" && s5.fbToolbarVisible && s5.fbTitle.includes("模糊"), JSON.stringify(s5));
  // 单击笔位 → brush（子工具记忆 freehand）
  await evClick(page, "toolPen"); await page.waitForTimeout(200);
  c.expect("点笔位回 brush，滤镜条隐", (await state(page)).tool === "brush" && !(await state(page)).fbToolbarVisible);
  // 再进手指位：记忆 = 模糊
  await evClick(page, "toolSmudge"); await page.waitForTimeout(300);
  const s6 = await state(page);
  c.expect("再点手指位 → 记忆的子工具（模糊）", s6.tool === "filterBrush" && s6.smudge === "#blur", JSON.stringify(s6));
  await ctx.close();
}
{
  const ctx = await browser.newContext({ ...CTX_ZH, viewport: { width: 375, height: 667 }, isMobile: true, hasTouch: true });
  const { page, errors } = await bootPage(ctx, srv.url);
  allErrors.push(...errors);
  const tb = await page.evaluate(() => { const h = document.getElementById("topBar"); return { scrollW: h.scrollWidth, clientW: h.clientWidth }; });
  c.expect("375 宽顶栏不横向溢出", tb.scrollW <= tb.clientW + 1, JSON.stringify(tb));
  await ctx.close();
}
await browser.close(); await srv.close();
c.finish(allErrors);
