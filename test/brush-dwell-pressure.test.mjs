// 起笔静止期不积压感（created 2026-09-06 by Claude Fable 5.1）。
// 问题陈述（家规：手感类先写清输入输出）：
//   输入 = 落笔后原地顿住 N 个样本（压感涨到 1）再起步画线（压感 0.3）；对照 = 落笔即起步（压感 0.3）。
//   输出 = 起步后前半个笔宽内的 dab 尺寸序列。钉的语义：顿住不改变起步后的 dab 尺寸（顿多久都等于没顿）；
//   起步后压感照旧生效（真按重仍变粗）；pixel（immediate）路径不受影响。
//   病根考古：压感 LPF 走事件时间、taper-in 走弧长，顿住时前者涨满后者为零 → 起步 25px 内放开 = 满压粗头（墨点）。
import { describe, it, assert } from "./runner.mjs";
import { UndoStack } from "../src/backend/workpiece/undo-stack.ts";
import { PaintingWorkpiece } from "../src/backend/workpiece/painting-workpiece.ts";
import { PaintingView } from "../src/backend/workpiece/painting-view.ts";
const { BrushEngine } = await import("../src/backend/brush.ts");
const { resolveBrush } = await import("../src/resolved-brush.ts");

const _ctxs = [];
function rig() {
  const undo = new UndoStack({ maxQuotaBytes: 1 << 30 });
  const wp2 = new PaintingWorkpiece({ undo, tree: { width: 512, height: 512 }, onTokenLeak: () => {} });
  const doc = new PaintingView(wp2);
  wp2.layerTiles._suspendCollect(true);
  _ctxs.push({ undo, wp2 });
  return doc;
}
// 平涂形：大笔 + 全尺寸压感 + 50ms LPF + 入端 taper 0.5
const FLAT = () => resolveBrush({ size: 50, color: "#000000", hardness: 0.9, sizeCoeff: 1, opaCoeff: 0, flowCoeff: 0, pressureGamma: 1.2, pressureLPF: 50, taperIn: 0.5, taperOut: 0, spacing: 0.06, streamline: 0.1, stabilization: 0.2 });
const SMOOTH = { tau: 50, deadzone: 1.6 };

// 一笔：可选顿住 dwellN 个样本（原地微抖 0.05px、压感 1.0），再沿 +x 每 16ms 走 4px 共 moveN 个样本
function stroke(dwellN, moveP = 0.3, moveN = 40) {
  const doc = rig();
  const eng = new BrushEngine();
  let t = 0;
  eng.beginStroke(doc.layers[0], FLAT(), 100, 100, 0.3, "brush", SMOOTH, t);
  for (let i = 0; i < dwellN; i++) { t += 16; eng.extendStroke(100 + (i % 2 ? 0.05 : -0.05), 100, 1.0, t); }
  for (let i = 1; i <= moveN; i++) { t += 16; eng.extendStroke(100 + i * 4, 100, moveP, t); }
  const out = eng.endStroke();
  return out.stamps.filter((s) => s.x <= 100 + 60).map((s) => s.size);   // 起步后前 60 doc px 的 dab 尺寸
}

describe("brush · 起笔静止期不积压感（墨点）", () => {
  it("顿 30 个样本（≈0.5s，压感 1.0）再起步 == 不顿直接起步：前 60px 的 dab 尺寸序列逐颗一致", () => {
    const a = stroke(0), b = stroke(30);
    assert(a.length >= 5 && b.length >= 5, `应有若干 dab（${a.length} / ${b.length}）`);
    const n = Math.min(a.length, b.length);
    for (let i = 0; i < n; i++) assert(Math.abs(a[i] - b[i]) < 1e-6, `第 ${i} 颗：不顿 ${a[i].toFixed(2)} vs 顿 ${b[i].toFixed(2)}`);
  });
  it("对照：起步后真按重（压感 1.0）dab 确实更粗——压感没被整个关掉", () => {
    const light = stroke(0, 0.3), heavy = stroke(0, 1.0);
    const maxL = Math.max(...light), maxH = Math.max(...heavy);
    assert(maxH > maxL * 1.5, `重压 ${maxH.toFixed(1)} 应明显粗于轻压 ${maxL.toFixed(1)}`);
  });
  it("顿住期间不产 dab（原地微抖不撒点）", () => {
    const doc = rig();
    const eng = new BrushEngine();
    let t = 0;
    eng.beginStroke(doc.layers[0], FLAT(), 100, 100, 0.3, "brush", SMOOTH, t);
    for (let i = 0; i < 30; i++) { t += 16; eng.extendStroke(100 + (i % 2 ? 0.05 : -0.05), 100, 1.0, t); }
    const live = eng.collectStamps();
    const n = live ? live.stamps.length : 0;
    assert(n <= 1, `顿住期间最多首颗 dab，实得 ${n}`);
    eng.endStroke();
  });
});
