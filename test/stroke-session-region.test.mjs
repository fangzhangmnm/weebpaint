// StrokeSession preview="region" 生命周期锚（created 2026-09-18 by Claude Fable 5.1）。fake deps（RegionStroke 真体在 region-*.test）。
//   ctor：openRegion(叶) → setRegion(region)，targets[0] = region；多叶 → throw 且令牌收口。
//   end：commitRegion 一次 → setRegion(null) → dispose；令牌收口（下一个 begin 可开）。
//   cancel：不 commit、dispose、setRegion(null)、令牌取消。
//   openRegion throw → ctor throw、令牌已收口（单令牌墙不卡死）。commitRegion false → end throw REGION_COMMIT_FAILED、令牌取消、region 已 dispose。
import { describe, it, assert, eq } from "./runner.mjs";
import { UndoStack } from "../src/backend/workpiece/undo-stack.ts";
import { PaintingWorkpiece } from "../src/backend/workpiece/painting-workpiece.ts";
import { PaintingView } from "../src/backend/workpiece/painting-view.ts";
import { StrokeSession } from "../src/backend/stroke-session.ts";

const _rigs = [];
function rig() {
  const undo = new UndoStack({ maxQuotaBytes: 1 << 30 });
  const wp2 = new PaintingWorkpiece({ undo, tree: { width: 64, height: 64 }, onTokenLeak: () => {} });
  const doc = new PaintingView(wp2);
  const r = { undo, wp2, doc, layer: doc.layers[0], opened: [], setRegionCalls: [], commits: [], commitOk: true, openThrows: null, region: null };
  const fakeRegion = () => ({ disposed: 0, overlay() { return { kind: "region", bw: 8, bh: 8 }; }, dispose() { this.disposed++; } });
  r.deps = {
    begin: (label) => wp2.begin(label),
    tokenChanged: (id) => wp2.layerTiles.tokenChanged(id),
    tokenBeforeImage: (id) => wp2.layerTiles.tokenBeforeImage(id),
    getSelection: () => null,
    commitStamps: () => false,
    invalidate: () => {},
    setShadows: () => {},
    openRegion: (leaf) => { r.opened.push(leaf.id); if (r.openThrows) throw new Error(r.openThrows); r.region = fakeRegion(); return r.region; },
    setRegion: (reg) => r.setRegionCalls.push(reg),
    commitRegion: (reg) => { r.commits.push(reg); return r.commitOk; },
  };
  _rigs.push(r);
  return r;
}
const ENGINE = { extendStroke() {}, endStroke() { return null; }, cancelStroke() {}, flushDirty() { return null; } };
const SPEC = { historyType: "stroke", finalize: false };
function tokenFree(r) { let t = null; try { t = r.wp2.begin("probe"); } catch { return false; } t.cancel(); return true; }

describe("stroke-session · region 预览宿", () => {
  it("ctor：openRegion + setRegion；targets[0] = region；end → commit 一次 → setRegion(null) → dispose；令牌收口", () => {
    const r = rig();
    const s = new StrokeSession(r.deps, ENGINE, [r.layer], SPEC, "region");
    eq(r.opened.length, 1); eq(r.opened[0], r.layer.id);
    assert(r.setRegionCalls[0] === r.region, "setRegion(region)");
    assert(s.targets[0] === r.region, "targets[0] = region");
    assert(!tokenFree(r), "描边中令牌占用");
    s.end();
    eq(r.commits.length, 1); assert(r.commits[0] === r.region);
    assert(r.setRegionCalls[r.setRegionCalls.length - 1] === null, "收口 setRegion(null)");
    eq(r.region.disposed, 1);
    assert(tokenFree(r), "收口后令牌释放");
  });
  it("cancel：不 commit、dispose、setRegion(null)、令牌取消", () => {
    const r = rig();
    const s = new StrokeSession(r.deps, ENGINE, [r.layer], SPEC, "region");
    s.cancel();
    eq(r.commits.length, 0); eq(r.region.disposed, 1);
    assert(r.setRegionCalls[r.setRegionCalls.length - 1] === null);
    assert(tokenFree(r));
  });
  it("openRegion throw（caps 守卫 / 显存）→ ctor throw 且令牌已收口；多叶 → throw", () => {
    const r = rig();
    r.openThrows = "REGION_NO_FLOAT_FBO";
    let msg = "";
    try { new StrokeSession(r.deps, ENGINE, [r.layer], SPEC, "region"); } catch (e) { msg = String(e); }
    assert(/REGION_NO_FLOAT_FBO/.test(msg), "错误冒出");
    assert(tokenFree(r), "令牌不卡死");
    const r2 = rig();
    let threw = false;
    try { new StrokeSession(r2.deps, ENGINE, [r2.layer, r2.layer], SPEC, "region"); } catch { threw = true; }
    assert(threw, "多叶应 throw"); assert(tokenFree(r2));
  });
  it("commitRegion false → end throw REGION_COMMIT_FAILED；region 已 dispose；令牌取消", () => {
    const r = rig();
    r.commitOk = false;
    const s = new StrokeSession(r.deps, ENGINE, [r.layer], SPEC, "region");
    let msg = "";
    try { s.end(); } catch (e) { msg = String(e); }
    assert(/REGION_COMMIT_FAILED/.test(msg), "应响亮");
    eq(r.region.disposed, 1);
    assert(tokenFree(r), "令牌已取消");
  });
});
