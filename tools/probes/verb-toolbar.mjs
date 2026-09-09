// 顶栏动词位 + 上下文条左段子工具栏 真浏览器探针（playwright，Chromium；不进 npm test 硬线）。created 2026-09-06 by Claude Fable 5.1
// 2026-09-06 晚重写（ADR-0012 修订 ③，user「子工具栈并入上下文条，成为它的左段；长按不再弹菜单，只是把这条上下文条叫出来」）。
// 用法：bash scripts/build.sh && node tools/probes/verb-toolbar.mjs
// 契约：① 顶栏没有形状笔/油漆桶独立钮；笔位带小三角、橡皮位无；② 初始 brush 且 #brushToolbar 藏；**长按笔位** → #brushToolbar 显、左段
//   [自由手] pressed、长按后的 click 被吞（仍 brush）、**不再弹 popup 菜单**；点左段「形状」→ shapeBrush、形状条显且其左段 [形状] pressed、#brushToolbar 收；
//   ③ B → brush、笔位图标回 #pencil；④ 点套索位 → 套索条显、左段 [选区] pressed；点左段「油漆桶」→ fill、顶栏图标 #paint-bucket；
//   ⑤ 点手指位 → filterBrush、滤镜笔条第一件 = 子工具下拉 #filterBrushSubSel（2026-09-09 修订 ④：六颗图标左段 → 带图标下拉），弹层 6 项各带图标；
//      选「模糊」→ sharpenBlur/blur、手指位图标仍 #finger（六项同图标，user 2026-09-09）、adjust 不亮、**无 variant 下拉**（子工具下拉盖住了）；
//   点「液化」→ 有 variant 下拉（pinch/bloat 左段没盖）；⑥ fx 菜单不再列滤镜笔；⑦ 375 宽顶栏与滤镜笔条不横向溢出。
import { chromium } from "playwright";
import { CTX_ZH, startServer, bootPage, makeChecker, evClick, drawStroke } from "../preflight/harness.mjs";

const srv = await startServer();
const browser = await chromium.launch();
const c = makeChecker("verb-toolbar probe");
const allErrors = [];

const vis = (id) => { const el = document.getElementById(id); return !!el && !el.classList.contains("hidden") && getComputedStyle(el).display !== "none"; };
const state = (page) => page.evaluate((visSrc) => {
  const vis = new Function("id", `return (${visSrc})(id)`);
  const pressedIn = (rootId) => [...(document.getElementById(rootId)?.querySelectorAll("[data-verb-sub]") ?? [])].filter((b) => b.getAttribute("aria-pressed") === "true").map((b) => b.dataset.verbSub);
  return {
    tool: document.body.dataset.tool,
    pen: document.querySelector("#toolPen use")?.getAttribute("href"),
    penCaret: !!document.querySelector("#toolPen .tool-caret"), eraserCaret: !!document.querySelector("#toolEraser .tool-caret"),
    smudge: document.querySelector("#toolSmudge use")?.getAttribute("href"), lasso: document.querySelector("#toolLasso use")?.getAttribute("href"),
    adjustPressed: document.getElementById("topAdjustBtn").getAttribute("aria-pressed"),
    brushBar: vis("brushToolbar"), shapeBar: vis("shapeToolbarStack"), lassoBar: vis("lassoToolbarStack"), fbBar: vis("filterBrushToolbar"),
    brushSeg: pressedIn("brushToolbar"), shapeSeg: pressedIn("shapeToolbarStack"), lassoSeg: pressedIn("lassoToolbarStack"), fbSeg: pressedIn("filterBrushToolbar"),
    fbSubSel: !!document.getElementById("filterBrushSubSel"), fbSubIcon: document.querySelector("#filterBrushSubSel .select-field-icon use")?.getAttribute("href"),
    fbSubLabel: document.querySelector("#filterBrushSubSel .select-field-label")?.textContent,
    fbTitle: !!document.querySelector("#filterBrushToolbar .ct-title"),
    fbRowFits: (() => { const r = document.querySelector("#filterBrushToolbar .lasso-toolbar"); return r ? r.scrollWidth <= r.clientWidth + 1 : null; })(),
    fbVariantSel: !!document.getElementById("filterBrushVariantSel"),
    hasShapeBtn: !!document.getElementById("toolShape"), hasFillBtn: !!document.getElementById("toolFill"),
    popupMenus: [...document.querySelectorAll(".popup-menu-item, [role=menuitem]")].filter((b) => b.offsetParent !== null).length,
  };
}, vis.toString());
const longPress = async (page, id, ms = 600) => {
  const b = await page.locator("#" + id).boundingBox();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down(); await page.waitForTimeout(ms); await page.mouse.up(); await page.waitForTimeout(150);
};
// 手指位子工具下拉：点钮面开 popup-menu compact → 点 data-id 项（弹层项带图标 = popup-menu compact 2026-09-09 起画 icon）
const pickSub = async (page, sub) => {
  await page.evaluate(() => document.getElementById("filterBrushSubSel").click());
  await page.waitForTimeout(150);
  const n = await page.evaluate((sub) => {
    const items = [...document.querySelectorAll('.popup-menu--compact [data-id]')];
    const withIcon = items.filter((b) => b.querySelector("svg use")).length;
    const b = items.find((b) => b.dataset.id === sub);
    if (!b) throw new Error(`no dropdown item ${sub}; have ${items.map((x) => x.dataset.id).join(",")}`);
    b.click();
    return { total: items.length, withIcon };
  }, sub);
  await page.waitForTimeout(300);
  return n;
};
const clickSeg = (page, barId, sub) => page.evaluate(({ barId, sub }) => {
  const b = document.querySelector(`#${barId} [data-verb-sub="${sub}"]`);
  if (!b) throw new Error(`no segment button ${sub} in #${barId}`);
  b.click();
}, { barId, sub });

