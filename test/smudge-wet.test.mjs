// 湿画笔补全契约测（created 2026-09-06 by Claude Fable 5.1；spec = ai-docs/20260906-wet-brush-completion-handoff.md §6，clean-room 只读 handoff）。
// 问题陈述：输入 = RGBA 图 + 一条笔画（点列 + 压感）+ paint 模式设置（dilution / memoryLength / colorRate）；输出 = 改写后的图。
//   钉：稀释（透明处画不上、半透明按比例、d=0 与现状逐字节一致）；压感反向（s_p=0 不掺笔色）；多分辨率中段（单调过渡、不发黑）；
//   记忆解耦（paint + 短记忆走一个直径后不再带起点色；smear 记忆律不变）；premult 红线（透明像素 RGB 不进平均）。
import { describe, it, assert, eq } from "./runner.mjs";
import { SmudgeEngine } from "../src/plugins/smudge-engine.ts";

function mockLayer(docW, docH) {
  const buf = new Uint8ClampedArray(docW * docH * 4);
  return {
    docW, docH, buf,
    fill(x, y, w, h, [r, g, b, a]) { for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) { const i = (yy * docW + xx) * 4; buf[i] = r; buf[i + 1] = g; buf[i + 2] = b; buf[i + 3] = a; } },
    px(x, y) { const i = (y * docW + x) * 4; return [buf[i], buf[i + 1], buf[i + 2], buf[i + 3]]; },
    getImageData(x0, y0, w, h) { const data = new Uint8ClampedArray(w * h * 4); for (let yy = 0; yy < h; yy++) data.set(buf.subarray(((y0 + yy) * docW + x0) * 4, ((y0 + yy) * docW + x0 + w) * 4), yy * w * 4); return new ImageData(data, w, h); },
    putImageData(x0, y0, img) { for (let yy = 0; yy < img.height; yy++) buf.set(img.data.subarray(yy * img.width * 4, (yy + 1) * img.width * 4), ((y0 + yy) * docW + x0) * 4); },
  };
}
const RED = [255, 0, 0, 255], WHITE = [255, 255, 255, 255], BLACK = [0, 0, 0, 255];
const GREEN = [0, 1, 0];
function settings(over = {}) {
  return { mode: "paint", dull: 0, size: 8, hardness: 1, spacing: 0.25, strength: 1, sizeCoeff: 0, flowCoeff: 0, opaCoeff: 0, pressureGamma: 1,
    colorRate: 1, color: GREEN, mix: "srgb", lockAlpha: false, dilution: 0, memoryLength: 0.5, ...over };
}
function drag(eng, layer, s, x0, x1, y, p = 1) {
  eng.beginStroke(layer, s, x0, y, p, null);
  const dir = Math.sign(x1 - x0);
  for (let x = x0 + dir; dir > 0 ? x <= x1 : x >= x1; x += dir) eng.extendStroke(x, y, p);
  eng.endStroke();
}
const same = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);

describe("smudge · 湿画笔 · 稀释", () => {
  it("全透明画布 + d=1 → 什么都画不上；d=0 → 掺入笔色（现状）", () => {
    const L1 = mockLayer(60, 20);
    drag(new SmudgeEngine(), L1, settings({ dilution: 1 }), 10, 50, 10);
    assert(L1.buf.every((v) => v === 0), "d=1 透明处应零落色");
    const L0 = mockLayer(60, 20);
    drag(new SmudgeEngine(), L0, settings({ dilution: 0 }), 10, 50, 10);
    const [r, g, b, a] = L0.px(30, 10);
    assert(a > 200 && g > 200 && r < 5 && b < 5, `d=0 应落绿 (${r},${g},${b},${a})`);
  });
  it("半透明（α=128）红底 + d=1：alpha 基本不动（出料 alpha 减半 ≈ 底 alpha），颜色向绿走；d=0 alpha 涨到 255", () => {
    const L1 = mockLayer(60, 20); L1.fill(0, 0, 60, 20, [255, 0, 0, 128]);
    drag(new SmudgeEngine(), L1, settings({ dilution: 1 }), 10, 50, 10);
    const [r1, g1, , a1] = L1.px(30, 10);
    assert(Math.abs(a1 - 128) <= 6, `d=1 半透明底 alpha 应 ≈128，得 ${a1}`);
    assert(g1 > 100, `颜色应向绿走 g=${g1}（r=${r1}）`);
    const L0 = mockLayer(60, 20); L0.fill(0, 0, 60, 20, [255, 0, 0, 128]);
    drag(new SmudgeEngine(), L0, settings({ dilution: 0 }), 10, 50, 10);
    assert(L0.px(30, 10)[3] >= 250, `d=0 alpha 应涨满，得 ${L0.px(30, 10)[3]}`);
  });
  it("dilution 缺省/0 与旧 settings 形逐字节一致（回归）", () => {
    const a = mockLayer(40, 20); a.fill(0, 0, 20, 20, RED);
    const b = mockLayer(40, 20); b.fill(0, 0, 20, 20, RED);
    const base = { mode: "paint", dull: 0, size: 8, hardness: 1, spacing: 0.25, strength: 0.8, sizeCoeff: 0, flowCoeff: 0, opaCoeff: 0, pressureGamma: 1, colorRate: 0.5, color: GREEN, mix: "srgb", lockAlpha: false };
    drag(new SmudgeEngine(), a, base, 10, 30, 10);
    drag(new SmudgeEngine(), b, { ...base, dilution: 0, memoryLength: 0 }, 10, 30, 10);
    assert(same(a.buf, b.buf), "d=0 / L=0 与无字段一致");
  });
});

