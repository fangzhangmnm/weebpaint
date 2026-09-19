// C6 · StrokeShadow（stroke 档替身叶——形状笔 pixelMode 等的预览宿；液化/手指族 2026-09-18/19 起改住 region 预览）行为锚。
// 问题陈述（census §6.1 施工单第一户）：
//   - 描边期引擎写靶 = 替身叶，**真层零写**（「预览是引擎自持物」成立）；
//   - End = 句柄 diff 落账真层（唯一真层写，在令牌内）→ 一步 undo，字节与 in-place 路径一致；
//   - Cancel = 丢替身零回滚（真层从未被写，token.cancel 是无痕 no-op）；
//   - 替身自身的 tile 换手被 collector 扣押但 seal 时作废（解析不到 layerId 的实例）→ 不入 undo；
//   - 被擦空的 tile（真层有、替身无）收口时同步回收；
//   - finalize（选区兜底）在替身落账**之后**跑（shape pixelMode + 选区的次序锚）。
import { describe, it, assert, eq } from "./runner.mjs";
import { seedWrite } from "./helpers.mjs";
import { UndoStack } from "../src/backend/workpiece/undo-stack.ts";
import { PaintingWorkpiece } from "../src/backend/workpiece/painting-workpiece.ts";
import { PaintingView } from "../src/backend/workpiece/painting-view.ts";
import { StrokeSession } from "../src/backend/stroke-session.ts";
const { BrushEngine } = await import("../src/backend/brush.ts");
const { resolveBrush } = await import("../src/resolved-brush.ts");
const { Selection } = await import("../src/backend/selection.ts");
const { LiquifyEngine } = await import("../src/plugins/liquify-engine.ts");
// 2026-09-19 液化搬 GPU 区域程序（第三批）：液化不再是替身叶的住户，改住 preview="region"（RegionStroke W + bakeStamps 写回链）。
//   下面「液化引擎全程」一节保留为第一户集成锚，但写靶换 RegionStroke、session 换 "region"（真 deps：GlRoom(SoftGl2Port) + RasterService）。
import { SoftGl2Port } from "../src/backend/soft-gl2-port.ts";
import { GlRoom } from "../src/backend/gl/gl-room.ts";
import { RasterService } from "../src/backend/gl/raster-service.ts";
import { RegionStroke } from "../src/backend/gl/region-stroke.ts";
const ROOM = new GlRoom(new SoftGl2Port(), 64);
const RASTER = new RasterService(ROOM);

const _rigs = [];
function rig() {
  const undo = new UndoStack({ maxQuotaBytes: 1 << 30 });
  const wp2 = new PaintingWorkpiece({ undo, tree: { width: 64, height: 64 }, onTokenLeak: () => {} });
  const doc = new PaintingView(wp2);
  const r = { undo, wp2, doc, layer: doc.layers[0], committed: [], gpuCommit: false, selection: null, shadow: null, shadows: [] };
  r.deps = {
    begin: (label) => wp2.begin(label),
    tokenChanged: (id) => wp2.layerTiles.tokenChanged(id),
    tokenBeforeImage: (id) => wp2.layerTiles.tokenBeforeImage(id),
    getSelection: () => r.selection,
    commitStamps: (cs) => { r.committed.push(cs); return r.gpuCommit; },
    invalidate: () => {},
    setShadows: (entries) => { r.shadows = entries.slice(); r.shadow = entries.length ? entries[0] : null; },
    // region 预览宿（液化）：真 RegionStroke + bakeStamps 写回
    openRegion: (leaf, opts) => {
      const m = r.selection ? r.selection.bboxMask() : null;
      const rs = new RegionStroke(ROOM, leaf.id, leaf.pixels, 64, 64, m ? { data: m.data, ox: m.x, oy: m.y, ow: m.w, oh: m.h } : null, { lockAlpha: !!leaf.lockAlpha, snapshot: !!opts?.snapshot });
      r.regionLeaf.set(rs, leaf);
      return rs;
    },
    setRegions: (regs) => { r.regions = regs.slice(); },
    commitRegion: (rs) => {
      const leaf = r.regionLeaf.get(rs); r.regionLeaf.delete(rs);
      const ov = rs.overlay();
      if (ov.bw <= 0 || ov.bh <= 0) return true;
      return RASTER.bakeStamps(leaf.id, leaf.pixels, ov, 64, 64, (px, x, y, w, h) => leaf.applyRegionDiff(x, y, w, h, px));
    },
  };
  r.regions = []; r.regionLeaf = new Map();
  _rigs.push(r);
  return r;
}
const SPEC = { historyType: "stroke", finalize: true };
const SPEC_FB = { historyType: "stroke", finalize: false };   // filterBrush：begin 已吃 selection
const pixelBrush = () => resolveBrush({ size: 4, color: "#ff0000", spacing: 0.5, preset: { pixelMode: true } });

