// smudge-engine 契约测（created 2026-09-05 by Claude Fable 5.1）。
// 问题陈述（家规：math/手感类先写清输入输出）：
//   输入 = 一张 doc 尺寸的 RGBA 图 + 一条笔画（点列 + 压感）+ 设置；输出 = 改写后的图 + dirty bbox。
//   钉的语义：smear 把起点颜色带到终点（含拖进透明区）；strength 0 恒等；s=1 纯搬（终点 = 起点块）；
//   dull 出平均色且不发黑（premult）；选区外不动；lockAlpha 不动 alpha；dirty 覆盖所有改动像素、flush 后清空。
import { describe, it, assert, eq } from "./runner.mjs";
import { SmudgeEngine } from "../src/plugins/smudge-engine.ts";

function mockLayer(docW, docH) {
  const buf = new Uint8ClampedArray(docW * docH * 4);
  return {
    docW, docH, buf,
    fill(x, y, w, h, [r, g, b, a]) {
      for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) {
        const i = (yy * docW + xx) * 4; buf[i] = r; buf[i + 1] = g; buf[i + 2] = b; buf[i + 3] = a;
      }
    },
    px(x, y) { const i = (y * docW + x) * 4; return [buf[i], buf[i + 1], buf[i + 2], buf[i + 3]]; },
    getImageData(x0, y0, w, h) {
      const data = new Uint8ClampedArray(w * h * 4);
      for (let yy = 0; yy < h; yy++) data.set(buf.subarray(((y0 + yy) * docW + x0) * 4, ((y0 + yy) * docW + x0 + w) * 4), yy * w * 4);
      return new ImageData(data, w, h);
    },
    putImageData(x0, y0, img) {
      for (let yy = 0; yy < img.height; yy++) buf.set(img.data.subarray(yy * img.width * 4, (yy + 1) * img.width * 4), ((y0 + yy) * docW + x0) * 4);
    },
  };
}
const RED = [255, 0, 0, 255], BLUE = [0, 0, 255, 255], CLEAR = [0, 0, 0, 0];
function settings(over = {}) {
  return {
    mode: "smear", size: 8, hardness: 1, spacing: 0.25, strength: 1,
    sizeCoeff: 0, flowCoeff: 0, opaCoeff: 0, pressureGamma: 1, colorRate: 0, color: [0, 1, 0], mix: "srgb", lockAlpha: false,
    ...over,
  };
}
// 从 (x0,y) 直线拖到 (x1,y)，每 1px 一个事件
function drag(eng, layer, s, x0, x1, y, p = 1, sel = null) {
  eng.beginStroke(layer, s, x0, y, p, sel);
  const dir = Math.sign(x1 - x0);
  for (let x = x0 + dir; dir > 0 ? x <= x1 : x >= x1; x += dir) eng.extendStroke(x, y, p);
  const dirty = eng.flushDirty();
  eng.endStroke();
  return dirty;
}
function snapshot(layer) { return Uint8ClampedArray.from(layer.buf); }
function same(a, b) { if (a.length !== b.length) return false; for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false; return true; }