describe("smudge · 湿画笔 · 压感反向", () => {
  it("s_p=0 → 出料不含笔色（与 colorRate=0 逐字节一致）；s_p=1 → 掺入", () => {
    const a = mockLayer(40, 20); a.fill(0, 0, 40, 20, RED);
    const b = mockLayer(40, 20); b.fill(0, 0, 40, 20, RED);
    drag(new SmudgeEngine(), a, settings({ colorRate: 1 }), 5, 35, 10, 0);
    drag(new SmudgeEngine(), b, settings({ colorRate: 0 }), 5, 35, 10, 0);
    assert(same(a.buf, b.buf), "轻按（s_p=0）= 只揉，不掺色");
    const c = mockLayer(40, 20); c.fill(0, 0, 40, 20, RED);
    drag(new SmudgeEngine(), c, settings({ colorRate: 1 }), 5, 35, 10, 1);
    assert(c.px(20, 10)[1] > 200, `重按应掺绿 g=${c.px(20, 10)[1]}`);
  });
});

describe("smudge · 多分辨率出料（揉匀中段）", () => {
  it("左黑右白，dull=0.5 拖过交界：中线灰度单调不减、无双影；不发黑（premult）", () => {
    const L = mockLayer(60, 20); L.fill(0, 0, 30, 20, BLACK); L.fill(30, 0, 30, 20, WHITE);
    drag(new SmudgeEngine(), L, settings({ mode: "smear", colorRate: 0, dull: 0.5, strength: 0.6, size: 12 }), 20, 45, 10);
    let prev = -1;
    for (let x = 10; x <= 50; x++) {
      const [r, , , a] = L.px(x, 10);
      eq(a, 255, `不透明区 alpha 不动 x=${x}`);
      assert(r >= prev - 2, `中线灰度应单调不减：x=${x} r=${r} < prev ${prev}`);
      prev = Math.max(prev, r);
    }
  });
  it("拖红进透明区（dull=0.5）：有 alpha 的像素全是纯红——透明像素 RGB 未进平均", () => {
    const L = mockLayer(60, 20); L.fill(0, 0, 15, 20, RED);
    drag(new SmudgeEngine(), L, settings({ mode: "smear", colorRate: 0, dull: 0.5, strength: 0.9 }), 10, 40, 10);
    let seen = 0;
    for (let x = 15; x < 60; x++) for (let y = 0; y < 20; y++) {
      const [r, g, b, a] = L.px(x, y);
      if (a === 0) continue;
      seen++;
      assert(r >= 250 && g <= 3 && b <= 3, `(${x},${y}) 应纯红 (${r},${g},${b},${a})`);
    }
    assert(seen > 0, "应拖出些红");
  });
  it("dull=0 = 块（与 dull 缺省逐字节一致）", () => {
    const a = mockLayer(40, 20); a.fill(0, 0, 20, 20, RED);
    const b = mockLayer(40, 20); b.fill(0, 0, 20, 20, RED);
    const base = settings({ mode: "smear", colorRate: 0, strength: 0.8 });
    drag(new SmudgeEngine(), a, { ...base, dull: 0 }, 10, 30, 10);
    const { dull: _d, ...noDull } = base;
    drag(new SmudgeEngine(), b, noDull, 10, 30, 10);
    assert(same(a.buf, b.buf), "dull=0 与缺省一致");
  });
});

describe("smudge · 记忆解耦（paint）", () => {
  it("paint + strength=1 + 记忆 0.05 直径：拖红进透明区，一个直径外基本不再带红；smear s=1 仍纯搬（记忆律不变）", () => {
    const Lp = mockLayer(80, 20); Lp.fill(0, 0, 16, 20, RED);
    drag(new SmudgeEngine(), Lp, settings({ colorRate: 0, memoryLength: 0.05, strength: 1 }), 12, 70, 10);
    assert(Lp.px(40, 10)[3] < 20, `paint 短记忆：三个直径外 alpha 应≈0，得 ${Lp.px(40, 10)[3]}`);
    const Ls = mockLayer(80, 20); Ls.fill(0, 0, 16, 20, RED);
    drag(new SmudgeEngine(), Ls, settings({ mode: "smear", colorRate: 0, memoryLength: 0.05, strength: 1 }), 12, 70, 10);
    eq(Ls.px(60, 10)[3], 255, "smear s=1 纯搬到底（memoryLength 不作用于 smear）");
  });
  it("paint 长记忆（2 直径）比短记忆（0.05）带得远", () => {
    const at = (L) => { const M = mockLayer(80, 20); M.fill(0, 0, 16, 20, RED); drag(new SmudgeEngine(), M, settings({ colorRate: 0, memoryLength: L, strength: 0.9 }), 12, 70, 10); return M.px(36, 10)[3]; };
    const short = at(0.05), long = at(2);
    assert(long > short + 20, `长记忆 ${long} 应明显 > 短记忆 ${short}`);
  });
});