// 无令牌 fixture 灌入：C7 硬化后必须走显式声明态（seedWrite = collector suspend 窗）。
function fill(layer, x, y, w, h, rgba) {
  const img = new ImageData(w, h);
  for (let i = 0; i < w * h; i++) img.data.set(rgba, i * 4);
  seedWrite(layer, () => layer.putImageData(x, y, img));
}

describe("stroke-shadow · 替身叶生命周期（真层描边期零写）", () => {
  it("begin 挂替身（board 注入 + 内容=真层克隆）；描边写替身，真层不动；end 落账一步", () => {
    const r = rig();
    fill(r.layer, 0, 0, 8, 8, [0, 128, 0, 255]);   // 底料：左上绿块
    const eng = new BrushEngine();
    const s = new StrokeSession(r.deps, eng, [r.layer], SPEC, "shadow");
    assert(r.shadow && r.shadow.layerId === r.layer.id, "begin 即挂 board 替身（layerId 正确）");
    eq(r.shadow.pixels.sampleAt(2, 2)[1], 128, "替身内容 = 真层克隆（底料可见）");
    eng.beginStroke(s.targets[0], pixelBrush(), 8, 30, 1.0, "brush");
    s.extend(40, 30, 1.0, null);
    assert(s.targets[0].sampleAt(20, 30)[3] > 0, "描边写进替身");
    eq(r.layer.sampleAt(20, 30)[3], 0, "真层描边期零写");
    const d0 = r.undo.depth();
    s.end();
    eq(r.shadow, null, "end 摘掉 board 替身");
    assert(r.layer.sampleAt(20, 30)[3] > 0, "收口后真层 = 替身内容（句柄 diff 落账）");
    eq(r.layer.sampleAt(20, 30)[0], 255, "落账字节正确（红）");
    eq(r.layer.sampleAt(2, 2)[1], 128, "未触 tile 原样（底料不动）");
    eq(r.undo.depth(), d0 + 1, "一步入栈");
    r.undo.undo();
    eq(r.layer.sampleAt(20, 30)[3], 0, "undo 还原笔迹");
    eq(r.layer.sampleAt(2, 2)[1], 128, "undo 不伤底料（undo 包只含真变 tile）");
    r.undo.redo();
    assert(r.layer.sampleAt(20, 30)[3] > 0, "redo 重演");
  });

  it("cancel：丢替身零回滚，真层无痕、不占步、board 替身摘掉", () => {
    const r = rig();
    const eng = new BrushEngine();
    const s = new StrokeSession(r.deps, eng, [r.layer], SPEC, "shadow");
    eng.beginStroke(s.targets[0], pixelBrush(), 8, 8, 1.0, "brush");
    s.extend(30, 8, 1.0, null);
    assert(s.targets[0].sampleAt(16, 8)[3] > 0, "替身已有笔迹");
    eq(r.layer.sampleAt(16, 8)[3], 0, "真层零写");
    const d0 = r.undo.depth();
    s.cancel();
    eq(r.shadow, null, "cancel 摘掉 board 替身");
    eq(r.layer.sampleAt(16, 8)[3], 0, "真层无痕");
    eq(r.undo.depth(), d0, "不占步（替身扣押 seal 作废）");
  });

  it("no-op：替身零写 → end 不占步", () => {
    const r = rig();
    const eng = new BrushEngine();
    const s = new StrokeSession(r.deps, eng, [r.layer], SPEC, "shadow");
    eng.beginStroke(s.targets[0], resolveBrush({ size: 4, color: "#ff0000", spacing: 0.5 }), -99, -99, 0, "brush");
    // buffered begin 不写像素；不 extend 直接抬笔（gpuCommit=false 且无 stamps 落 substrate）
    const d0 = r.undo.depth();
    s.end();
    eq(r.undo.depth(), d0, "no-op 不占步");
  });

  it("擦空 tile 回收：替身里被擦空的格收口时同步清掉真层", () => {
    const r = rig();
    fill(r.layer, 0, 0, 8, 8, [200, 0, 0, 255]);
    const eng = new BrushEngine();   // 占位引擎（本锚直接操作替身面）
    const s = new StrokeSession(r.deps, eng, [r.layer], SPEC_FB, "shadow");
    eng.beginStroke(s.targets[0], pixelBrush(), 60, 60, 1.0, "brush");   // 引擎在别处起笔（不触底料）
    // 模拟「内容被推走/擦空」：替身上把底料区写全透明 → 该 tile 在替身中被回收
    s.targets[0].putImageData(0, 0, new ImageData(8, 8));
    eq(s.targets[0].sampleAt(2, 2)[3], 0, "替身该区已空");
    eq(r.layer.sampleAt(2, 2)[0], 200, "真层未动");
    s.end();
    eq(r.layer.sampleAt(2, 2)[3], 0, "收口后真层同步清空（删格路径）");
    r.undo.undo();
    eq(r.layer.sampleAt(2, 2)[0], 200, "undo 还原被清内容");
  });

  it("finalize 次序：shadow 落账后按选区兜底（选区外回滚，整笔一步）", () => {
    const r = rig();
    r.selection = Selection.fromGray8Region(0, 0, 32, 64, new Uint8Array(32 * 64).fill(255));   // 左半
    const eng = new BrushEngine();
    const s = new StrokeSession(r.deps, eng, [r.layer], SPEC, "shadow");
    eng.beginStroke(s.targets[0], pixelBrush(), 8, 8, 1.0, "brush");
    s.extend(56, 8, 1.0, null);   // 横穿选区边界（x=32）
    eq(r.layer.sampleAt(50, 8)[3], 0, "描边期真层零写（选区外也没写）");
    const d0 = r.undo.depth();
    s.end();
    assert(r.layer.sampleAt(8, 8)[3] > 0, "选区内落账保留");
    eq(r.layer.sampleAt(50, 8)[3], 0, "选区外被 finalize 兜掉");
    eq(r.undo.depth(), d0 + 1, "落账+兜底同一令牌一步");
    r.undo.undo();
    eq(r.layer.sampleAt(8, 8)[3], 0, "undo 整笔还原");
  });
});

