// 液化对图层组（2026-08-28，user 0823 组会「液化能对图层组吗」；created by Claude Opus 5 (subagent)）
//
// 问题陈述
//   输入：一个组节点 G（active = 组）+ 一次液化笔画（doc 坐标序列 + size/strength/mode + 可选选区）。
//   输出：组内**每个叶**（含隐藏叶）的像素被**同一个位移场** D 重采样：leaf'[p] = leaf[p − D(p)]；
//        图层结构不变（不 flatten、不动 clip/visible 标志）；整组一步 undo。
//   不变量：D 只由笔画几何 + 笔刷参数决定，与层内容无关 → 天然可共享。
//
// 选定语义（对齐既有的「对组变换」，不发明第三种）：floating-transform.lift(group) =
//   「组 → 组内所有叶（含隐藏）各一 float、共享一个 gizmo、不 flatten」。液化版 = 共享一个
//   dispField、逐叶各自 startSnap 与写靶。等价性数学根据见 liquify-engine.ts 头注
//   （warp 是 gather，与逐像素合成可交换）。
//
// 覆盖：
//   A 引擎面（mock layer，真像素）——多叶共享位移场；组液化 ≡ 逐叶各自单叶液化（最强锚）；
//     空叶不崩不分配；采样核逐叶各自预滤波（spline）。
//   B 事务面（真 workpiece/树/组）——N 个替身叶、一步 undo 整组回退、cancel 无痕、
//     隐藏叶随组动、clip 标志不变。
//   C 路由面（PaintingView.activeStrokeLeaves + FilterBrushEngine 契约）——组能力声明门。
import { describe, it, assert, eq } from "./runner.mjs";
import { seedWrite } from "./helpers.mjs";
import { PaintingWorkpiece } from "../src/backend/workpiece/painting-workpiece.ts";
import { PaintingView } from "../src/backend/workpiece/painting-view.ts";
import { History } from "../src/backend/workpiece/history.ts";
import { LayersFace } from "../src/backend/layers-face.ts";
import { StrokeSession } from "../src/backend/stroke-session.ts";
import { FilterBrushEngine } from "../src/filter-brush.ts";
const { LiquifyEngine } = await import("../src/plugins/liquify-engine.ts");

// ---- A 面用的 mock layer（liquify-docspace-mask.test.mjs 同款：整 doc RGBA 缓冲）----
function mockLayer(docW, docH) {
  const buf = new Uint8ClampedArray(docW * docH * 4);
  const L = {
    docW, docH, bboxX: 0, bboxY: 0, bboxW: 0, bboxH: 0, puts: 0,
    fill(x, y, w, h, [r, g, b, a]) {
      for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) {
        const i = (yy * docW + xx) * 4; buf[i] = r; buf[i + 1] = g; buf[i + 2] = b; buf[i + 3] = a;
      }
      if (!L.bboxW) { L.bboxX = x; L.bboxY = y; L.bboxW = w; L.bboxH = h; }
      else {
        const x1 = Math.max(L.bboxX + L.bboxW, x + w), y1 = Math.max(L.bboxY + L.bboxH, y + h);
        L.bboxX = Math.min(L.bboxX, x); L.bboxY = Math.min(L.bboxY, y);
        L.bboxW = x1 - L.bboxX; L.bboxH = y1 - L.bboxY;
      }
    },
    bytes() { return buf; },
    px(x, y) { const i = (y * docW + x) * 4; return [buf[i], buf[i + 1], buf[i + 2], buf[i + 3]]; },
    snapshotImageData() {
      const { bboxX: x, bboxY: y, bboxW: w, bboxH: h } = L;
      if (!w || !h) return { bboxX: 0, bboxY: 0, bboxW: 0, bboxH: 0, imageData: null };
      const data = new Uint8ClampedArray(w * h * 4);
      for (let yy = 0; yy < h; yy++) data.set(buf.subarray(((y + yy) * docW + x) * 4, ((y + yy) * docW + x + w) * 4), yy * w * 4);
      return { bboxX: x, bboxY: y, bboxW: w, bboxH: h, imageData: { data, width: w, height: h } };
    },
    putImageData(x0, y0, img) {
      L.puts++;
      for (let yy = 0; yy < img.height; yy++) {
        const dy = y0 + yy;
        if (dy < 0 || dy >= docH) continue;
        buf.set(img.data.subarray(yy * img.width * 4, (yy + 1) * img.width * 4), (dy * docW + x0) * 4);
      }
    },
  };
  return L;
}

