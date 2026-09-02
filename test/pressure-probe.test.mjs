// 压感自诊探针（src/pressure-probe.ts）：两路证据的判定边界 + 鼠绘零误报钉子。
// created 2026-09-02 by Claude Fable 5.1.
import { describe, it, eq, assert } from "./runner.mjs";
import { PressureProbe, isWindowsPlatform, PEN_FLAT_MIN_SAMPLES, JUMP_MIN_PX, JUMP_MIN_GAP_MS } from "../src/pressure-probe.ts";

const pen = (x, y, t, pressure, buttons = 1) => ({ pointerType: "pen", pressure, buttons, x, y, t });
const mouse = (x, y, t, coalescedFirst = null) => ({ pointerType: "mouse", pressure: 0.5, buttons: 0, x, y, t, coalescedFirst });

function flatStroke(probe, id, { n = 30, p = 0.5, step = 4 } = {}) {
  let v = null;
  for (let i = 0; i < n; i++) v = probe.observeMove(id, pen(10 + i * step, 10, i * 8, p)) ?? v;
  return probe.observeUp(id, pen(10 + n * step, 10, n * 8, 0)) ?? v;
}

describe("pressure-probe · pen-flat", () => {
  it("整笔恒压（≥24 样本、≥60px）→ pen-flat", () => {
    const pr = new PressureProbe({ windows: false });
    eq(flatStroke(pr, 1), "pen-flat");
    eq(pr.verdict, "pen-flat");
  });
  it("真压感笔（有噪声）→ 不判", () => {
    const pr = new PressureProbe({ windows: false });
    for (let i = 0; i < 40; i++) pr.observeMove(1, pen(10 + i * 4, 10, i * 8, 0.4 + 0.01 * Math.sin(i)));
    eq(pr.observeUp(1), null);
    eq(pr.verdict, null);
  });
  it("样本不够（tap / 短划）→ 不判", () => {
    const pr = new PressureProbe({ windows: false });
    eq(flatStroke(pr, 1, { n: PEN_FLAT_MIN_SAMPLES - 1 }), null);
  });
  it("路径太短（原地抖）→ 不判", () => {
    const pr = new PressureProbe({ windows: false });
    eq(flatStroke(pr, 1, { n: 40, step: 0.5 }), null);   // 20px < 60px
  });
  it("hover（buttons=0）不计入笔画", () => {
    const pr = new PressureProbe({ windows: false });
    for (let i = 0; i < 40; i++) pr.observeMove(1, pen(10 + i * 4, 10, i * 8, 0.5, 0));
    eq(pr.observeUp(1), null);
  });
  it("pressure=0 的样本（抬笔瞬间/warmup）不进极差", () => {
    const pr = new PressureProbe({ windows: false });
    pr.observeMove(1, pen(10, 10, 0, 0));          // warmup 0
    for (let i = 1; i < 31; i++) pr.observeMove(1, pen(10 + i * 4, 10, i * 8, 0.5));
    eq(pr.observeUp(1, pen(140, 10, 300, 0)), "pen-flat");
  });
  it("一次判定后停摆", () => {
    const pr = new PressureProbe({ windows: false });
    eq(flatStroke(pr, 1), "pen-flat");
    eq(flatStroke(pr, 2), null);
  });
});

describe("pressure-probe · absolute-mouse（Windows 数位板走鼠标模式）", () => {
  it("两次瞬移（间隔 ≥100ms、位移 ≥250px）→ absolute-mouse", () => {
    const pr = new PressureProbe({ windows: true });
    eq(pr.observeMove(1, mouse(100, 100, 0)), null);
    eq(pr.observeMove(1, mouse(500, 100, 200)), null);    // 第 1 跳
    eq(pr.jumps, 1);
    eq(pr.observeMove(1, mouse(510, 105, 216)), null);    // 正常小移动
    eq(pr.observeMove(1, mouse(100, 400, 900)), "absolute-mouse");   // 第 2 跳
  });
  it("鼠绘零误报：连续移动（每帧小位移）永不判", () => {
    const pr = new PressureProbe({ windows: true });
    let v = null;
    for (let i = 0; i < 2000; i++) v = pr.observeMove(1, mouse(100 + (i * 37) % 900, 100 + (i * 53) % 500, i * 16)) ?? v;
    // 每帧位移可能很大（37/53 px 取模会跳），但 dt=16ms < 100ms → 不算瞬移
    eq(v, null); eq(pr.jumps, 0);
  });
  it("快甩：coalesced 首样本贴着上一位置 → 不是瞬移", () => {
    const pr = new PressureProbe({ windows: true });
    pr.observeMove(1, mouse(100, 100, 0));
    eq(pr.observeMove(1, mouse(600, 100, 300, { x: 104, y: 100 })), null);
    eq(pr.jumps, 0);
  });
  it("瞬移：coalesced 首样本已在远端 → 计跳", () => {
    const pr = new PressureProbe({ windows: true });
    pr.observeMove(1, mouse(100, 100, 0));
    pr.observeMove(1, mouse(600, 100, 300, { x: 598, y: 101 }));
    eq(pr.jumps, 1);
  });
  it("resetBaseline（离开画布/失焦/隐藏）后第一次 move 不算跳", () => {
    const pr = new PressureProbe({ windows: true });
    pr.observeMove(1, mouse(100, 100, 0));
    pr.resetBaseline();
    eq(pr.observeMove(1, mouse(900, 600, 5000)), null);
    eq(pr.jumps, 0);
  });
  it("非 Windows 不判 absolute-mouse", () => {
    const pr = new PressureProbe({ windows: false });
    pr.observeMove(1, mouse(100, 100, 0));
    pr.observeMove(1, mouse(500, 100, 200));
    pr.observeMove(1, mouse(100, 400, 900));
    eq(pr.jumps, 0); eq(pr.verdict, null);
  });
  it("阈值常量是判定边界（dt 差 1ms / 位移差 1px 不算）", () => {
    const pr = new PressureProbe({ windows: true });
    pr.observeMove(1, mouse(0, 0, 0));
    pr.observeMove(1, mouse(JUMP_MIN_PX - 1, 0, JUMP_MIN_GAP_MS + 50));
    pr.observeMove(1, mouse(0, 0, JUMP_MIN_GAP_MS * 2 + 50 - 1));   // dt = 99
    eq(pr.jumps, 0);
    pr.observeMove(1, mouse(JUMP_MIN_PX, 0, 1000));
    eq(pr.jumps, 1);
  });
  it("touch 不参与", () => {
    const pr = new PressureProbe({ windows: true });
    pr.observeMove(1, { pointerType: "touch", pressure: 0, buttons: 1, x: 0, y: 0, t: 0 });
    pr.observeMove(1, { pointerType: "touch", pressure: 0, buttons: 1, x: 900, y: 900, t: 500 });
    eq(pr.jumps, 0);
  });
});

describe("pressure-probe · isWindowsPlatform", () => {
  it("UA-CH 优先", () => {
    assert(isWindowsPlatform({ userAgentData: { platform: "Windows" }, userAgent: "Mozilla/5.0 (Macintosh)" }));
    assert(!isWindowsPlatform({ userAgentData: { platform: "macOS" }, userAgent: "Windows NT 10.0" }));
  });
  it("UA 字符串兜底", () => {
    assert(isWindowsPlatform({ userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" }));
    assert(!isWindowsPlatform({ userAgent: "Mozilla/5.0 (iPad; CPU OS 17_0)" }));
    assert(!isWindowsPlatform(undefined));
  });
});
