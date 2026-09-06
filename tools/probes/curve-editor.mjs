// 曲线编辑器真浏览器探针（playwright，Chromium；不进 npm test 硬线）。created 2026-09-05 by Claude Fable 5.1
// 用法：bash scripts/build.sh && node tools/probes/curve-editor.mjs
// 契约：画一笔 → 调整菜单「曲线」→ 面板出编辑器（2 个端点键）→ ＋ 加点（3 键，选中中点）→ 真指针拖中点向上
//   （键位置变、曲线 path 变）→ 拖 out 把手（outMode 变 free）→ 切换 R 通道（编辑器换曲线，键回 2）→ 应用不炸。
import { chromium } from "playwright";
import { CTX_ZH, startServer, bootPage, makeChecker, evClick, drawStroke } from "../preflight/harness.mjs";

const srv = await startServer();
const browser = await chromium.launch();
const context = await browser.newContext(CTX_ZH);
const c = makeChecker("curve-editor probe");
const { page, errors } = await bootPage(context, srv.url);

await drawStroke(page);   // 活层非空（滤镜面板要求 bbox > 0）
await evClick(page, "topAdjustBtn");
await page.waitForTimeout(200);
await page.evaluate(() => {
  const btn = [...document.querySelectorAll("#adjustFilterList .menu-item")].find((b) => (b.textContent || "").includes("曲线"));
  if (!btn) throw new Error("no 曲线 menu item: " + [...document.querySelectorAll("#adjustFilterList .menu-item")].map((b) => b.textContent).join("|"));
  btn.click();
});
await page.waitForSelector("#adjustParamsBody .curve-editor", { timeout: 5000 });

const readState = () => page.evaluate(() => {
  const ed = document.querySelector("#adjustParamsBody .curve-editor");
  const keys = [...ed.querySelectorAll(".ce-key")].map((k) => ({ t: +k.dataset.t, v: +k.dataset.v, inMode: k.dataset.inMode, outMode: k.dataset.outMode, weighted: k.dataset.weighted, outWeight: k.dataset.outWeight, sel: k.classList.contains("selected") }));
  return {
    keyCount: +ed.dataset.keyCount, selected: +ed.dataset.selected, keys,
    d: ed.querySelector(".ce-curve").getAttribute("d"),
    knobOutHidden: ed.querySelector('.ce-knob[data-side="out"]').hidden,
    delDisabled: ed.querySelector('.ce-gizmo[data-act="del"]').disabled,
    tabs: [...document.querySelectorAll("#adjustParamsBody .curves-tab")].map((b) => b.getAttribute("aria-pressed")),
  };
});
const s0 = await readState();
c.expect("初始 2 端点键", s0.keyCount === 2, JSON.stringify(s0.keys));
c.expect("初始无选中，🗑 置灰", s0.selected === -1 && s0.delDisabled === true);

// ＋ 加点
await page.evaluate(() => document.querySelector('#adjustParamsBody .ce-gizmo[data-act="add"]').click());
const s1 = await readState();
c.expect("＋ 后 3 键且选中中点", s1.keyCount === 3 && s1.selected === 1, JSON.stringify(s1));
c.expect("中点 t=0.5 落在恒等线上", Math.abs(s1.keys[1].t - 0.5) < 1e-3 && Math.abs(s1.keys[1].v - 0.5) < 1e-3, JSON.stringify(s1.keys[1]));
c.expect("选中后 out 把手露出", s1.knobOutHidden === false);
c.expect("中点可删", s1.delDisabled === false);

// 真指针拖中点向上 60px
const keyBox = await page.locator("#adjustParamsBody .ce-key.selected").boundingBox();
const kx = keyBox.x + keyBox.width / 2, ky = keyBox.y + keyBox.height / 2;
await page.mouse.move(kx, ky);
await page.mouse.down();
for (let i = 1; i <= 6; i++) await page.mouse.move(kx, ky - 10 * i);
await page.mouse.up();
await page.waitForTimeout(100);
const s2 = await readState();
c.expect("拖后中点 v 上升（t 不变）", s2.keys[1].v > 0.6 && Math.abs(s2.keys[1].t - 0.5) < 0.02, JSON.stringify(s2.keys[1]));
c.expect("曲线 path 变了", s2.d !== s1.d);
c.expect("端点未动", s2.keys[0].t === 0 && s2.keys[2].t === 1, JSON.stringify(s2.keys));

