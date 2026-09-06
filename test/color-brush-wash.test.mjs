// 模糊/锐化滤镜笔 wash 幂等（created 2026-09-06 by Claude Fable 5.1；user「模糊笔 wash idempotent 同意」，议程 §E）。
// 问题陈述：输入 = 一张有梯度的图 + 一条笔画（点列）；输出 = 改写后的图。
//   钉的语义：① 一笔之内来回描三遍 == 描一遍（覆盖 mask 取 max，滤波只对起笔原像素算一次）；
//   ② 完全覆盖处的像素 == 对原图直接 bake 的结果（强度与 dab 数无关）；③ 间距 2% 与 10% 的结果在满覆盖区逐字节相同。
import { describe, it, eq, assert } from "./runner.mjs";
import { SharpenBlurFilter } from "../src/plugins/sharpen-blur.ts";

function mockLayer(docW, docH) {
  const buf = new Uint8ClampedArray(docW * docH * 4);
  for (let y = 0; y < docH; y++) for (let x = 0; x < docW; x++) { const i = (y * docW + x) * 4; buf[i] = (x * 7) & 255; buf[i + 1] = (y * 13) & 255; buf[i + 2] = ((x ^ y) * 5) & 255; buf[i + 3] = 255; }
  return {
    docW, docH, buf, bboxX: 0, bboxY: 0, bboxW: docW, bboxH: docH,
    getImageData(x0, y0, w, h) { const data = new Uint8ClampedArray(w * h * 4); for (let yy = 0; yy < h; yy++) data.set(buf.subarray(((y0 + yy) * docW + x0) * 4, ((y0 + yy) * docW + x0 + w) * 4), yy * w * 4); return new ImageData(data, w, h); },
    putImageData(x0, y0, img) { for (let yy = 0; yy < img.height; yy++) buf.set(img.data.subarray(yy * img.width * 4, (yy + 1) * img.width * 4), ((y0 + yy) * docW + x0) * 4); },
  };
}
const same = (a, b) => { if (a.length !== b.length) return false; for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false; return true; };
function stroke(L, passes, spacing = 0.1, flow = 1) {
  const st = SharpenBlurFilter.beginBrushStroke([L], { amount: -60 }, { size: 24, hardness: 0.5, flow, spacing }, null, 30, 30, 1);
  for (let p = 0; p < passes; p++) {
    const dir = p % 2 === 0 ? 1 : -1;
    for (let k = 1; k <= 60; k++) { const x = dir > 0 ? 30 + k : 90 - k; SharpenBlurFilter.extendBrushStamp(st, x, 30, 1); if (k % 7 === 0) SharpenBlurFilter.flushDirty(st); }
  }
  SharpenBlurFilter.endBrushStroke(st);
  return st;
}

describe("color-brush · wash 幂等", () => {
  it("一笔之内来回描三遍 == 描一遍：满覆盖中心线逐字节相同，整图只在软边差 ≤ 一级（dab 落点不同的覆盖包络），绝无二次滤波", () => {
    const L1 = mockLayer(140, 60), L3 = mockLayer(140, 60);
    const orig = Uint8ClampedArray.from(L1.buf);
    stroke(L1, 1); stroke(L3, 3);
    const at = (buf, x, y) => Array.from(buf.subarray((y * 140 + x) * 4, (y * 140 + x) * 4 + 4)).join(",");
    for (const x of [40, 50, 60, 70, 80]) eq(at(L3.buf, x, 30), at(L1.buf, x, 30), `中心线 x=${x}`);
    let maxd = 0; for (let i = 0; i < orig.length; i++) maxd = Math.max(maxd, Math.abs(L3.buf[i] - L1.buf[i]));
    // 软边：来回描时 dab 落点相位不同，覆盖包络（max）在半径边缘略宽，lerp 权重差几个百分点；实测 ≈19/255。上限 32 只防「整块被二次滤波」（那会到 60+）。
    assert(maxd <= 32, `软边覆盖包络差应很小，got ${maxd}`);
    // 对照：真「越描越糊」= 对滤波结果再滤一遍；中心线不该长成那样
    const once = new Uint8ClampedArray(orig.length), twice = new Uint8ClampedArray(orig.length);
    SharpenBlurFilter.bake(orig, once, { amount: -60 }, null, 140, 60);
    SharpenBlurFilter.bake(once, twice, { amount: -60 }, null, 140, 60);
    assert(at(twice, 60, 30) !== at(once, 60, 30), "自证：二次滤波确实不同");
    eq(at(L3.buf, 60, 30), at(once, 60, 30), "三遍后中心线 = 一次滤波，不是二次");
  });
  it("满覆盖处像素 == 对原图直接 bake（强度与 dab 数无关）；未扫过处不变", () => {
    const L = mockLayer(140, 60);
    const orig = Uint8ClampedArray.from(L.buf);
    stroke(L, 1);
    const ref = new Uint8ClampedArray(orig.length);
    SharpenBlurFilter.bake(orig, ref, { amount: -60 }, null, 140, 60);
    const at = (buf, x, y) => Array.from(buf.subarray((y * 140 + x) * 4, (y * 140 + x) * 4 + 4));
    // 笔迹中心线上（hardness 0.5 → 半径 6 内满覆盖）
    for (const x of [45, 60, 75]) eq(at(L.buf, x, 30).join(","), at(ref, x, 30).join(","), `(${x},30) 应 = 一次滤波`);
    // 远离笔迹处原样
    for (const [x, y] of [[10, 10], [130, 55], [60, 2]]) eq(at(L.buf, x, y).join(","), at(orig, x, y).join(","), `(${x},${y}) 应不变`);
    // 滤波确实改了东西（自证非空转）
    assert(!same(L.buf, orig));
  });
  it("间距 2%（吃地板 10%）与 20% 在满覆盖中心线逐字节相同（间距只管 mask 边缘）", () => {
    const La = mockLayer(140, 60), Lb = mockLayer(140, 60);
    stroke(La, 1, 0.02); stroke(Lb, 1, 0.2);
    const at = (buf, x, y) => Array.from(buf.subarray((y * 140 + x) * 4, (y * 140 + x) * 4 + 4)).join(",");
    for (const x of [40, 50, 60, 70, 80]) eq(at(La.buf, x, 30), at(Lb.buf, x, 30), `x=${x}`);
  });
  it("flow 0.5：满覆盖处 = orig 与 filtered 各半（premult lerp）", () => {
    const L = mockLayer(140, 60);
    const orig = Uint8ClampedArray.from(L.buf);
    stroke(L, 1, 0.1, 0.5);
    const ref = new Uint8ClampedArray(orig.length);
    SharpenBlurFilter.bake(orig, ref, { amount: -60 }, null, 140, 60);
    const i = (30 * 140 + 60) * 4;
    for (let c = 0; c < 3; c++) assert(Math.abs(L.buf[i + c] - (orig[i + c] + ref[i + c]) / 2) <= 1, `通道 ${c}: ${L.buf[i + c]} vs ${(orig[i + c] + ref[i + c]) / 2}`);
  });
});