// 同一条笔画脚本（决定论：引擎无壁钟）
const STROKE = [[70, 40], [86, 46], [100, 44]];
const SETTINGS = { size: 26, strength: 1, mode: "push", bleed: "edge", sample: "bilinear" };
function runStroke(layers, settings = SETTINGS) {
  const eng = new LiquifyEngine();
  eng.beginStroke(layers, settings, STROKE[0][0], STROKE[0][1], null);
  for (let i = 1; i < STROKE.length; i++) eng.extendStroke(STROKE[i][0], STROKE[i][1]);
  eng.endStroke();
}
// alpha 平面（几何比对用：颜色不同、几何必须一样）
function alphaPlane(L, docW, docH) {
  const b = L.bytes(); const out = new Uint8Array(docW * docH);
  for (let i = 0; i < docW * docH; i++) out[i] = b[i * 4 + 3];
  return out;
}
const sameBytes = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);

describe("液化 · 组 = 一个位移场逐叶重采样（A 引擎面）", () => {
  it("同形不同色的两叶：一笔之后 alpha 几何逐像素一致（共享位移场）", () => {
    const W = 160, H = 100;
    const A = mockLayer(W, H), B = mockLayer(W, H);
    A.fill(40, 20, 50, 50, [220, 30, 30, 255]);
    B.fill(40, 20, 50, 50, [30, 60, 220, 255]);   // 同形状、不同色
    runStroke([A, B]);
    assert(sameBytes(alphaPlane(A, W, H), alphaPlane(B, W, H)), "两叶被同一位移场推 → alpha 几何全等");
    // 真被推动过（否则上面的相等是平凡真）
    assert(!sameBytes(alphaPlane(A, W, H), (() => {
      const C = mockLayer(W, H); C.fill(40, 20, 50, 50, [220, 30, 30, 255]); return alphaPlane(C, W, H);
    })()), "内容确实被推动（不是 no-op）");
  });

  it("组液化 ≡ 逐叶各自单叶液化：每叶字节与单独液化逐位相同（最强锚）", () => {
    const W = 160, H = 100;
    const mk = (color) => { const L = mockLayer(W, H); L.fill(40, 20, 50, 50, color); return L; };
    const red = [220, 30, 30, 255], blue = [30, 60, 220, 255];
    // 单叶各跑一次
    const soloA = mk(red), soloB = mk(blue);
    runStroke([soloA]); runStroke([soloB]);
    // 同两叶作为一个组一次跑完
    const grpA = mk(red), grpB = mk(blue);
    runStroke([grpA, grpB]);
    assert(sameBytes(grpA.bytes(), soloA.bytes()), "组内叶 A ≡ 单叶 A");
    assert(sameBytes(grpB.bytes(), soloB.bytes()), "组内叶 B ≡ 单叶 B");
  });

  it("内容位置不同的两叶各推各的（共享场，不是把内容对齐/拍平）", () => {
    const W = 160, H = 100;
    const A = mockLayer(W, H), B = mockLayer(W, H);
    A.fill(50, 30, 30, 30, [220, 30, 30, 255]);
    B.fill(90, 30, 30, 30, [30, 60, 220, 255]);
    runStroke([A, B]);
    // 各自颜色不串台（逐叶独立源；拍平会互相污染）
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const pa = A.px(x, y), pb = B.px(x, y);
      if (pa[3] > 8) assert(pa[2] < 120, `A 出现了 B 的蓝 @${x},${y} = ${pa}`);
      if (pb[3] > 8) assert(pb[0] < 120, `B 出现了 A 的红 @${x},${y} = ${pb}`);
    }
  });

  it("组内空叶：不崩、不写、笔前无像素的叶仍然全空（不白分配 tile）", () => {
    const W = 128, H = 96;
    const A = mockLayer(W, H); A.fill(40, 20, 40, 40, [220, 30, 30, 255]);
    const empty = mockLayer(W, H);
    runStroke([A, empty]);
    eq(empty.puts, 0, "空叶一次 putImageData 都不该发生");
    assert(empty.bytes().every((v) => v === 0), "空叶仍然全空");
    assert(A.puts > 0, "有内容的叶照常写");
  });

  it("spline 采样核：逐叶各自预滤波（组内每叶一份 splinePlane，不共用错源）", () => {
    const W = 128, H = 96;
    const A = mockLayer(W, H), B = mockLayer(W, H);
    A.fill(30, 20, 40, 40, [220, 30, 30, 255]);
    B.fill(30, 20, 40, 40, [30, 60, 220, 255]);
    const s = { ...SETTINGS, sample: "spline" };
    const soloA = mockLayer(W, H); soloA.fill(30, 20, 40, 40, [220, 30, 30, 255]);
    runStroke([soloA], s);
    runStroke([A, B], s);
    assert(sameBytes(A.bytes(), soloA.bytes()), "spline 组内叶 ≡ 单叶");
  });

  it("空列表 = 响亮拒绝（不静默 no-op）", () => {
    const eng = new LiquifyEngine();
    let threw = false;
    try { eng.beginStroke([], SETTINGS, 10, 10, null); } catch { threw = true; }
    assert(threw, "beginStroke([]) 必须 throw");
  });
});