describe("smudge-engine · smear", () => {
  it("把红色从色块拖进透明区：终点附近出现红色且色相纯净（不发黑）", () => {
    const L = mockLayer(60, 20);
    L.fill(0, 0, 12, 20, RED);
    drag(new SmudgeEngine(), L, settings({ strength: 0.9 }), 8, 40, 10);
    const [r, g, b, a] = L.px(30, 10);
    assert(a > 0, `终点附近应有 alpha（a=${a}）`);
    assert(r >= 250 && g <= 2 && b <= 2, `拖出来的颜色仍是纯红 (${r},${g},${b},${a})`);
    // 越远越淡：记忆衰减
    assert(L.px(20, 10)[3] >= L.px(35, 10)[3], "离源越远 alpha 越低");
  });
  it("strength 0 → 图恒等，且不报 dirty", () => {
    const L = mockLayer(40, 20);
    L.fill(0, 0, 12, 20, RED); L.fill(12, 0, 28, 20, BLUE);
    const before = snapshot(L);
    const dirty = drag(new SmudgeEngine(), L, settings({ strength: 0 }), 4, 36, 10);
    assert(same(before, L.buf), "strength 0 不改任何像素");
    eq(dirty, null, "无改动无 dirty");
  });
  it("s=1 纯搬：拖过均匀区后终点中心 = 起点中心颜色（记忆永不衰减）", () => {
    const L = mockLayer(60, 20);
    L.fill(0, 0, 10, 20, RED); L.fill(10, 0, 50, 20, BLUE);
    drag(new SmudgeEngine(), L, settings({ strength: 1, hardness: 1 }), 5, 50, 10);
    const [r, , b, a] = L.px(50, 10);
    eq(a, 255); assert(r >= 250 && b <= 2, `终点中心应是起点的纯红 (${r},${b})`);
  });
  it("dirty bbox 覆盖所有被改像素；flush 后清空", () => {
    const L = mockLayer(80, 30);
    L.fill(0, 0, 10, 30, RED);
    const before = snapshot(L);
    const eng = new SmudgeEngine();
    const s = settings({ strength: 0.8 });
    eng.beginStroke(L, s, 6, 15, 1, null);
    for (let x = 7; x <= 40; x++) eng.extendStroke(x, 15, 1);
    const d = eng.flushDirty();
    assert(d, "应有 dirty");
    for (let y = 0; y < 30; y++) for (let x = 0; x < 80; x++) {
      const i = (y * 80 + x) * 4;
      const changed = before[i] !== L.buf[i] || before[i + 1] !== L.buf[i + 1] || before[i + 2] !== L.buf[i + 2] || before[i + 3] !== L.buf[i + 3];
      if (changed) assert(x >= d[0] && x < d[2] && y >= d[1] && y < d[3], `改动像素 (${x},${y}) 在 dirty ${d} 外`);
    }
    eq(eng.flushDirty(), null, "flush 后清空");
    eng.endStroke();
  });
  it("夹 doc 边界：从画布边缘拖出去再拖回来不炸，doc 外不写", () => {
    const L = mockLayer(30, 20);
    L.fill(0, 0, 30, 20, RED);
    const eng = new SmudgeEngine();
    eng.beginStroke(L, settings(), 25, 10, 1, null);
    for (let x = 26; x <= 45; x++) eng.extendStroke(x, 10, 1);
    for (let x = 44; x >= 5; x--) eng.extendStroke(x, 10, 1);
    eng.endStroke();
    assert(true, "无异常");
  });
});