{
  const ctx = await browser.newContext({ ...CTX_ZH, viewport: { width: 1200, height: 800 } });
  const { page, errors } = await bootPage(ctx, srv.url);
  allErrors.push(...errors);
  await drawStroke(page);
  const s0 = await state(page);
  c.expect("顶栏无形状笔/油漆桶独立钮", !s0.hasShapeBtn && !s0.hasFillBtn);
  c.expect("笔位有小三角、橡皮位（单子工具）无", s0.penCaret && !s0.eraserCaret, JSON.stringify(s0));
  c.expect("初始 brush、笔位 #pencil、#brushToolbar 藏", s0.tool === "brush" && s0.pen === "#pencil" && !s0.brushBar, JSON.stringify(s0));

  // ② 长按笔位 → 叫出笔条（不弹菜单）
  await longPress(page, "toolPen");
  const s1 = await state(page);
  c.expect("长按笔位 → #brushToolbar 显、左段 [自由手] pressed、无 popup 菜单、仍 brush", s1.brushBar && s1.brushSeg.join() === "freehand" && s1.popupMenus === 0 && s1.tool === "brush", JSON.stringify(s1));
  await clickSeg(page, "brushToolbar", "shape"); await page.waitForTimeout(200);
  const s2 = await state(page);
  c.expect("点左段「形状」→ shapeBrush、形状条显且左段 [形状] pressed、笔条收、笔位 #shapes", s2.tool === "shapeBrush" && s2.shapeBar && s2.shapeSeg.join() === "shape" && !s2.brushBar && s2.pen === "#shapes", JSON.stringify(s2));
  // ③ B → brush
  await page.keyboard.press("b"); await page.waitForTimeout(200);
  const s3 = await state(page);
  c.expect("B → brush、笔位 #pencil、形状条收", s3.tool === "brush" && s3.pen === "#pencil" && !s3.shapeBar, JSON.stringify(s3));
  // ④ 套索位
  await evClick(page, "toolLasso"); await page.waitForTimeout(200);
  const s4 = await state(page);
  c.expect("点套索位 → 套索条显、左段 [选区] pressed", s4.tool === "lasso" && s4.lassoBar && s4.lassoSeg.join() === "select", JSON.stringify(s4));
  await clickSeg(page, "lassoToolbarStack", "fill"); await page.waitForTimeout(200);
  const s5 = await state(page);
  c.expect("点左段「油漆桶」→ fill、顶栏 #paint-bucket、左段 [油漆桶] pressed", s5.tool === "fill" && s5.lasso === "#paint-bucket" && s5.lassoSeg.join() === "fill", JSON.stringify(s5));
  // ⑤ 手指位
  await evClick(page, "toolSmudge"); await page.waitForTimeout(300);
  const s6 = await state(page);
  c.expect("点手指位 → filterBrush、滤镜笔条显、第一件 = 子工具下拉（钮面 #finger + 名字）、无条标题、无 variant 下拉、行不溢出", s6.tool === "filterBrush" && s6.fbBar && s6.fbSubSel && s6.fbSubIcon === "#finger" && !!s6.fbSubLabel && !s6.fbTitle && !s6.fbVariantSel && s6.fbRowFits === true, JSON.stringify(s6));
  const dd = await pickSub(page, "blur");
  const s7 = await state(page);
  // 2026-09-09 user「就是手指就行啦」：六项同一个 #finger（像 fx 菜单同图标那样整齐）——钮面/顶栏永远 #finger，名字在下拉 label
  c.expect("下拉 6 项全带（同一个手指）图标；选「模糊」→ 手指位仍 #finger、钮面 #finger、label=模糊、adjust 不亮、无 variant 下拉", dd.total === 6 && dd.withIcon === 6 && s7.tool === "filterBrush" && s7.smudge === "#finger" && s7.fbSubIcon === "#finger" && /模糊/.test(s7.fbSubLabel || "") && s7.adjustPressed === "false" && !s7.fbVariantSel, JSON.stringify({ dd, s7 }));
  await pickSub(page, "liquify");
  const s8 = await state(page);
  c.expect("选「液化」→ label=液化、有 variant 下拉（pinch/bloat 子工具下拉没盖）", s8.smudge === "#finger" && /液化/.test(s8.fbSubLabel || "") && s8.fbVariantSel, JSON.stringify(s8));
  await pickSub(page, "paint");
  const s9 = await state(page);
  c.expect("选「带颜料的手指」→ label=带颜料的手指、钮面 #finger", /带颜料/.test(s9.fbSubLabel || "") && s9.fbSubIcon === "#finger", JSON.stringify(s9));
  // 2026-09-09 排版：宽屏（1200）套索条左段与后续项之间不许有 26vw 级空白——左段 flex:none，量左段右缘到下一件左缘的间距
  await evClick(page, "toolLasso"); await page.waitForTimeout(200);
  const gap = await page.evaluate(() => {
    const seg = document.querySelector("#lassoToolbarRow1 .verb-segment"); if (!seg) return null;
    const segR = seg.getBoundingClientRect().right;
    let nxt = seg.parentElement.nextElementSibling; while (nxt && (nxt.hidden || nxt.classList.contains("hidden") || getComputedStyle(nxt).display === "none")) nxt = nxt.nextElementSibling;
    return nxt ? Math.round(nxt.getBoundingClientRect().left - segR) : null;
  });
  c.expect("1200 宽套索条：左段与下一件之间 ≤ 12px（原 26vw min-width 撑出三百 px 空白）", gap != null && gap <= 12, "gap=" + gap);
  // ⑥ fx 菜单不再列滤镜笔
  await evClick(page, "topAdjustBtn"); await page.waitForTimeout(200);
  const fxLabels = await page.evaluate(() => [...document.querySelectorAll("#adjustFilterList .menu-item")].map((b) => (b.textContent || "").trim()));
  c.expect("fx 菜单不含 液化/手指/锐化模糊 笔刷项", !fxLabels.some((l) => /液化|手指|涂抹|锐化/.test(l)), fxLabels.join("|"));
  await ctx.close();
}
{
  const ctx = await browser.newContext({ ...CTX_ZH, viewport: { width: 375, height: 667 }, isMobile: true, hasTouch: true });
  const { page, errors } = await bootPage(ctx, srv.url);
  allErrors.push(...errors);
  const tb = await page.evaluate(() => { const h = document.getElementById("topBar"); return { scrollW: h.scrollWidth, clientW: h.clientWidth }; });
  c.expect("375 宽顶栏不横向溢出", tb.scrollW <= tb.clientW + 1, JSON.stringify(tb));
  await drawStroke(page);
  await evClick(page, "toolSmudge"); await page.waitForTimeout(400);
  // 量的是**行**（.lasso-toolbar 才是 overflow 容器；stack 永远不溢出，原来量 stack 是假绿）
  const fb = await page.evaluate(() => { const h = document.getElementById("filterBrushToolbar"); const r = h.querySelector(".lasso-toolbar"); return { scrollW: r.scrollWidth, clientW: r.clientWidth, vis: !h.classList.contains("hidden"), more: !!h.querySelector(".ct-more"), subSel: !!document.getElementById("filterBrushSubSel") && !document.getElementById("filterBrushSubSel").hidden }; });
  c.expect("375 宽滤镜笔条行不横向溢出（工厂「…」折叠；子工具下拉永不折）", fb.vis && fb.scrollW <= fb.clientW + 1 && fb.subSel, JSON.stringify(fb));
  await ctx.close();
}
await browser.close(); await srv.close();
c.finish(allErrors);