// ---- B 面：真 workpiece + 树 + 组 + StrokeSession（令牌 / 替身 / undo）----
const _ctxs = [];
function rig() {
  const h = new History({ maxQuotaBytes: 1 << 30 });
  const wp2 = new PaintingWorkpiece({ undo: h.stack, tree: { width: 128, height: 128 }, onTokenLeak: () => {} });
  const doc = new PaintingView(wp2);
  h.attach(wp2);
  const lt = new LayersFace({ history: h, tree: wp2.layerTree, tiles: wp2.layerTiles, port: doc, status: () => {} });
  const r = { h, wp2, doc, lt, shadows: [] };
  r.deps = {
    begin: (label) => wp2.begin(label),
    tokenChanged: (id) => wp2.layerTiles.tokenChanged(id),
    tokenBeforeImage: (id) => wp2.layerTiles.tokenBeforeImage(id),
    getSelection: () => doc.selection,
    commitStamps: () => false,
    invalidate: () => {},
    setShadows: (entries) => { r.shadows = entries.slice(); },
  };
  _ctxs.push(r);
  return r;
}
const SPEC_FB = { historyType: "stroke", finalize: false };   // filterBrush：begin 已吃 selection
function paintRect(L, x0, y0, w, h, rgba) {
  const buf = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) buf.set(rgba, i * 4);
  seedWrite(L, () => L.pixels.putRegion(x0, y0, w, h, buf));   // 令牌外初态种子（C7 硬化显式态）
}
// 组 fixture：底层 L1（红）+ 上层 L2（蓝，隐藏）+ L3（绿，clip）全在一个组里；组外留一层。
function groupRig() {
  const r = rig();
  const { doc, lt } = r;
  const L1 = doc.activeLayer;
  paintRect(L1, 20, 20, 40, 40, [220, 30, 30, 255]);
  const L2 = lt.addLayer("隐藏叶").layer;
  paintRect(L2, 20, 20, 40, 40, [30, 60, 220, 255]);
  const L3 = lt.addLayer("clip 叶").layer;
  paintRect(L3, 20, 20, 40, 40, [30, 200, 60, 255]);
  lt.setLayerProp(L2.id, "visible", false);
  lt.setLayerProp(L3.id, "clippingMask", true);
  lt.setActive(L3.id);
  const g = lt.addGroup("组");
  lt.moveIntoGroup(L3.id, g.groupId, {});
  lt.moveIntoGroup(L2.id, g.groupId, {});
  lt.moveIntoGroup(L1.id, g.groupId, {});
  lt.addLayer("组外留守");
  lt.setActive(g.groupId);
  // 就地挂字段（**不能 spread 复制**：deps.setShadows 写的是原对象，复制品看不见 shadow 变化）
  r.gid = g.groupId;
  r.ids = [L1.id, L2.id, L3.id];
  return r;
}
const leafOf = (doc, id) => doc.findLayer(id);
const regionOf = (L) => L.pixels.getRegion(0, 0, 128, 128);