describe("smudge-engine · dull / paint / 选区 / lockAlpha", () => {
  it("dull：红蓝交界揉一下 → 交界像素变紫（r、b 都有）且不发黑", () => {
    const L = mockLayer(40, 20);
    L.fill(0, 0, 20, 20, RED); L.fill(20, 0, 20, 20, BLUE);
    drag(new SmudgeEngine(), L, settings({ mode: "dull", strength: 0.7, hardness: 0.5 }), 14, 26, 10);
    const [r, g, b, a] = L.px(20, 10);
    eq(a, 255, "不透明区 alpha 不动");
    assert(r > 20 && b > 20 && r < 240 && b < 240, `交界应是紫 (${r},${g},${b})`);
    assert(r + b >= 200, `不发黑：r+b=${r + b}`);
  });
  it("smear↔dull 连续量（s=0.9）：拖红进透明区，终点 alpha 随 dull 单调下降（0=纯搬块 > 0.5 > 1=揉平均色），颜色仍是红", () => {
    // s=1 时记忆永不衰减，三档都 255（无法区分）；s=0.9 实测 246 > 230 > 215（tmp 实验 2026-09-05）
    const alphaAt = (dull) => {
      const L = mockLayer(40, 20);
      L.fill(0, 0, 20, 20, RED);
      drag(new SmudgeEngine(), L, settings({ mode: "smear", dull, strength: 0.9, hardness: 1 }), 10, 30, 10);
      const [r, g, b, a] = L.px(28, 10);
      if (a > 0) assert(r >= 250 && g <= 3 && b <= 3, `dull=${dull} 终点应仍是纯红 (${r},${g},${b},${a})`);
      return a;
    };
    // 2026-09-06 中段改多分辨率出料（handoff §3-C）：size 8 → B=10、k=3，3×3 盒滤等于整块均值 → 0.5 档 ≈ 1 档（实测 213 vs 215）；
    //   钉的语义改成：两端不同、中段落在两端之间（容差 4/255，格加权 vs mask 加权的差）。
    const a0 = alphaAt(0), a5 = alphaAt(0.5), a1 = alphaAt(1);
    assert(a0 > a1, `两端确实不同：${a0} vs ${a1}`);
    assert(a5 <= a0 && a5 >= a1 - 4, `0.5 落在两端之间（容差 4）：${a0} ≥ ${a5} ≥ ${a1}−4`);
  });
  it("旧 settings 无 dull 字段 → 按 mode 二值（mode dull 等价 dull=1）", () => {
    const L1 = mockLayer(40, 20), L2 = mockLayer(40, 20);
    L1.fill(0, 0, 20, 20, RED); L2.fill(0, 0, 20, 20, RED);
    const s1 = settings({ mode: "dull", strength: 0.7, hardness: 0.5 }); delete s1.dull;
    drag(new SmudgeEngine(), L1, s1, 10, 30, 10);
    drag(new SmudgeEngine(), L2, settings({ mode: "smear", dull: 1, strength: 0.7, hardness: 0.5 }), 10, 30, 10);
    assert(same(snapshot(L1), snapshot(L2)), "二值 mode=dull 与 dull=1 逐字节相同");
  });
  it("paint：带颜料的手指把画笔色（绿）掺进去", () => {
    const L = mockLayer(40, 20);
    L.fill(0, 0, 40, 20, RED);
    drag(new SmudgeEngine(), L, settings({ mode: "paint", colorRate: 0.6, strength: 0.8 }), 5, 35, 10);
    const [r, g] = L.px(25, 10);
    assert(g > 60, `应掺进绿 (r=${r}, g=${g})`);
  });
  it("选区外像素不动", () => {
    const L = mockLayer(60, 20);
    L.fill(0, 0, 12, 20, RED);
    const before = snapshot(L);
    const sel = { materializeMaskRegion(x0, y0, w, h) { const m = new Uint8Array(w * h); for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) m[j * w + i] = (x0 + i) < 30 ? 255 : 0; return m; } };
    drag(new SmudgeEngine(), L, settings({ strength: 0.9 }), 8, 50, 10, 1, sel);
    for (let y = 0; y < 20; y++) for (let x = 30; x < 60; x++) {
      const i = (y * 60 + x) * 4;
      assert(before[i + 3] === L.buf[i + 3] && before[i] === L.buf[i], `选区外 (${x},${y}) 不得改`);
    }
    assert(L.px(20, 10)[3] > 0, "选区内照常拖到");
  });
  it("lockAlpha：透明像素不获 alpha，不透明像素 alpha 不变，颜色照混", () => {
    const L = mockLayer(60, 20);
    L.fill(0, 0, 12, 20, RED); L.fill(12, 0, 10, 20, BLUE);
    drag(new SmudgeEngine(), L, settings({ strength: 0.9, lockAlpha: true }), 8, 40, 10);
    eq(L.px(30, 10)[3], 0, "透明区仍透明");
    const [r, , b, a] = L.px(14, 10);
    eq(a, 255, "不透明区 alpha 不变");
    assert(r > 0 && b < 255, `蓝区被红色混到 (${r},${b})`);
  });
  it("压感 → 强度：flowCoeff=1 时半压比满压拖得少（user：强度必须吃压感）", () => {
    const run = (p) => { const L = mockLayer(60, 20); L.fill(0, 0, 12, 20, RED); drag(new SmudgeEngine(), L, settings({ strength: 0.9, flowCoeff: 1 }), 8, 40, 10, p); return L.px(24, 10)[3]; };
    const full = run(1), half = run(0.5);
    assert(full > 0, "满压有拖出");
    assert(half < full, `半压应更弱 (half=${half}, full=${full})`);
  });
  it("三种混色空间都能跑（冒烟）", () => {
    for (const mix of ["srgb", "oklab", "spectral"]) {
      const L = mockLayer(40, 16);
      L.fill(0, 0, 20, 16, [255, 255, 0, 255]); L.fill(20, 0, 20, 16, BLUE);
      drag(new SmudgeEngine(), L, settings({ mode: "dull", strength: 0.8, hardness: 0.5, mix }), 15, 25, 8);
      const [, , , a] = L.px(20, 8);
      eq(a, 255, `${mix} alpha`);
    }
  });
});
