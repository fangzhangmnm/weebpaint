// 液化写区 / 位移场不再被「现有内容 bbox」截断 —— tile-era degeneration 修（2026-09-19 搬 GPU 后同锚：场按 footprint 长、夹 doc）。
// 问题陈述（真机报：液化拉到 bbox 边缘后被截断）：写区/场必须跟 footprint 走，推出旧内容边的像素能落地。
//   GPU 版：位移场 = 区域尺寸 f32 纹理，懒建于第一个 footprint，只扩不缩、夹 doc（fieldRect 观测口）；增长搬旧场（field-copy）保留已累积位移。
import { describe, it, assert, eq } from "./runner.mjs";
import { gpuLayer } from "./region-target.mjs";
const { LiquifyEngine } = await import("../src/plugins/liquify-engine.ts");

describe("liquify · 场跟 footprint 长（不 tie content bbox；GPU）", () => {
  it("空层 push：场长到 footprint 并夹在 doc 内（旧码 content bbox=0 会早退、什么都不长）", () => {
    const L = gpuLayer(64, 64, { snapshot: true });
    const rs = L.open();
    const eng = new LiquifyEngine();
    eng.beginStroke([rs], { size: 30, strength: 1, mode: "push", bleed: "edge" }, 10, 10);
    eng.extendStroke(45, 10);
    const f = eng.fieldRect;
    assert(f, "应已起场");
    assert(f[2] >= 40, `场右边界应达 footprint，实得 ${f[2]}`);
    assert(f[0] >= 0 && f[2] <= 64 && f[1] >= 0 && f[3] <= 64, `场夹在 doc 内，实得 ${f}`);
    eng.endStroke(); L.close(rs); L.dispose();
  });
  it("只扩不缩 + 已累积位移随原坐标平移保留（field-copy 搬旧场）", () => {
    const L = gpuLayer(96, 96, { snapshot: true });
    L.fill(20, 20, 40, 40, [220, 30, 30, 255]);
    const rs = L.open();
    const eng = new LiquifyEngine();
    eng.beginStroke([rs], { size: 8, strength: 1, mode: "push", bleed: "edge" }, 30, 30);
    eng.extendStroke(34, 30);           // 场起于 footprint 约 (26..42, 22..38)
    const f1 = eng.fieldRect;
    const A1 = eng._stroke.field.A.fbo.data;   // SoftGl2Port 软 FBO（测试直读）
    const w1 = eng._stroke.field.w;
    const px = 34, py = 30;             // 圈心像素：d = vel·ff·s = (4,0)
    const d1 = [A1[((py - f1[1]) * w1 + (px - f1[0])) * 4], A1[((py - f1[1]) * w1 + (px - f1[0])) * 4 + 1]];
    assert(Math.abs(d1[0] - 4) < 1e-5 && Math.abs(d1[1]) < 1e-5, `圈心位移应 (4,0)，实得 ${d1}`);
    eng.extendStroke(70, 70);           // 远处 → 场向右下扩
    const f2 = eng.fieldRect;
    assert(f2[0] <= f1[0] && f2[1] <= f1[1] && f2[2] >= 70 && f2[3] >= 70, `只扩不缩：${f1} → ${f2}`);
    const A2 = eng._stroke.field.A.fbo.data, w2 = eng._stroke.field.w;
    const d2 = [A2[((py - f2[1]) * w2 + (px - f2[0])) * 4], A2[((py - f2[1]) * w2 + (px - f2[0])) * 4 + 1]];
    assert(Math.abs(d2[0] - d1[0]) < 1e-5 && Math.abs(d2[1] - d1[1]) < 1e-5, `扩场后原位移应保留：${d1} vs ${d2}`);
    eng.endStroke(); L.close(rs); L.dispose();
  });
  it("被包含的 footprint → 场不变（不缩）", () => {
    const L = gpuLayer(64, 64, { snapshot: true });
    const rs = L.open();
    const eng = new LiquifyEngine();
    eng.beginStroke([rs], { size: 20, strength: 1, mode: "push", bleed: "edge" }, 32, 32);
    eng.extendStroke(33, 32);
    const f1 = eng.fieldRect, A1 = eng._stroke.field.A;
    eng.extendStroke(33, 32);           // 同点重来：footprint 完全在内
    eq(JSON.stringify(eng.fieldRect), JSON.stringify(f1), "包含 footprint 不重建");
    assert(eng._stroke.field.A === A1, "同一张场纹理");
    eng.endStroke(); L.close(rs); L.dispose();
  });
});
