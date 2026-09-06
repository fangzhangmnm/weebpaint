// 渐变映射 / 色带编辑器真浏览器探针（playwright，Chromium；不进 npm test 硬线）。created 2026-09-05 by Claude Fable 5.1
// 用法：bash scripts/build.sh && node tools/probes/gradient-map.mjs
// 契约：画一笔 → 调整菜单「渐变映射」→ 编辑器 2 色标 → ＋ 加色标（3，选中中间）→ 真指针拖色标（t 变、渐变串变）
//   → 切「阶跃」插值（渐变串出现硬边）→ 取前景色（选中色标 = 当前笔色）→ Delete 删 → 应用不炸。
import { chromium } from "playwright";
import { CTX_ZH, startServer, bootPage, makeChecker, evClick, drawStroke } from "../preflight/harness.mjs";

const srv = await startServer();
const browser = await chromium.launch();
const context = await browser.newContext(CTX_ZH);
const c = makeChecker("gradient-map probe");
const { page, errors } = await bootPage(context, srv.url);

await drawStroke(page);
await evClick(page, "topAdjustBtn");
await page.waitForTimeout(200);
await page.evaluate(() => {
  const btn = [...document.querySelectorAll("#adjustFilterList .menu-item")].find((b) => (b.textContent || "").includes("渐变映射"));
  if (!btn) throw new Error("no 渐变映射 menu item: " + [...document.querySelectorAll("#adjustFilterList .menu-item")].map((b) => b.textContent).join("|"));
  btn.click();
});
await page.waitForSelector("#adjustParamsBody .ramp-editor", { timeout: 5000 });

const readState = () => page.evaluate(() => {
  const ed = document.querySelector("#adjustParamsBody .ramp-editor");
  return {
    stopCount: +ed.dataset.stopCount, selected: +ed.dataset.selected,
    stops: [...ed.querySelectorAll(".re-stop")].map((s) => ({ t: +s.dataset.t, rgba: s.dataset.rgba, sel: s.classList.contains("selected") })),
    bg: ed.querySelector(".re-bar").style.background,
    delDisabled: ed.querySelector('.ce-gizmo[data-act="del"]').disabled,
    fgDisabled: ed.querySelector('.ce-btn[data-act="fg"]').disabled,
    fg: (window.__wpState && window.__wpState.color) || null,
  };
});
const s0 = await readState();
c.expect("初始 2 色标（黑→白）", s0.stopCount === 2 && s0.stops[0].rgba === "0,0,0,255" && s0.stops[1].rgba === "255,255,255,255", JSON.stringify(s0.stops));
c.expect("初始无选中：🗑/取前景色置灰", s0.selected === -1 && s0.delDisabled && s0.fgDisabled);
c.expect("渐变串 ≥256 色标（浏览器序列化会把双位置拆成两枚）", (s0.bg.match(/rgb/g) || []).length >= 256, String((s0.bg.match(/rgb/g) || []).length));

await page.evaluate(() => document.querySelector('#adjustParamsBody .ce-gizmo[data-act="add"]').click());
const s1 = await readState();
c.expect("＋ 后 3 色标选中中间，色 = 中灰", s1.stopCount === 3 && s1.selected === 1 && s1.stops[1].rgba === "128,128,128,255", JSON.stringify(s1.stops));

// 真指针拖中间色标向右 60px
const box = await page.locator("#adjustParamsBody .re-stop.selected").boundingBox();
const bar = await page.locator("#adjustParamsBody .re-bar").boundingBox();
const sx = box.x + box.width / 2, sy = box.y + box.height / 2;
await page.mouse.move(sx, sy); await page.mouse.down();
for (let i = 1; i <= 6; i++) await page.mouse.move(sx + 10 * i, sy);
await page.mouse.up();
await page.waitForTimeout(100);
const s2 = await readState();
const expectT = 0.5 + 60 / bar.width;
c.expect("拖后 t ≈ 0.5 + 60/条宽", Math.abs(s2.stops[1].t - expectT) < 0.02, `${s2.stops[1].t} vs ${expectT}`);
c.expect("渐变串变了", s2.bg !== s1.bg);

// 切阶跃：硬边——相邻两段颜色相同的段数应远多于线性（线性 256 段几乎全不同）
await page.evaluate(() => [...document.querySelectorAll("#adjustParamsBody .ce-select-slot .select-field")][0].click());
await page.waitForTimeout(150);
await page.evaluate(() => {
  const items = [...document.querySelectorAll(".popup-menu-item, [role=menuitem]")];
  const it = items.find((b) => (b.textContent || "").includes("阶跃"));
  if (!it) throw new Error("no 阶跃 item: " + items.map((b) => b.textContent).join("|"));
  it.click();
});
await page.waitForTimeout(100);
const s3 = await readState();
const cols = [...s3.bg.matchAll(/rgba?\([^)]*\)/g)].map((m) => m[0]);
const distinct = new Set(cols).size;
c.expect("阶跃后渐变只有 3 种颜色", distinct === 3, String(distinct));

// 取前景色：选中色标 = 当前笔色（headless 默认笔色非中灰即可自证）
await page.evaluate(() => document.querySelector('#adjustParamsBody .ce-btn[data-act="fg"]').click());
const s4 = await readState();
c.expect("取前景色后选中色标颜色变（不再是中灰）", s4.stops[1].rgba !== "128,128,128,255", JSON.stringify(s4.stops[1]));

await page.evaluate(() => document.querySelector("#adjustParamsBody .ramp-editor").focus());
await page.keyboard.press("Delete");
const s5 = await readState();
c.expect("Delete 删色标 → 2", s5.stopCount === 2, JSON.stringify(s5));

await evClick(page, "adjustApply");
await page.waitForTimeout(300);
const closed = await page.evaluate(() => getComputedStyle(document.getElementById("adjustPanel")).display === "none");
c.expect("应用后面板关", closed === true);

await browser.close(); await srv.close();
c.finish(errors);