describe("液化 · 组 = 一个令牌一步 undo（B 事务面）", () => {
  it("组液化：N 个替身叶挂上、抬笔逐叶落账、整组一步 undo/redo", () => {
    const r = groupRig();
    const { doc, ids } = r;
    const before = ids.map((id) => regionOf(leafOf(doc, id)));
    const targetsIn = doc.activeStrokeLeaves({ allowGroup: true }).leaves;
    eq(targetsIn.length, 3, "组内 3 叶全进写靶（含隐藏叶）");

    const eng = new LiquifyEngine();
    const s = new StrokeSession(r.deps, eng, targetsIn, SPEC_FB, "shadow");
    eq(r.shadows.length, 3, "一叶一个替身叶挂上 board");
    eq(new Set(r.shadows.map((e) => e.layerId)).size, 3, "替身按叶 id 各一份");
    // 描边期真叶零写（替身承载预览）
    eng.beginStroke(s.targets, { size: 24, strength: 1.5, mode: "push", bleed: "edge", sample: "bilinear" }, 30, 40, null);
    s.extend(70, 40, 1, null);
    for (let i = 0; i < ids.length; i++) {
      assert(sameBytes(regionOf(leafOf(doc, ids[i])), before[i]), `描边中真叶 ${i} 零写`);
    }
    const d0 = r.h.stack.depth();
    s.end();
    eq(r.shadows.length, 0, "收口后替身撤下");
    eq(r.h.stack.depth(), d0 + 1, "整组一步 undo（一个令牌）");
    const after = ids.map((id) => regionOf(leafOf(doc, id)));
    for (let i = 0; i < ids.length; i++) {
      assert(!sameBytes(after[i], before[i]), `叶 ${i} 真被液化（含隐藏叶 / clip 叶）`);
    }
    r.h.stack.undo();
    for (let i = 0; i < ids.length; i++) {
      assert(sameBytes(regionOf(leafOf(doc, ids[i])), before[i]), `undo 一步还原叶 ${i}`);
    }
    r.h.stack.redo();
    for (let i = 0; i < ids.length; i++) {
      assert(sameBytes(regionOf(leafOf(doc, ids[i])), after[i]), `redo 重演叶 ${i}`);
    }
  });

  it("组液化 cancel：三叶全无痕、不占 undo 步", () => {
    const r = groupRig();
    const { doc, ids } = r;
    const before = ids.map((id) => regionOf(leafOf(doc, id)));
    const targets = doc.activeStrokeLeaves({ allowGroup: true }).leaves;
    const eng = new LiquifyEngine();
    const s = new StrokeSession(r.deps, eng, targets, SPEC_FB, "shadow");
    eng.beginStroke(s.targets, { size: 24, strength: 1.5, mode: "push", bleed: "edge", sample: "bilinear" }, 30, 40, null);
    s.extend(70, 40, 1, null);
    const d0 = r.h.stack.depth();
    s.cancel();
    eq(r.h.stack.depth(), d0, "cancel 不占步");
    eq(r.shadows.length, 0, "替身撤下");
    for (let i = 0; i < ids.length; i++) {
      assert(sameBytes(regionOf(leafOf(doc, ids[i])), before[i]), `cancel 后叶 ${i} 无痕`);
    }
  });

  it("结构不动：液化不改 visible / clippingMask / 树形（不 flatten）", () => {
    const r = groupRig();
    const { doc, ids, gid } = r;
    const targets = doc.activeStrokeLeaves({ allowGroup: true }).leaves;
    const eng = new LiquifyEngine();
    const s = new StrokeSession(r.deps, eng, targets, SPEC_FB, "shadow");
    eng.beginStroke(s.targets, { size: 24, strength: 1.5, mode: "push", bleed: "edge", sample: "bilinear" }, 30, 40, null);
    s.extend(70, 40, 1, null);
    s.end();
    const g = doc.findLayer(gid);
    assert(g && g.isGroup, "组还是组");
    eq(g.children.length, 3, "组内仍 3 叶（没被拍平）");
    eq(leafOf(doc, ids[1]).visible, false, "隐藏叶仍隐藏");
    eq(leafOf(doc, ids[2]).clippingMask, true, "clip 叶仍 clip");
  });
});