const SPEC_LQ = { historyType: "stroke", finalize: false, regionSnapshot: true };   // 液化：W₀ 起笔快照
describe("stroke-shadow · 液化引擎全程 region 预览（第一户集成锚；2026-09-19 起写靶 = RegionStroke）", () => {
  it("液化 push：描边期真层不动，收口像素=替身、一步 undo 可还原", () => {
    const r = rig();
    fill(r.layer, 20, 20, 12, 12, [0, 0, 255, 255]);   // 蓝块
    const before = r.layer.pixels.getRegion(0, 0, 64, 64);
    const eng = new LiquifyEngine();
    const s = new StrokeSession(r.deps, eng, [r.layer], SPEC_LQ, "region");
    eq(r.regions.length, 1, "begin 即挂 board region");
    eng.beginStroke([s.targets[0]], { size: 16, strength: 2, mode: "push", bleed: "edge", sample: "bilinear" }, 22, 26, null);
    eng.extendStroke(30, 26);
    eng.extendStroke(38, 26);
    const shadowBytes = s.targets[0].readPixels(0, 0, 64, 64);   // W（doc 尺寸 straight u8）
    let moved = false;
    for (let i = 0; i < shadowBytes.length && !moved; i++) if (shadowBytes[i] !== before[i]) moved = true;
    assert(moved, "液化确实改了替身像素");
    const during = r.layer.pixels.getRegion(0, 0, 64, 64);
    for (let i = 0; i < during.length; i++) if (during[i] !== before[i]) { assert(false, "描边期真层被写（违约）"); break; }
    const d0 = r.undo.depth();
    s.end();
    const after = r.layer.pixels.getRegion(0, 0, 64, 64);
    for (let i = 0; i < after.length; i++) {
      if (after[i] !== shadowBytes[i]) { assert(false, `收口后真层 ≠ 替身（i=${i}）`); break; }
    }
    eq(r.undo.depth(), d0 + 1, "一笔一步");
    eq(r.regions.length, 0, "收口 region 撤下");
    r.undo.undo();
    const undone = r.layer.pixels.getRegion(0, 0, 64, 64);
    for (let i = 0; i < undone.length; i++) {
      if (undone[i] !== before[i]) { assert(false, `undo 未还原（i=${i}）`); break; }
    }
    assert(true, "液化全程 region：真层字节 = W，一步 undo 还原");
  });

  it("液化 cancel：真层字节逐位不变（丢替身即无痕）", () => {
    const r = rig();
    fill(r.layer, 20, 20, 12, 12, [0, 0, 255, 255]);
    const before = r.layer.pixels.getRegion(0, 0, 64, 64);
    const eng = new LiquifyEngine();
    const s = new StrokeSession(r.deps, eng, [r.layer], SPEC_LQ, "region");
    eng.beginStroke([s.targets[0]], { size: 16, strength: 2, mode: "push", bleed: "edge", sample: "bilinear" }, 22, 26, null);
    eng.extendStroke(34, 26);
    const d0 = r.undo.depth();
    s.cancel();
    eq(r.regions.length, 0, "cancel region 撤下");
    const after = r.layer.pixels.getRegion(0, 0, 64, 64);
    for (let i = 0; i < after.length; i++) if (after[i] !== before[i]) { assert(false, "cancel 后真层变了"); break; }
    eq(r.undo.depth(), d0, "不占步");
  });

  it("收尾：释放本文件的工件资源", () => {
    for (const { undo, wp2 } of _rigs) {
      undo.clear();
      wp2.load({ width: 4, height: 4, nodes: [{ name: "空", visible: true, opacity: 1, mode: "source-over", clippingMask: false, lockAlpha: false, pixels: null }] });
    }
    _rigs.length = 0;
    ROOM.dispose();
    assert(true, "disposed");
  });
});
