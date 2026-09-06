// smudge 插件契约测（created 2026-09-05 by Claude Fable 5.1）：ResolvedBrush → 引擎设置的映射 + 走 Filter brush 契约跑一笔。
import { describe, it, assert, eq } from "./runner.mjs";
import { SmudgeFilter, smudgeSettingsFrom, parseHexColor } from "../src/plugins/smudge.ts";
import { getFilter } from "../src/filters.ts";

function mockLayer(docW, docH) {
  const buf = new Uint8ClampedArray(docW * docH * 4);
  return {
    docW, docH, buf, lockAlpha: false, bboxX: 0, bboxY: 0, bboxW: docW, bboxH: docH,
    fill(x, y, w, h, [r, g, b, a]) { for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) { const i = (yy * docW + xx) * 4; buf[i] = r; buf[i + 1] = g; buf[i + 2] = b; buf[i + 3] = a; } },
    px(x, y) { const i = (y * docW + x) * 4; return [buf[i], buf[i + 1], buf[i + 2], buf[i + 3]]; },
    getImageData(x0, y0, w, h) { const data = new Uint8ClampedArray(w * h * 4); for (let yy = 0; yy < h; yy++) data.set(buf.subarray(((y0 + yy) * docW + x0) * 4, ((y0 + yy) * docW + x0 + w) * 4), yy * w * 4); return new ImageData(data, w, h); },
    putImageData(x0, y0, img) { for (let yy = 0; yy < img.height; yy++) buf.set(img.data.subarray(yy * img.width * 4, (yy + 1) * img.width * 4), ((y0 + yy) * docW + x0) * 4); },
  };
}

describe("smudge 插件 · 设置映射", () => {
  it("strength = flow × opacity；spacing 有地板；mix 非法回 srgb；paint 才有 colorRate；lockAlpha 跟图层", () => {
    const s = smudgeSettingsFrom({ mode: "paint", colorRate: 0.3, mix: "bogus" }, { size: 40, flow: 0.5, opacity: 0.8, spacing: 0.005, hardness: 0.7, color: "#ff8000", flowCoeff: 1 }, { lockAlpha: true });
    eq(s.mode, "paint"); eq(s.colorRate, 0.3); eq(s.mix, "srgb"); eq(s.lockAlpha, true);
    assert(Math.abs(s.strength - 0.4) < 1e-9, "strength = 0.5 × 0.8");
    eq(s.spacing, 0.01, "spacing 地板 0.01（只防 0/负值）"); eq(s.flowCoeff, 1, "flowCoeff 透传");
    eq(s.hardness, 0.7);
    const [r, g, b] = s.color; assert(r === 1 && Math.abs(g - 128 / 255) < 1e-9 && b === 0, "颜色解析");
    const s2 = smudgeSettingsFrom({ mode: "smear", colorRate: 0.9, mix: "spectral" }, { size: 10 }, {});
    eq(s2.colorRate, 0, "非 paint 变体 colorRate 归零"); eq(s2.mix, "spectral"); eq(s2.lockAlpha, false);
    const s3 = smudgeSettingsFrom({}, { size: 10 }, {});
    eq(s3.mode, "smear", "缺省 smear"); eq(s3.spacing, 0.02, "缺省间距 2%");
  });
  it("parseHexColor：带/不带 #、非法 → 黑", () => {
    eq(parseHexColor("00ff00")[1], 1); eq(parseHexColor("#0000FF")[2], 1); eq(parseHexColor("nope")[0], 0); eq(parseHexColor(null)[0], 0);
  });
});

describe("smudge 插件 · Filter brush 契约", () => {
  it("已注册、声明 brush 模式 + 三 variant + 三 mix", () => {
    const F = getFilter("smudge");
    assert(F, "registry 里有 smudge");
    eq(SmudgeFilter.modes[0], "brush"); eq(SmudgeFilter.brushVariants.length, 3); eq(SmudgeFilter.mixModes.length, 3);
  });
  it("begin/extend/flush/end 跑一笔：红被拖进透明区；多叶被响亮拒绝", () => {
    const L = mockLayer(60, 20);
    L.fill(0, 0, 12, 20, [255, 0, 0, 255]);
    const st = SmudgeFilter.beginBrushStroke([L], { mode: "smear" }, { size: 8, flow: 1, opacity: 0.9, hardness: 1, spacing: 0.25 }, null, 8, 10, 1);
    for (let x = 9; x <= 40; x++) SmudgeFilter.extendBrushStamp(st, x, 10, 1);
    const d = SmudgeFilter.flushDirty(st);
    assert(d && d[2] > 12, `dirty 应伸进透明区: ${d}`);
    SmudgeFilter.endBrushStroke(st);
    assert(L.px(25, 10)[3] > 0 && L.px(25, 10)[0] >= 250, "拖出的是纯红");
    let threw = false;
    try { SmudgeFilter.beginBrushStroke([L, L], { mode: "smear" }, { size: 8 }, null, 0, 0, 1); } catch { threw = true; }
    assert(threw, "多叶必须抛");
  });
});