// ---- C 面：路由/能力门 ----
describe("液化 · 组能力门（C 路由面）", () => {
  it("activeStrokeLeaves：allowGroup=false 时组仍硬拒（其余笔类语义逐字不变）", () => {
    const r = groupRig();
    const noGroup = r.doc.activeStrokeLeaves({ allowGroup: false });
    eq(noGroup.leaves.length, 0);
    eq(noGroup.reason, "group", "画笔/橡皮在组上照旧报 group");
  });

  it("activeStrokeLeaves：单叶 active → 恒 [叶]（与 activeEditableLeaf 同义）", () => {
    const r = groupRig();
    r.lt.setActive(r.ids[0]);
    const one = r.doc.activeStrokeLeaves({ allowGroup: true });
    eq(one.leaves.length, 1);
    eq(one.leaves[0].id, r.ids[0]);
    eq(one.reason, null);
  });

  it("activeStrokeLeaves：隐藏组软拒 hidden；空组拒 group", () => {
    const r = groupRig();
    r.lt.setLayerProp(r.gid, "visible", false);
    eq(r.doc.activeStrokeLeaves({ allowGroup: true }).reason, "hidden", "隐藏组不盲改");
    r.lt.setLayerProp(r.gid, "visible", true);
    // 空组：另起一个不放东西的组
    const g2 = r.lt.addGroup("空组");
    r.lt.setActive(g2.groupId);
    const empty = r.doc.activeStrokeLeaves({ allowGroup: true });
    eq(empty.leaves.length, 0);
    eq(empty.reason, "group", "空组没叶可写 → 照旧提示选图层");
  });

  it("FilterBrushEngine：没声明 supportsLayerGroup 的 filter 收到多叶 = 响亮拒绝", () => {
    const fbe = new FilterBrushEngine();
    const single = { id: "fake-single", beginBrushStroke: () => ({}), extendBrushStamp: () => {} };
    const multi = { id: "fake-multi", supportsLayerGroup: true, beginBrushStroke: (ls) => ({ n: ls.length }), extendBrushStamp: () => {} };
    const leaves = [{}, {}];
    let threw = false;
    try { fbe.beginStroke(leaves, single, {}, {}, null, 0, 0, 1); } catch { threw = true; }
    assert(threw, "单叶 filter 吃多叶必须 throw（不许静默只处理第一叶）");
    assert(!fbe.isActive(), "拒绝后不留活动 handle");
    fbe.beginStroke(leaves, multi, {}, {}, null, 0, 0, 1);
    assert(fbe.isActive(), "声明了组能力的 filter 照常起笔");
    fbe.endStroke();
    let threwEmpty = false;
    try { fbe.beginStroke([], multi, {}, {}, null, 0, 0, 1); } catch { threwEmpty = true; }
    assert(threwEmpty, "空写靶列表必须 throw");
  });

  it("LiquifyFilter 声明了组能力（能力位是 UI/路由的唯一开关）", async () => {
    const { LiquifyFilter } = await import("../src/plugins/liquify.ts");
    eq(LiquifyFilter.supportsLayerGroup, true);
  });
});

// 测试卫生：统一释放（防 tile-pool FR 泄漏 assert 刷屏；float-ops.test.mjs 同款）
describe("液化组 收尾", () => {
  it("清栈并释放本文件的工件资源", () => {
    for (const { h, doc } of _ctxs) { h.clear(); doc.clearSelectionOnLoad(); }
    _ctxs.length = 0;
    assert(true, "disposed");
  });
});
