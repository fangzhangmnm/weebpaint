// created 2026-08-28 by Claude Opus 5 (subagent)
// 录制窗 z-order 接线（user 2026-08-23 组会：「录制窗口会被图层面板等浮窗遮挡，没有自动排序」）。
// 钉的是**接线**不是 surfaces 本身：tlPanel 必须活在 surfaces 的 window band 栈里——
//   ① 开窗即置顶（菜单「过程录像」/ 红点 chip → _openPanel 调 raiseWindow）
//   ② 点窗即置顶（registerWindow/raiseWindow 挂的 capture pointerdown）
// 回归风险：以后有人新写 open 路径忘了 raise → 录制窗又被图层面板压住。
//
// 为什么用**动态 import**（同 app-boot.test.mjs）：timelapse-ui 的依赖链拉到 app-store.ts，
// 它 module-eval 就 setGalleryLayerLive(false) —— top-level import 会在**所有测试之前**污染
// app-prefs 的 gallery scope 用例。故整链只在本测试跑到时才求值；run.mjs 里也排在 app-boot 之后。
import { describe, it, assert } from "./runner.mjs";

const z = (el) => parseInt(el.style.zIndex, 10);
const fire = (el, type) => { for (const fn of el._listeners.get(type) ?? []) fn({ type, target: el }); };

// 现场：图层面板已开着压在录制窗上面。**只摆图层面板**——录制窗自己进不进栈、挂不挂
// pointerdown，全靠 app 侧接线（transient-panels 注册 + _openPanel 的 raise），测试不代劳。
async function stage() {
  const { raiseWindow, registerWindow } = await import("../src/surfaces.ts");
  const { els } = await import("../src/els.ts");
  const layers = document.getElementById("layersPanel");
  registerWindow(layers);
  raiseWindow(layers);
  return { els, layers };
}

describe("timelapse 录制窗 · z-order 接线（2026-08-23 user 反馈）", () => {
  it("开窗即置顶：点菜单「过程录像」→ 录制窗压过图层面板", async () => {
    const { els, layers } = await stage();
    const { initTimelapseUi } = await import("../src/timelapse-ui.ts");
    assert(!(z(els.tlPanel) > z(layers)), "前提：图层面板此刻在上面（录制窗没接线时连 z 都没有）");
    initTimelapseUi(() => "z-order-test");
    fire(els.menuTimelapse, "click");
    assert(!els.tlPanel.classList.contains("hidden"), "面板已打开");
    assert(z(els.tlPanel) > z(layers), `开窗后录制窗该在最上面（tl=${z(els.tlPanel)} layers=${z(layers)}）`);
  });

  it("点窗即置顶：点回图层面板再点录制窗 → 录制窗回到最上面", async () => {
    const { els, layers } = await stage();
    assert(z(layers) > z(els.tlPanel), "点图层面板 → 它到顶");
    fire(els.tlPanel, "pointerdown");
    assert(z(els.tlPanel) > z(layers), "点录制窗 → 它回到顶（capture pointerdown 已挂上）");
  });
});
