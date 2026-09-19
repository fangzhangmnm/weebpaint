// 顶栏动词位 + 上下文条左段子工具栏 真浏览器探针（playwright，Chromium；不进 npm test 硬线）。created 2026-09-06 by Claude Fable 5.1
// 2026-09-06 晚重写（ADR-0012 修订 ③，user「子工具栈并入上下文条，成为它的左段；长按不再弹菜单，只是把这条上下文条叫出来」）。
// 用法：bash scripts/build.sh && node tools/probes/verb-toolbar.mjs
// 契约：① 顶栏有形状笔独立钮 #toolShape（data-verb=shape，图标 #shapes；2026-09-18 回滚复活，user「单独一个顶栏按钮」）、无油漆桶独立钮；
//      笔位/橡皮位/形状位都无小三角（单子工具）；初始 brush、笔位 #pencil；
//   ② 形状笔（ADR-0005，行为 = v0.14.6）：点形状位 → shapeBrush + 工厂形状条 #shapeToolbar（线/矩/圆/格平铺，默认 [直线] pressed）+ 左栏滑条可见；
//      拖一下 = 一笔（undo 可用）；[矩形] 已选中再点 → 变体菜单 2 项 → 选「正方形」→ 钮面 #square；[格线] → 行/列 stepper + 外框钮；透视下拉选二点 → 平面钮 ×3 + 编辑消失点 + gizmo 钮，
//      切回 [直线] → 平面钮藏；已激活再点形状位 → 开共享画笔笔架 #brushRackSheet；B → brush 条藏；S → shapeBrush 条显、子工具记住；无几何 extension 残留（#rulerToolbar / #leftRuler）；
//   ③ B → brush、笔位图标 #pencil；④ 点套索位 → 套索条显、左段 [选区] pressed；点左段「油漆桶」→ fill、顶栏图标 #paint-bucket；
//   ⑤ 点手指位 → filterBrush、滤镜笔条第一件 = 子工具下拉 #filterBrushSubSel（2026-09-09 修订 ④：六颗图标左段 → 带图标下拉；2026-09-11 钮面只图标 face=icon，值读 data-value），弹层 6 项各带图标；
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
    lassoBar: vis("lassoToolbarStack"), fbBar: vis("filterBrushToolbar"),
    lassoSeg: pressedIn("lassoToolbarStack"), fbSeg: pressedIn("filterBrushToolbar"),
    hasRulerBar: !!document.getElementById("rulerToolbar"), hasLeftRuler: !!document.getElementById("leftRuler"), placeLayer: !!document.getElementById("rulerPlaceLayer"),
    hasLeftRackBtn: !!document.querySelector("#leftSidebar .left-sidebar-brush:not(.left-sidebar-pick)"),
    shapeIcon: document.querySelector("#toolShape use")?.getAttribute("href"), shapeCaret: !!document.querySelector("#toolShape .tool-caret"),
    shapePressed: document.getElementById("toolShape")?.getAttribute("aria-pressed"),
    shapeBar: vis("shapeToolbar"), hasShapeBar: !!document.getElementById("shapeToolbar"),
    shapeSub: ["line", "rect", "circle", "grid"].find((s) => document.getElementById("shapeSub-" + s)?.getAttribute("aria-pressed") === "true") ?? null,
    shapeSubVisible: ["line", "rect", "circle", "grid"].filter((s) => vis("shapeSub-" + s)).length,
    rectIcon: document.querySelector("#shapeSub-rect use")?.getAttribute("href"), lineIcon: document.querySelector("#shapeSub-line use")?.getAttribute("href"),
    hasGridCtl: !!document.getElementById("shapeGridCtl"), hasGridBorder: !!document.getElementById("shapeGridBorder"),
    perspSel: document.getElementById("shapePerspSel")?.dataset.value,
    planeBtns: document.querySelectorAll("#shapeToolbar [id^='shapePlane-']").length,
    hasVpEdit: !!document.getElementById("shapeVpEdit"), hasGizmoBtn: !!document.getElementById("shapeShowGizmo"),
    rackSheetVis: vis("brushRackSheet"),
    perspBar: vis("perspToolbar"), hasPerspDone: !!document.getElementById("perspDoneBtn"), perspHandles: vis("perspHandles"),
    shapeRowFits: (() => { const r = document.querySelector("#shapeToolbar .lasso-toolbar"); return r ? r.scrollWidth <= r.clientWidth + 1 : null; })(),
    lassoBarBottom: (() => { const el = document.getElementById("lassoToolbarStack"); return el && !el.classList.contains("hidden") ? el.getBoundingClientRect().bottom : -1; })(),
    undoDisabled: !!document.getElementById("undoButton")?.disabled,
    sizeSliderVis: vis("sizeSlider"),
    anyToolPressed: [...document.querySelectorAll("#topBar .tool[aria-pressed='true']")].length,
    fbSubSel: !!document.getElementById("filterBrushSubSel"), fbSubIcon: document.querySelector("#filterBrushSubSel .select-field-icon use")?.getAttribute("href"),
    fbSubLabel: document.querySelector("#filterBrushSubSel .select-field-label")?.textContent,   // 2026-09-11 只图标档 → 空串（值读 data-value）
    fbSubValue: document.getElementById("filterBrushSubSel")?.dataset.value, fbSubFace: document.getElementById("filterBrushSubSel")?.dataset.face,
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
  c.expect("顶栏有形状笔独立钮（#shapes）、无油漆桶独立钮", s0.hasShapeBtn && s0.shapeIcon === "#shapes" && !s0.hasFillBtn, JSON.stringify(s0));
  c.expect("笔位 / 橡皮位 / 形状位都无小三角（单子工具）", !s0.penCaret && !s0.eraserCaret && !s0.shapeCaret, JSON.stringify(s0));
  c.expect("初始 brush、笔位 #pencil", s0.tool === "brush" && s0.pen === "#pencil", JSON.stringify(s0));
  // 长按笔位（单子工具）不叫出任何条、不弹菜单
  await longPress(page, "toolPen");
  const s0b = await state(page);
  c.expect("长按笔位 → 无事（无子工具）：无 popup、无形状条、仍 brush", s0b.popupMenus === 0 && !s0b.shapeBar && s0b.tool === "brush", JSON.stringify(s0b));

  // ② 形状笔（2026-09-18 回滚复活，ADR-0005；几何 extension 已删）
  c.expect("初始：形状条已登记但藏；无几何 extension 残留（#rulerToolbar / #leftRuler / 笔架钮 / 捕获层）；左栏滑条可见", s0.hasShapeBar && !s0.shapeBar && !s0.hasRulerBar && !s0.hasLeftRuler && !s0.hasLeftRackBtn && !s0.placeLayer && s0.sizeSliderVis, JSON.stringify(s0));
  await evClick(page, "toolShape"); await page.waitForTimeout(250);
  const q1 = await state(page);
  c.expect("点形状位 → shapeBrush、形状位亮（只它亮）、形状条显、四子工具平铺 [直线] pressed、透视下拉=off、无格线件、左栏滑条可见", q1.tool === "shapeBrush" && q1.shapePressed === "true" && q1.anyToolPressed === 1 && q1.shapeBar && q1.shapeSubVisible === 4 && q1.shapeSub === "line" && q1.lineIcon === "#line" && q1.perspSel === "off" && !q1.hasGridCtl && q1.planeBtns === 0 && q1.sizeSliderVis && q1.shapeRowFits === true, JSON.stringify(q1));
  await drawStroke(page);
  const q1b = await state(page);
  c.expect("形状笔拖一下 = 一笔落像素（undo 可用）、仍 shapeBrush", !q1b.undoDisabled && q1b.tool === "shapeBrush", JSON.stringify(q1b));
  await evClick(page, "shapeSub-rect"); await page.waitForTimeout(150);
  const q2 = await state(page);
  c.expect("点 [矩形] → pressed rect、钮面 #rectangle（未约束）", q2.shapeSub === "rect" && q2.rectIcon === "#rectangle" && q2.popupMenus === 0, JSON.stringify(q2));
  await evClick(page, "shapeSub-rect"); await page.waitForTimeout(200);
  const q2b = await state(page);
  c.expect("已选中再点 [矩形] → 变体菜单开（长方形 / 正方形 2 项）", q2b.popupMenus === 2 && q2b.shapeSub === "rect", JSON.stringify(q2b));
  await page.evaluate(() => { const b = [...document.querySelectorAll(".popup-menu--compact [data-id]")].find((x) => x.dataset.id === "constrain"); if (!b) throw new Error("no constrain variant"); b.click(); });
  await page.waitForTimeout(200);
  const q2c = await state(page);
  c.expect("选「正方形」→ 钮面 #square、菜单关、仍 rect", q2c.rectIcon === "#square" && q2c.popupMenus === 0 && q2c.shapeSub === "rect", JSON.stringify(q2c));
  await evClick(page, "shapeSub-grid"); await page.waitForTimeout(150);
  const q3 = await state(page);
  c.expect("点 [格线] → 行/列 stepper + 外框钮出现、行不溢出", q3.shapeSub === "grid" && q3.hasGridCtl && q3.hasGridBorder && q3.shapeRowFits === true, JSON.stringify(q3));
  await page.evaluate(() => document.getElementById("shapePerspSel").click()); await page.waitForTimeout(150);
  await page.evaluate(() => { const b = [...document.querySelectorAll(".popup-menu--compact [data-id]")].find((x) => x.dataset.id === "p2"); if (!b) throw new Error("no p2 item"); b.click(); });
  await page.waitForTimeout(250);
  const q4 = await state(page);
  c.expect("透视下拉选「二点」→ 平面钮 ×3（地板/左墙/右墙）+ 编辑消失点 + gizmo 钮", q4.perspSel === "p2" && q4.planeBtns === 3 && q4.hasVpEdit && q4.hasGizmoBtn, JSON.stringify(q4));
  // 编辑消失点（transient）→ ✓ 回形状笔（2026-09-18 user「没有勾勾没法回到上一级模式」）
  await evClick(page, "shapeVpEdit"); await page.waitForTimeout(250);
  const q4b = await state(page);
  c.expect("点「编辑消失点」→ VP 编辑条显（含 ✓）、手柄层显、形状条藏、顶栏无钮亮", q4b.perspBar && q4b.hasPerspDone && q4b.perspHandles && !q4b.shapeBar && q4b.anyToolPressed === 0, JSON.stringify(q4b));
  await evClick(page, "perspDoneBtn"); await page.waitForTimeout(250);
  const q4c = await state(page);
  c.expect("点 ✓ → 回形状笔：VP 编辑条藏、形状条显、形状位亮、透视仍二点", !q4c.perspBar && q4c.shapeBar && q4c.tool === "shapeBrush" && q4c.shapePressed === "true" && q4c.perspSel === "p2", JSON.stringify(q4c));
  await evClick(page, "shapeSub-line"); await page.waitForTimeout(150);
  const q5 = await state(page);
  c.expect("切回 [直线] → 平面钮藏（直线吸 VP 不吃平面）、透视仍二点、格线件藏", q5.shapeSub === "line" && q5.planeBtns === 0 && q5.perspSel === "p2" && q5.hasVpEdit && !q5.hasGridCtl, JSON.stringify(q5));
  await page.evaluate(() => document.getElementById("shapePerspSel").click()); await page.waitForTimeout(150);
  await page.evaluate(() => { const b = [...document.querySelectorAll(".popup-menu--compact [data-id]")].find((x) => x.dataset.id === "off"); b.click(); });
  await page.waitForTimeout(200);
  await evClick(page, "toolShape"); await page.waitForTimeout(250);
  const q6 = await state(page);
  c.expect("已激活再点形状位 → 开共享画笔笔架（#brushRackSheet），仍 shapeBrush", q6.rackSheetVis && q6.tool === "shapeBrush", JSON.stringify(q6));
  await evClick(page, "toolShape"); await page.waitForTimeout(200);   // 再点 = toggle 关笔架
  await page.keyboard.press("b"); await page.waitForTimeout(200);
  const q7 = await state(page);
  c.expect("B → brush、形状条藏、形状位不亮", q7.tool === "brush" && !q7.shapeBar && q7.shapePressed === "false", JSON.stringify(q7));
  await page.keyboard.press("s"); await page.waitForTimeout(200);
  const q8 = await state(page);
  c.expect("S → shapeBrush、形状条显、子工具记住 [直线]", q8.tool === "shapeBrush" && q8.shapeBar && q8.shapeSub === "line", JSON.stringify(q8));
  await evClick(page, "toolLasso"); await page.waitForTimeout(250);
  const q2d = await state(page);
  c.expect("切套索 → 形状条藏、套索条显、左栏滑条仍可见", !q2d.shapeBar && q2d.lassoBar && q2d.sizeSliderVis, JSON.stringify(q2d));
  // ③ B → brush
  await page.keyboard.press("b"); await page.waitForTimeout(200);
  const s3 = await state(page);
  c.expect("B → brush、笔位 #pencil", s3.tool === "brush" && s3.pen === "#pencil", JSON.stringify(s3));
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
  c.expect("点手指位 → filterBrush、滤镜笔条显、第一件 = 子工具下拉（钮面只图标 #finger，2026-09-11 face=icon）、无条标题、无 variant 下拉、行不溢出", s6.tool === "filterBrush" && s6.fbBar && s6.fbSubSel && s6.fbSubIcon === "#finger" && s6.fbSubFace === "icon" && s6.fbSubLabel === "" && !s6.fbTitle && !s6.fbVariantSel && s6.fbRowFits === true, JSON.stringify(s6));
  const dd = await pickSub(page, "blur");
  const s7 = await state(page);
  // 2026-09-09 user「就是手指就行啦」：六项同一个 #finger（像 fx 菜单同图标那样整齐）——钮面/顶栏永远 #finger，名字在下拉 label
  c.expect("下拉 6 项全带（同一个手指）图标；选「模糊」→ 手指位仍 #finger、钮面 #finger、值=blur（钮面无字）、adjust 不亮、无 variant 下拉", dd.total === 6 && dd.withIcon === 6 && s7.tool === "filterBrush" && s7.smudge === "#finger" && s7.fbSubIcon === "#finger" && s7.fbSubValue === "blur" && s7.fbSubLabel === "" && s7.adjustPressed === "false" && !s7.fbVariantSel, JSON.stringify({ dd, s7 }));
  await pickSub(page, "liquify");
  const s8 = await state(page);
  c.expect("选「液化」→ 值=liquify（钮面无字）、有 variant 下拉（pinch/bloat 子工具下拉没盖）", s8.smudge === "#finger" && s8.fbSubValue === "liquify" && s8.fbSubLabel === "" && s8.fbVariantSel, JSON.stringify(s8));
  await pickSub(page, "paint");
  const s9 = await state(page);
  c.expect("选「带颜料的手指」→ 值=paint（钮面无字）、钮面 #finger", s9.fbSubValue === "paint" && s9.fbSubLabel === "" && s9.fbSubIcon === "#finger", JSON.stringify(s9));
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
  await evClick(page, "toolShape"); await page.waitForTimeout(400);
  const sb = await page.evaluate(() => { const h = document.getElementById("shapeToolbar"); const r = h.querySelector(".lasso-toolbar"); const subs = ["line", "rect", "circle", "grid"].filter((s) => { const b = document.getElementById("shapeSub-" + s); return b && !b.hidden && !b.classList.contains("hidden"); }).length; return { scrollW: r.scrollWidth, clientW: r.clientWidth, vis: !h.classList.contains("hidden"), subs }; });
  c.expect("375 宽形状条行不横向溢出、四子工具钉住不折", sb.vis && sb.scrollW <= sb.clientW + 1 && sb.subs === 4, JSON.stringify(sb));
  await ctx.close();
}
await browser.close(); await srv.close();
c.finish(allErrors);
