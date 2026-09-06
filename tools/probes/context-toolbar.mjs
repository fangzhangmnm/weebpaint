// 上下文工具条深模块真浏览器探针（playwright，Chromium；不进 npm test 硬线）。created 2026-09-06 by Claude Fable 5.1（UI 抽象轮 U1）
// 用法：bash scripts/build.sh && node tools/probes/context-toolbar.mjs
// 契约：① 手指（filterBrush）条由工厂生成，与套索/形状条同 y/同高（不再是 .crop-toolbar 的 y=56/h=44）；
//   ② 桌面宽度全项可见、无「…」；③ 375 宽（SE2）时行不横向溢出，尾项折进「…」，点「…」出菜单含被折项；
//   ④ 变体/mix 下拉与「揉匀」旋钮仍在（折进菜单也算在）；✓ 退出后条隐藏。
import { chromium } from "playwright";
import { CTX_ZH, startServer, bootPage, makeChecker, evClick, drawStroke } from "../preflight/harness.mjs";

const srv = await startServer();
const browser = await chromium.launch();
const c = makeChecker("context-toolbar probe");
const allErrors = [];

const measure = (page) => page.evaluate(() => {
  const q = (s) => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height), hidden: e.classList.contains("hidden") }; };
  const row = document.querySelector("#filterBrushToolbar .lasso-toolbar");
  return {
    fb: q("#filterBrushToolbar"), row: row ? { scrollW: row.scrollWidth, clientW: row.clientWidth } : null,
    more: !!document.querySelector("#filterBrushToolbar .ct-more"),
    hiddenItems: [...document.querySelectorAll("#filterBrushToolbar .lasso-toolbar > *")].filter((e) => e.hidden).map((e) => e.id || e.className.split(" ")[0]),
    ids: [...document.querySelectorAll("#filterBrushToolbar [id]")].map((e) => e.id),
    vw: innerWidth,
  };
});

// ---- 桌面 ----
{
  const ctx = await browser.newContext({ ...CTX_ZH, viewport: { width: 1200, height: 800 } });
  const { page, errors } = await bootPage(ctx, srv.url);
  allErrors.push(...errors);
  await drawStroke(page);
  // 参照：套索条位置
  await evClick(page, "toolLasso"); await page.waitForTimeout(200);
  const lasso = await page.evaluate(() => { const r = document.getElementById("lassoToolbarStack").getBoundingClientRect(); return { y: Math.round(r.top), h: Math.round(r.height) }; });
  await evClick(page, "toolSmudge"); await page.waitForTimeout(300);
  const m = await measure(page);
  c.expect("手指条可见且由工厂生成（.ct-toolbar）", m.fb && !m.fb.hidden && (await page.evaluate(() => document.getElementById("filterBrushToolbar").classList.contains("ct-toolbar"))), JSON.stringify(m.fb));
  c.expect("手指条 y 与套索条同位（±2）", m.fb && Math.abs(m.fb.y - lasso.y) <= 2, `fb.y=${m.fb?.y} lasso.y=${lasso.y}`);
  c.expect("手指条高与套索条同高（±4）", m.fb && Math.abs(m.fb.h - lasso.h) <= 4, `fb.h=${m.fb?.h} lasso.h=${lasso.h}`);
  c.expect("桌面无「…」、无折叠项", !m.more && m.hiddenItems.length === 0, JSON.stringify(m));
  c.expect("variant/mix 下拉 + 揉匀旋钮 + 笔架 + ✓ 都在", ["filterBrushVariantSel", "filterBrushMixSel", "filterBrushSlider-dull", "filterBrushOpenRack", "filterBrushExit"].every((id) => m.ids.includes(id)), m.ids.join(","));
  // ✓ 退出 → 条隐藏、回画笔
  await page.evaluate(() => document.getElementById("filterBrushExit").click());
  await page.waitForTimeout(200);
  const after = await measure(page);
  c.expect("✓ 后手指条隐藏", after.fb && after.fb.hidden === true, JSON.stringify(after.fb));
  await ctx.close();
}
// ---- SE2 375 ----
{
  const ctx = await browser.newContext({ ...CTX_ZH, viewport: { width: 375, height: 667 }, isMobile: true, hasTouch: true });
  const { page, errors } = await bootPage(ctx, srv.url);
  allErrors.push(...errors);
  await drawStroke(page, { dx: 80 });
  await evClick(page, "toolSmudge"); await page.waitForTimeout(400);
  const m = await measure(page);
  c.expect("375 宽：行不横向溢出（scrollW ≤ clientW+1）", m.row && m.row.scrollW <= m.row.clientW + 1, JSON.stringify(m.row));
  c.expect("375 宽：出现「…」且有折叠项", m.more && m.hiddenItems.length >= 1, JSON.stringify(m));
  c.expect("条仍在视口内", m.fb && m.fb.x >= 0 && m.fb.x + m.fb.w <= m.vw, JSON.stringify(m.fb));
  // 点「…」→ 菜单含被折项（按 label 计数 ≥ 折叠项数）
  await page.evaluate(() => document.querySelector("#filterBrushToolbar .ct-more").click());
  await page.waitForTimeout(200);
  const menuCount = await page.evaluate(() => document.querySelectorAll(".popup-menu-item, [role=menuitem]").length);
  c.expect("「…」菜单出项", menuCount >= m.hiddenItems.length, `menu=${menuCount} folded=${m.hiddenItems.length}`);
  await ctx.close();
}
await browser.close(); await srv.close();
c.finish(allErrors);
