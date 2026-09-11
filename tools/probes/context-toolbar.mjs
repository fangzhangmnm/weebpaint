// 上下文工具条深模块真浏览器探针（playwright，Chromium；不进 npm test 硬线）。created 2026-09-06 by Claude Fable 5.1（UI 抽象轮 U1）
// 用法：bash scripts/build.sh && node tools/probes/context-toolbar.mjs
// 契约：① 手指（filterBrush）条由工厂生成，与套索条同 y/同高（不再是 .crop-toolbar 的 y=56/h=44；形状条 2026-09-09 退役）；
//   ② 桌面宽度全项可见、无「…」；③ 375 宽（SE2）时行不横向溢出，尾项折进「…」，点「…」出菜单含被折项；
//   ④ 变体/mix 下拉与「揉匀」旋钮仍在（折进菜单也算在）；✓ 退出后条隐藏。
//   2026-09-11（user 真机反馈批）：⑤ 子工具下拉只画图标（face=icon）、mix 下拉定宽 84 画缩写、角标 = 角落小三角（无 chevron）；
//   ⑥ en 语言下 mix 下拉仍 84 宽（英文不撑条）、行不溢出；⑦ 换 context 扫（笔/手指/套索/橡皮来回）：任何可见条无空行、
//   top 不被谁顶下去（无「空出一大堆白」）、同时可见 ≤ 1 条；⑧ 图层调整弹层：点 badge 弹出（混合模式钮面有字 = 「文字不显示」回归钉）、
//   外点关、换活动层自动关；⑨ 参考窗：主菜单项 toggle（开/关态）、窗右上角 × 在 ＋ 右边、点 × 关窗。
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
    title: !!document.querySelector("#filterBrushToolbar .ct-title"),
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
  // 2026-09-06 晚 ADR-0012 修订 ③：variant 下拉退役（手指三 variant 全在子工具栏）；2026-09-09 修订 ④：子工具栏 = 带图标下拉 filterBrushSubSel
  c.expect("子工具下拉 + mix 下拉 + 揉匀旋钮 + 笔架 + ✓ 都在、无 variant 下拉、无条标题", ["filterBrushSubSel", "filterBrushMixSel", "filterBrushSlider-dull", "filterBrushOpenRack", "filterBrushExit"].every((id) => m.ids.includes(id)) && !m.ids.includes("filterBrushVariantSel") && !m.title, m.ids.join(","));
  // ⑤ 钮面三档 + 角标（2026-09-11）
  const faces = await page.evaluate(() => {
    const sub = document.getElementById("filterBrushSubSel"), mix = document.getElementById("filterBrushMixSel");
    const w = (el) => Math.round(el.getBoundingClientRect().width);
    return {
      subFace: sub?.dataset.face, subLabel: sub?.querySelector(".select-field-label")?.textContent, subIcon: !!sub?.querySelector(".select-field-icon use"),
      subCaret: !!sub?.querySelector(".select-field-caret svg path"), chevron: !!document.querySelector(".select-field .menu-inline-caret, .select-field use[href='#chevron-down']"),
      mixFace: mix?.dataset.face, mixW: mix ? w(mix) : null, mixLabel: mix?.querySelector(".select-field-label")?.textContent,
      fixedW: parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--select-fixed-w")) || null,
    };
  });
  c.expect("子工具下拉只画图标（face=icon、label 空、有图标、角落小三角、无 chevron）", faces.subFace === "icon" && faces.subLabel === "" && faces.subIcon && faces.subCaret && !faces.chevron, JSON.stringify(faces));
  c.expect("mix 下拉定宽 = --select-fixed-w、钮面画缩写「直接」", faces.mixFace === "short" && faces.fixedW && Math.abs(faces.mixW - faces.fixedW) <= 1 && faces.mixLabel === "直接", JSON.stringify(faces));
  // ✓ 退出 → 条隐藏、回画笔
  await page.evaluate(() => document.getElementById("filterBrushExit").click());
  await page.waitForTimeout(200);
  const after = await measure(page);
  c.expect("✓ 后手指条隐藏", after.fb && after.fb.hidden === true, JSON.stringify(after.fb));

  // ⑦ 换 context 扫：可见条无空行、top 归 CSS（无叠放残留）、同时可见 ≤ 1（今天各条按 EditMode 互斥）
  const sweep = async () => page.evaluate(() => {
    const bars = [...document.querySelectorAll(".lasso-toolbar-stack")].filter((b) => !b.classList.contains("hidden") && b.getBoundingClientRect().height > 0);
    return bars.map((b) => ({
      id: b.id, top: Math.round(b.getBoundingClientRect().top), styleTop: b.style.top,
      emptyRows: [...b.querySelectorAll(".lasso-toolbar")].filter((r) => !r.hidden && getComputedStyle(r).display !== "none" && ![...r.children].some((k) => k.offsetWidth > 0)).length,
      overflow: [...b.querySelectorAll(".lasso-toolbar")].some((r) => r.scrollWidth > r.clientWidth + 1),
    }));
  });
  const bad = [];
  for (const id of ["toolLasso", "toolPen", "toolSmudge", "toolEraser", "toolLasso", "toolSmudge", "toolPen"]) {
    await evClick(page, id); await page.waitForTimeout(250);
    const bars = await sweep();
    if (bars.length > 1) bad.push(`${id}: ${bars.length} bars visible`);
    for (const b of bars) {
      if (b.emptyRows) bad.push(`${id}: #${b.id} has ${b.emptyRows} empty row(s)`);
      if (b.styleTop) bad.push(`${id}: #${b.id} style.top=${b.styleTop}（单条可见不该被叠放顶下去）`);
      if (Math.abs(b.top - lasso.y) > 2) bad.push(`${id}: #${b.id} top=${b.top} ≠ ${lasso.y}`);
      if (b.overflow) bad.push(`${id}: #${b.id} row overflows at 1200`);
    }
  }
  c.expect("换 context 扫：无空行 / 无叠放残留 / 同位 / 不溢出", bad.length === 0, bad.join("; "));

  // ⑧ 图层调整弹层（user「换 layer 的时候就自动关掉……和菜单一样会自动关」；混合模式「文字不显示」回归钉）
  await evClick(page, "toolPen");
  await page.evaluate(() => window.dispatchEvent(new CustomEvent("wp:toggleLayers"))); await page.waitForTimeout(300);
  const clickBadge = () => page.evaluate(() => { const b = document.querySelector(".layer-row.active .layer-mode-badge"); if (!b) throw new Error("no active badge"); b.click(); });
  const adj = () => page.evaluate(() => {
    const p = document.querySelector(".layer-adjust-popup");
    if (!p || p.classList.contains("hidden") || p.getBoundingClientRect().height === 0) return { open: false };
    const sel = p.querySelector(".layer-mode-select");
    return { open: true, modeText: sel?.querySelector(".select-field-label")?.textContent, modeW: sel ? Math.round(sel.getBoundingClientRect().width) : null, face: sel?.dataset.face, hasRange: !!p.querySelector("input[type=range]") };
  });
  await clickBadge(); await page.waitForTimeout(300);
  const a1 = await adj();
  c.expect("点 badge → 调整弹层开：混合模式钮面有字「正常」、定宽、有透明度滑条", a1.open && a1.modeText === "正常" && a1.face === "short" && a1.modeW && Math.abs(a1.modeW - faces.fixedW) <= 1 && a1.hasRange, JSON.stringify(a1));
  await page.evaluate(() => document.body.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, composed: true }))); await page.waitForTimeout(200);
  const a2 = await adj();
  c.expect("外点 → 弹层关", !a2.open, JSON.stringify(a2));
  // 再开 → 换活动层（点另一行）→ 自动关
  await page.evaluate(() => document.getElementById("layerAddBtn").click()); await page.waitForTimeout(150);
  await page.evaluate(() => document.getElementById("layerAddNewBtn").click()); await page.waitForTimeout(300);
  await clickBadge(); await page.waitForTimeout(300);
  const a3 = await adj();
  c.expect("新层上再开弹层", a3.open && a3.modeText === "正常", JSON.stringify(a3));
  await page.evaluate(() => { const r = document.querySelector(".layer-row:not(.active)"); if (!r) throw new Error("no other row"); r.click(); }); await page.waitForTimeout(300);
  const a4 = await adj();
  c.expect("换活动层 → 弹层自动关", !a4.open, JSON.stringify(a4));

  // ⑨ 参考窗：主菜单 toggle + 窗上 ×
  const refState = () => page.evaluate(() => {
    const w = document.getElementById("referencePanel"), m = document.getElementById("menuReference");
    const plus = w?.shadowRoot?.querySelector(".plus"), close = w?.shadowRoot?.querySelector(".close");
    return { open: w?.hasAttribute("open"), pressed: m?.getAttribute("aria-pressed"), state: document.getElementById("menuReferenceState")?.textContent,
      hasClose: !!close, closeRightOfPlus: !!(plus && close) && close.getBoundingClientRect().left > plus.getBoundingClientRect().left,
      menuHasClose: [...document.querySelectorAll(".popup-menu [data-id]")].some((b) => b.dataset.id === "close") };
  });
  const menuRef = async () => { await evClick(page, "menuButton"); await page.waitForTimeout(150); await evClick(page, "menuReference"); await page.waitForTimeout(250); };
  await menuRef();
  const r1 = await refState();
  c.expect("主菜单「参考小窗」→ 开：窗 open、菜单项 pressed + 状态「开」、× 在 ＋ 右边", r1.open && r1.pressed === "true" && r1.state === "开" && r1.hasClose && r1.closeRightOfPlus, JSON.stringify(r1));
  await menuRef();
  const r2 = await refState();
  c.expect("再点主菜单项 → 关（toggle）", !r2.open && r2.pressed === "false" && r2.state === "关", JSON.stringify(r2));
  await menuRef();
  await page.evaluate(() => document.getElementById("referencePanel").shadowRoot.querySelector(".close").click()); await page.waitForTimeout(200);
  const r3 = await refState();
  c.expect("点窗上 × → 关，主菜单态同步「关」", !r3.open && r3.pressed === "false" && r3.state === "关", JSON.stringify(r3));
  await menuRef();
  await page.evaluate(() => document.getElementById("referencePanel").shadowRoot.querySelector(".plus").click()); await page.waitForTimeout(200);
  const r4 = await refState();
  c.expect("＋ 菜单里不再有「关闭」项（已提出成 ×）", r4.open && !r4.menuHasClose, JSON.stringify(r4));
  await ctx.close();
}
// ---- 桌面 en：英文不撑条（user「遇到英文会被撑的很宽」）----
{
  const ctx = await browser.newContext({ locale: "en-US", viewport: { width: 1200, height: 800 } });
  const { page, errors } = await bootPage(ctx, srv.url);
  allErrors.push(...errors);
  await drawStroke(page);
  await evClick(page, "toolSmudge"); await page.waitForTimeout(300);
  const en = await page.evaluate(() => {
    const mix = document.getElementById("filterBrushMixSel"), row = document.querySelector("#filterBrushToolbar .lasso-toolbar");
    return { lang: document.documentElement.lang, mixW: mix ? Math.round(mix.getBoundingClientRect().width) : null, mixLabel: mix?.querySelector(".select-field-label")?.textContent,
      fixedW: parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--select-fixed-w")) || null,
      fits: row ? row.scrollWidth <= row.clientWidth + 1 : null, more: !!document.querySelector("#filterBrushToolbar .ct-more") };
  });
  c.expect("en：mix 下拉仍定宽、钮面缩写「Plain」、行不溢出无「…」", en.fixedW && en.mixW != null && Math.abs(en.mixW - en.fixedW) <= 1 && en.mixLabel === "Plain" && en.fits && !en.more, JSON.stringify(en));
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
