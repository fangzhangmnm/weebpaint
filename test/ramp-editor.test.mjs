// ramp-editor 编辑器皮：CSS 渐变串 / 插入位置 / hex + dom-shim 构造不抛。created 2026-09-05 by Claude Fable 5.1
import { describe, it, eq, assert } from "./runner.mjs";
import { rampCssGradient, pickInsertStopT, rgba8ToHex, makeRampEditor } from "../src/ui/ramp-editor.ts";
import { makeRamp, grayRamp, bakeRampLut } from "../src/common/color-ramp.ts";

describe("ramp-editor · 渐变串", () => {
  it("256 段双位置色标；constant 阈值处硬边（相邻段颜色跳变）", () => {
    const r = makeRamp([{ t: 0, rgba: [200, 60, 50, 255] }, { t: 0.5, rgba: [245, 210, 180, 255] }], "constant");
    const css = rampCssGradient(bakeRampLut(r));
    assert(css.startsWith("linear-gradient(90deg,"));
    eq((css.match(/rgb/g) || []).length, 256);
    assert(css.includes("rgb(200,60,50) 49.6094% 50.0000%"), "第 127 段红");
    assert(css.includes("rgb(245,210,180) 50.0000% 50.3906%"), "第 128 段皮肤色");
  });
  it("alpha < 255 → rgba()", () => {
    const r = makeRamp([{ t: 0, rgba: [0, 0, 0, 0] }, { t: 1, rgba: [0, 0, 0, 0] }]);
    assert(rampCssGradient(bakeRampLut(r)).includes("rgba(0,0,0,0.000)"));
  });
  it("pickInsertStopT / rgba8ToHex", () => {
    const st = [{ t: 0 }, { t: 0.2 }, { t: 1 }];
    eq(pickInsertStopT(st, 0), 0.1); eq(pickInsertStopT(st, 2), 0.6); eq(pickInsertStopT(st, -1), 0.6);
    eq(rgba8ToHex([255, 128, 0, 255]), "#ff8000"); eq(rgba8ToHex([1, 2, 3, 128]), "#01020380");
  });
});

describe("ramp-editor · dom-shim 构造", () => {
  it("makeRampEditor 建/select/setRamp/dispose 不抛；data-* 反映色标数与选中；onSelect 只在选中变化时发", () => {
    let inputs = 0; const sels = [];
    const h = makeRampEditor({ ramp: grayRamp(), onInput: () => inputs++, onCommit: () => {}, onSelect: (i) => sels.push(i) });
    eq(h.el.dataset.stopCount, "2"); eq(h.selected(), -1);
    h.select(1); eq(h.el.dataset.selected, "1");
    h.redraw();   // 未变 → 不重发
    h.setRamp(makeRamp([{ t: 0.3, rgba: [0, 0, 0, 255] }])); eq(h.el.dataset.stopCount, "1"); eq(h.selected(), -1);
    eq(sels.join(","), "-1,1,-1");
    h.dispose();
    eq(inputs, 0);
  });
});