// 拖 out 把手 → free
const knob = await page.locator('#adjustParamsBody .ce-knob[data-side="out"]').boundingBox();
c.expect("out 把手有几何", !!knob && knob.width > 0);
if (knob) {
  const nx = knob.x + knob.width / 2, ny = knob.y + knob.height / 2;
  await page.mouse.move(nx, ny);
  await page.mouse.down();
  await page.mouse.move(nx + 10, ny - 25);
  await page.mouse.move(nx + 20, ny - 40);
  await page.mouse.up();
  await page.waitForTimeout(100);
}
const s3 = await readState();
c.expect("拖把手后 outMode=free（非 broken 镜像 in 也 free）", s3.keys[1].outMode === "free" && s3.keys[1].inMode === "free", JSON.stringify(s3.keys[1]));
c.expect("把手改斜率 → path 再变", s3.d !== s2.d);

// 加权切线（2026-09-06）：点「加权」→ 键 data-weighted=true、outWeight=1/3；再把 out 把手拉远 → outWeight 变大（把手长度 = 权重）
await page.evaluate(() => [...document.querySelectorAll("#adjustParamsBody .ce-btn")].find((b) => (b.textContent || "").trim() === "加权").click());
await page.waitForTimeout(100);
const sw0 = await readState();
c.expect("加权开：键 weighted=true，outWeight=0.333", sw0.keys[1] && sw0.keys[1].weighted === "true" && Math.abs(+sw0.keys[1].outWeight - 1 / 3) < 1e-3, JSON.stringify(sw0.keys[1]));
{
  const kb = await page.locator("#adjustParamsBody .ce-key.selected").boundingBox();
  const kn = await page.locator('#adjustParamsBody .ce-knob[data-side="out"]').boundingBox();
  const cx = kb.x + kb.width / 2, cy = kb.y + kb.height / 2;
  const nx = kn.x + kn.width / 2, ny = kn.y + kn.height / 2;
  // 沿键→钮方向再拉 1.6 倍
  await page.mouse.move(nx, ny); await page.mouse.down();
  await page.mouse.move(cx + (nx - cx) * 1.3, cy + (ny - cy) * 1.3);
  await page.mouse.move(cx + (nx - cx) * 1.6, cy + (ny - cy) * 1.6);
  await page.mouse.up();
  await page.waitForTimeout(100);
}
const sw1 = await readState();
c.expect("拉长把手 → outWeight 变大", sw1.keys[1] && +sw1.keys[1].outWeight > 0.4, JSON.stringify(sw1.keys[1]));
c.expect("拉长后 path 再变", sw1.d !== sw0.d);

// 键盘 Delete 删中点
await page.evaluate(() => document.querySelector("#adjustParamsBody .curve-editor").focus());
await page.keyboard.press("Delete");
const s4 = await readState();
c.expect("Delete 删中点 → 2 键", s4.keyCount === 2, JSON.stringify(s4));

// 切 R 通道：编辑器换曲线（恒等 2 键），tab 状态跟着走
await page.evaluate(() => [...document.querySelectorAll("#adjustParamsBody .curves-tab")].find((b) => b.dataset.ch === "r").click());
const s5 = await readState();
c.expect("R 通道 tab 高亮", s5.tabs[1] === "true" && s5.tabs[0] === "false", JSON.stringify(s5.tabs));
c.expect("R 通道恒等 2 键", s5.keyCount === 2);

// 应用不炸
await evClick(page, "adjustApply");
await page.waitForTimeout(300);
const closed = await page.evaluate(() => document.getElementById("adjustPanel").classList.contains("hidden") || document.getElementById("adjustPanel").hidden || getComputedStyle(document.getElementById("adjustPanel")).display === "none");
c.expect("应用后面板关", closed === true);

await browser.close(); await srv.close();
c.finish(errors);
