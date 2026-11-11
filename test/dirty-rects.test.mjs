// 一帧改到的那几块整理成单子（CatsUp 贴图主线 1-4d 第 6 条；统筹 11-11 判据）。created 2026-11-11 by Claude Opus 5.5
// 内核自己的测试：只 import 内核和测试工具。
import { describe, it, eq, assert } from "./runner.mjs";
import { normalizeDirtyRects, assertDisjoint, RECT_LIST_MAX, RECT_FULL_FRACTION } from "../src/common/dirty-rects.ts";

/** 可复现的随机数。 */
const rng = (seed) => () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
/** 单子盖住的格子是不是盖住了输入的每一格（夹进画布之后）。 */
const covers = (out, input, W, H) => {
  const m = new Uint8Array(W * H);
  for (const r of out) for (let y = r.y; y < r.y + r.h; y++) m.fill(1, y * W + r.x, y * W + r.x + r.w);
  for (const r of input) {
    const x0 = Math.max(0, Math.floor(r.x)), y0 = Math.max(0, Math.floor(r.y)), x1 = Math.min(W, Math.ceil(r.x + r.w)), y1 = Math.min(H, Math.ceil(r.y + r.h));
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) if (!m[y * W + x]) return false;
  }
  return true;
};

describe("一帧改到的那几块（dirty-rects）", () => {
  it("随机输入（重叠的、贴边的、出界的、一帧几百块的）：输出两两不相交、盖住输入的每一格、整数格、在画布里；总面积过半 = full", () => {
    const W = 512, H = 384, R = rng(7);
    let fulls = 0, lists = 0, level2 = 0;
    for (let t = 0; t < 300; t++) {
      const many = t % 10 === 0, n = many ? 400 + Math.floor(R() * 600) : Math.floor(R() * 30);
      const big = t % 7 === 0;
      // 几百块的那种聚在两三团里（跨片的笔：几团、每团很多小块），别的散在整张上（含出界的）
      const cx = [R() * W, R() * W, R() * W], cy = [R() * H, R() * H, R() * H];
      const input = Array.from({ length: n }, (_, i) => many
        ? { x: cx[i % 3] + R() * 60 - 30, y: cy[i % 3] + R() * 60 - 30, w: 3 * R() + 0.5, h: 3 * R() + 0.5 }
        : { x: R() * (W + 40) - 20, y: R() * (H + 40) - 20, w: (big ? 120 : 12) * R() + 0.5, h: (big ? 120 : 12) * R() + 0.5 });
      const st = {}, out = normalizeDirtyRects(input, W, H, st);
      if (out === "full") { fulls++; let a = 0; for (const r of input) a += r.w * r.h; continue; }
      lists++; if (st.level === 2) level2++;
      assertDisjoint(out);
      for (const r of out) assert(Number.isInteger(r.x) && Number.isInteger(r.w) && r.x >= 0 && r.y >= 0 && r.x + r.w <= W && r.y + r.h <= H && r.w > 0 && r.h > 0, `方框在画布里、整数：${JSON.stringify(r)}`);
      assert(covers(out, input, W, H), `第 ${t} 组：单子没盖住输入的某一格`);
      let total = 0; for (const r of out) total += r.w * r.h;
      assert(total <= RECT_FULL_FRACTION * W * H, "单子的总面积没过半（过半应该是 full）");
    }
    assert(fulls > 0 && lists > 100 && level2 > 0, `两种结果、两级都走到了：full ${fulls}、单子 ${lists}、走桶 ${level2}`);
  });
  it("隔得远的两团不并；挨着的并成一块；相交的必并", () => {
    const far = normalizeDirtyRects([{ x: 0, y: 0, w: 10, h: 10 }, { x: 400, y: 300, w: 10, h: 10 }], 512, 384);
    eq(far.length, 2, "远的两块留两块");
    const near = normalizeDirtyRects([{ x: 0, y: 0, w: 10, h: 10 }, { x: 10, y: 0, w: 10, h: 10 }], 512, 384);
    eq(near.length, 1, "挨着的并"); eq(near[0].w, 20);
    const over = normalizeDirtyRects([{ x: 0, y: 0, w: 100, h: 2 }, { x: 50, y: 0, w: 2, h: 100 }], 512, 384);
    assertDisjoint(over);
    eq(normalizeDirtyRects([], 10, 10).length, 0, "空 = 空单子");
  });
  it("块数超过上限走桶：输出块数有上界、两两不相交", () => {
    const W = 1024, H = 1024, input = [];
    for (let i = 0; i < 2000; i++) input.push({ x: 100 + ((i * 37) % 200), y: 600 + ((i * 91) % 150), w: 3, h: 3 });   // 一团里两千个小块
    const st = {}, out = normalizeDirtyRects(input, W, H, st);
    assert(out !== "full", "没过半");
    eq(st.level, 2, "走桶"); assert(out.length <= 32 * 32, `块数 ${out.length} 有上界`);
    assertDisjoint(out);
    assert(RECT_LIST_MAX === 256, "上限 256");
  });
  it("断言：重叠的单子 = 抛", () => {
    let threw = false; try { assertDisjoint([{ x: 0, y: 0, w: 5, h: 5 }, { x: 4, y: 4, w: 5, h: 5 }]); } catch (e) { threw = /OVERLAP/.test(String(e.message)); }
    assert(threw, "抛 DIRTY_RECTS_OVERLAP");
  });
});
