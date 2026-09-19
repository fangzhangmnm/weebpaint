// charter H7 转绿（S8 液化 doc-space mask 重写）：
//   旧病灶 = selection mask 在 beginStroke 按 layer.bbox 烤死平面，layer.bbox 外一律「选区外」
//   → 内容被推出旧 bbox 的那半不液化（半拉）。S8 起 mask 是 doc-space 平面（随 dispField 增长，
//   平面外直查 selection tile）→ 判定与 layer.bbox 彻底解耦。
// 引擎在 node 全跑真像素：mock layer（doc 尺寸 RGBA 缓冲）+ 真 Selection（gray8 tile）+
//   dom-shim 的最小 ImageData。
import { describe, it, assert, eq } from "./runner.mjs";
const { LiquifyEngine } = await import("../src/plugins/liquify-engine.ts");
const { Selection } = await import("../src/backend/selection.ts");

// 写靶 = GPU RegionStroke（2026-09-19 液化搬区域程序）：gpuLayer(snapshot) + 真 Selection（open 时物化成 r8 平面）。
import { gpuLayer } from "./region-target.mjs";
function mockLayer(docW, docH) { return gpuLayer(docW, docH, { snapshot: true }); }
// 一笔：open(sel) → begin/extend → end → close（W 读回 buf，L.px 可读）
function stroke(L, sel, settings, pts) {
  const rs = L.open(sel);
  const eng = new LiquifyEngine();
  eng.beginStroke([rs], settings, pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) eng.extendStroke(pts[i][0], pts[i][1]);
  eng.endStroke();
  L.close(rs);
}

// 矩形选区（gray8 全 255）。
function rectSelection(x, y, w, h) {
  const d = new Uint8Array(w * h).fill(255);
  return Selection.fromGray8Region(x, y, w, h, d);
}

describe("liquify · doc-space mask（charter H7 转绿）", () => {
  it("选区判定是 doc 空间：把内容推出旧 layer.bbox，越界那半照常液化（不再『半拉』）", () => {
    const L = mockLayer(128, 128);
    L.fill(10, 10, 30, 30, [220, 30, 30, 255]);          // 红内容，layer.bbox=(10,10,30,30)
    const sel = rectSelection(0, 0, 100, 100);            // 选区盖住 bbox 外一大片
    stroke(L, sel, { size: 40, strength: 1, mode: "push", bleed: "edge" }, [[35, 25], [70, 25]]);   // 往右推：内容应落到旧 bbox(右缘 40) 之外
    // dest(50,25)：旧码在 layer.bbox 外 → 误判选区外 → 保原（透明）。新码：doc-space 在选区内 → 液化。
    const [r, , , a] = L.px(50, 25);
    assert(a > 200, `旧 bbox 外的 dest 应收到被推来的内容（alpha=${a}）`);
    assert(r > 150, `推来的是红内容（r=${r}）`);
    sel.dispose();
  });

  it("选区仍然约束：footprint 内但选区外的 dest 不动", () => {
    const L = mockLayer(128, 128);
    L.fill(10, 10, 30, 30, [220, 30, 30, 255]);
    const sel = rectSelection(0, 0, 60, 50);              // 选区只到 x<60
    stroke(L, sel, { size: 40, strength: 1, mode: "push", bleed: "edge" }, [[35, 25], [70, 25]]);
    assert(L.px(50, 25)[3] > 200, "选区内（x=50）液化生效");
    eq(L.px(65, 25)[3], 0, "选区外（x=65）保持原样（原本透明），即使 footprint 覆盖且源头有内容");
    sel.dispose();
  });

  it("bleed 三模式在 doc-space mask 下语义不变（import 拉外部 / clip 设墙 / edge 整数 cell march）", () => {
    // 布局：选区 (8,8,16,16)。绿 x∈[8,23)，蓝边界列 x=23，红 x∈[24,40)（选区外）。
    const mk = (bleed) => {
      const L = mockLayer(64, 64);
      L.fill(8, 8, 15, 16, [30, 200, 30, 255]);     // 绿
      L.fill(23, 8, 1, 16, [30, 30, 220, 255]);     // 蓝（选区内最后一列）
      L.fill(24, 8, 16, 16, [220, 30, 30, 255]);    // 红（选区外）
      const sel = rectSelection(8, 8, 16, 16);
      stroke(L, sel, { size: 12, strength: 1, mode: "push", bleed }, [[30, 16], [14, 16]]);   // 往左推：dest(16,16) 的位移源落到选区外的红区
      const p = L.px(16, 16);
      sel.dispose();
      return p;
    };
    const imp = mk("import");
    assert(imp[0] > 150 && imp[1] < 120, `import 应把外部红拉进来（got rgb=${imp.slice(0, 3)}）`);
    const clip = mk("clip");
    assert(clip[1] > 150 && clip[0] < 120 && clip[2] < 120, `clip 应保 dest 原绿（got rgb=${clip.slice(0, 3)}）`);
    const edge = mk("edge");
    assert(edge[2] > 150 && edge[0] < 120, `edge 应采选区边界整数 cell（蓝列）（got rgb=${edge.slice(0, 3)}）`);
  });

  it("mask 平面外的源查询回落 selection tile（不再把『平面外』当『选区外』）", () => {
    // 全 doc 选区；内容红 (30,30,20,20)；把 dest(38,40) 的源推到平面外的透明选中区 (≈12,40)。
    // 旧语义（平面外=false）会 edge-march 到平面左缘采到红；doc-space 正解 = 源透明 → dest 透明。
    const L = mockLayer(64, 64);
    L.fill(30, 30, 20, 20, [220, 30, 30, 255]);
    const sel = rectSelection(0, 0, 64, 64);
    stroke(L, sel, { size: 6, strength: 1, mode: "push", bleed: "edge" }, [[12, 40], [40, 40]]);
    eq(L.px(38, 40)[3], 0, "源在平面外但在选区内且透明 → dest 透明（不应误走 edge-march 采到红）");
    sel.dispose();
  });
});
