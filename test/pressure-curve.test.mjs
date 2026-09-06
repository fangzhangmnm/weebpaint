// 压感曲线（批 4）：整形函数 LUT 等价 / gamma 回落 / 笔刷 JSON 可选键透传。created 2026-09-05 by Claude Fable 5.1
import { describe, it, eq, assert } from "./runner.mjs";
import { makePressureShaper, curveFromGamma, bakePressureLut, lookupPressureLut } from "../src/common/pressure-curve.ts";
import { identityCurve, makeCurve, setTangentMode, evaluate } from "../src/common/anim-curve.ts";
import { resolveBrush } from "../src/common/resolved-brush.ts";
import { makeBrush } from "../src/brushes.ts";
import { smudgeSettingsFrom } from "../src/plugins/smudge.ts";

const near = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;

describe("pressure-curve · 整形函数", () => {
  it("无曲线 → p^gamma（gamma 1 = 直通；地板 0.01）", () => {
    const g1 = makePressureShaper({ pressureGamma: 1 });
    for (const p of [0, 0.3, 0.77, 1]) eq(g1(p), p);
    const g05 = makePressureShaper({ pressureGamma: 0.5 });
    assert(near(g05(0.25), 0.5));
    assert(near(makePressureShaper({ pressureGamma: 0 })(0.5), Math.pow(0.5, 1)), "gamma 0 视作缺省 1（旧引擎 `|| 1.0`）");
    assert(near(makePressureShaper({})(0.4), 0.4));
    eq(g1(1.7), 1); eq(g1(-2), 0);
  });
  it("恒等曲线 → 输出 ≡ 输入（LUT 线性插值，浮点误差级）", () => {
    const f = makePressureShaper({ pressureGamma: 3, pressureCurve: identityCurve() });   // gamma 被曲线替代
    for (let i = 0; i <= 1000; i++) { const p = i / 1000; assert(near(f(p), p, 1e-6), `p=${p} → ${f(p)}`); }
  });
  it("常数曲线 (0,1)-(1,1) → 恒 1（「无压感」）", () => {
    const f = makePressureShaper({ pressureCurve: makeCurve([{ t: 0, v: 1 }, { t: 1, v: 1 }]) });
    for (const p of [0, 0.2, 0.9, 1]) assert(near(f(p), 1));
  });
  it("坏形状曲线 → 回落 gamma；值域钳 0..1", () => {
    const f = makePressureShaper({ pressureGamma: 2, pressureCurve: { keys: "x" } });
    assert(near(f(0.5), 0.25));
    const over = makeCurve([{ t: 0, v: 0 }, { t: 1, v: 1 }]);
    setTangentMode(over, 0, "free", "out"); over.keys[0].outTan = 8; over.keys[0].outMode = "free";   // 过冲
    const lut = bakePressureLut(over);
    for (let i = 0; i < 256; i++) assert(lut[i] >= 0 && lut[i] <= 1);
    eq(lookupPressureLut(lut, 1), lut[255]); eq(lookupPressureLut(lut, 0), lut[0]);
  });
  it("curveFromGamma(1) = 精确恒等；curveFromGamma(0.5) 过 (0.25, 0.5)", () => {
    const c1 = curveFromGamma(1);
    const f = makePressureShaper({ pressureCurve: c1 });
    for (let i = 0; i <= 100; i++) assert(near(f(i / 100), i / 100, 1e-6));
    const c5 = curveFromGamma(0.5);
    assert(near(evaluate(c5, 0.25), 0.5), "key 上精确");
    assert(near(makePressureShaper({ pressureCurve: c5 })(0.25), 0.5, 3e-3), "LUT 256 档分辨率内");
  });
});

describe("pressure-curve · 笔刷 JSON 透传", () => {
  it("makeBrush 缺省不写 pressureCurve 键；给了才有", () => {
    const b = makeBrush({ name: "x", tool: "brush" });
    assert(!("pressureCurve" in b));
    const c = makeBrush({ name: "x", tool: "brush", pressureCurve: identityCurve() });
    eq(c.pressureCurve.keys.length, 2);
  });
  it("resolveBrush：preset 带曲线 → 归一化副本；缺省 null；坏形状 null", () => {
    eq(resolveBrush({ preset: { pressureGamma: 0.5 } }).pressureCurve, null);
    eq(resolveBrush({}).pressureCurve, null);
    const r = resolveBrush({ preset: { pressureCurve: { keys: [{ t: 1, v: 1 }, { t: 0, v: 0 }] } } });
    eq(r.pressureCurve.keys[0].t, 0);
    eq(resolveBrush({ preset: { pressureCurve: { keys: [] } } }).pressureCurve, null);
  });
  it("smudgeSettingsFrom 透传曲线（缺省 null）", () => {
    const bs = { size: 32, pressureGamma: 1 };
    eq(smudgeSettingsFrom({}, bs, {}).pressureCurve, null);
    const s = smudgeSettingsFrom({}, { ...bs, pressureCurve: identityCurve() }, {});
    eq(s.pressureCurve.keys.length, 2);
  });
});
