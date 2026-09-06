// 魔棒「容隙」形态学内核——细部整块归属（created 2026-09-06 by Claude Fable 5.1；spec = ai-docs/20260906-gap-closing-morphological-handoff.md §3/§5）。
// 合成图（40×20，透明底 + 不透明黑墨）：
//   竖墙 x∈{19,20} 全高，y∈[8,10] 留 3px 缺口；左下实心块 x∈[0,17] y∈[14,19]，y=16 留一条 1px 细缝（长 18 = 比 r 长 6 倍的「发梢」）。
//   自由像素 = 左房 19×14=266 + 块右侧竖列 x=18 y14..19 =6 + 细缝 18 + 缺口 6 + 右房 19×20=380 = 676。
// gapPx=6（r=3）：点左房 → 左房 + 竖列 + 整条细缝 + 整个缺口，不进右房；点右房 → 右房 + 缺口；贴线点同结果；
//   种子在细缝深处（口袋 ≤3 步摸不到开阔区）→ 诚实降级普通 flood（全连通 676）；r 大于房半宽 → E 空 → 降级。
import { describe, it, assert, eq } from "./runner.mjs";
const { floodSelectFrom } = await import("../src/lasso.ts");

const W = 40, H = 20;
function scene() {
  const data = new Uint8ClampedArray(W * H * 4);
  const ink = (x, y) => { const o = (y * W + x) * 4; data[o] = 0; data[o + 1] = 0; data[o + 2] = 0; data[o + 3] = 255; };
  for (let y = 0; y < H; y++) if (y < 8 || y > 10) { ink(19, y); ink(20, y); }
  for (let y = 14; y < H; y++) for (let x = 0; x <= 17; x++) if (y !== 16) ink(x, y);
  return { bboxX: 0, bboxY: 0, bboxW: W, bboxH: H, getImageData: () => ({ data }) };
}
const doc = { width: W, height: H };
function maskOf(sel) {
  const g = sel.materializeMaskRegion(0, 0, W, H);
  return (x, y) => g[y * W + x] === 255;
}
function count(sel) { const g = sel.materializeMaskRegion(0, 0, W, H); let n = 0; for (const v of g) if (v === 255) n++; return n; }
const LEFT = 266 + 6 + 18 + 6, RIGHT = 380 + 6, ALL = 676;

describe("容隙 · 形态学开运算 · 细部整块归属", () => {
  it("点左房中央：左房 + 缺口整个 + 细缝到尖端，不进右房", () => {
    const sel = floodSelectFrom(doc, { x: 8, y: 5 }, scene(), 20, "rgb", null, 6);
    assert(sel, "应有选区");
    eq(count(sel), LEFT, "左房 296");
    const m = maskOf(sel);
    assert(m(19, 9) && m(20, 8) && m(20, 10), "缺口 6 格全选（不止到中线）");
    assert(m(0, 16) && m(17, 16), "细缝从口到尖端整条选中");
    assert(!m(21, 9) && !m(30, 5) && !m(22, 0), "右房一格不进");
    sel.dispose();
  });
  it("贴线点（块与墙之间的竖列，种子在细部 T）→ 口袋接种，结果同左房", () => {
    const sel = floodSelectFrom(doc, { x: 18, y: 15 }, scene(), 20, "rgb", null, 6);
    assert(sel); eq(count(sel), LEFT); sel.dispose();
  });
  it("点右房：右房 + 整个缺口，不进左房", () => {
    const sel = floodSelectFrom(doc, { x: 30, y: 5 }, scene(), 20, "rgb", null, 6);
    assert(sel); eq(count(sel), RIGHT);
    const m = maskOf(sel);
    assert(m(19, 9) && m(20, 9), "缺口归先点的一侧");
    assert(!m(18, 9) && !m(8, 5) && !m(5, 16), "左房与细缝不进");
    sel.dispose();
  });
  it("种子在细缝深处（口袋 ≤r 步摸不到开阔区）→ 诚实降级普通 flood（全连通）", () => {
    const sel = floodSelectFrom(doc, { x: 5, y: 16 }, scene(), 20, "rgb", null, 6);
    assert(sel); eq(count(sel), ALL); sel.dispose();
  });
  it("r 大于一切房间半宽（gapPx=60）→ E 空 → 降级普通 flood；gapPx=0 = 普通 flood", () => {
    const a = floodSelectFrom(doc, { x: 8, y: 5 }, scene(), 20, "rgb", null, 60);
    assert(a); eq(count(a), ALL); a.dispose();
    const b = floodSelectFrom(doc, { x: 8, y: 5 }, scene(), 20, "rgb", null, 0);
    assert(b); eq(count(b), ALL); b.dispose();
  });
  it("2048² 全空图容隙 flood 百 ms 级（两次 EDT + flood）", () => {
    const N = 2048;
    const t0 = performance.now();
    const sel = floodSelectFrom({ width: N, height: N }, { x: 100, y: 100 }, null, 20, "rgb", null, 8);
    const ms = performance.now() - t0;
    assert(sel, "应有选区"); sel.dispose();
    assert(ms < 3000, `2048² 应在秒级以内，实测 ${ms.toFixed(0)}ms`);
  }, { timeout: 20000 });
});
