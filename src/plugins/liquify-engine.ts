// 液化引擎 —— **GPU 区域程序版**（2026-09-19 Claude Fable 5.1，第三批，总账 #71；逐事件精确翻译自 v48 path A 的 CPU 版，
//   CPU 版最后形态 = git e4e5aed（golden fixture 录自它）；决策 = ai-docs/adr/0014-region-programs.md；program = backend/gl/region-programs.ts 第三批）。
//
// 数学一字不改（path A：累积位移场，一次重采样；论证 ai-docs/20260528-liquify-blur.md）：
//   1. 起笔：每叶一个 RegionStroke（session 造，snapshot:true → W₀ = 起笔快照，只读源头）；位移场 d 懒建。
//   2. 每 event：footprint = 圆 R 外接方夹到 doc；场长到覆盖 footprint（field-copy 搬旧场，只扩不缩）；
//      liquify-accumulate：圈内 d += 模式位移 × smoothstep（reconstruct：d *= 1−α）；field-copy 拷回；
//      每叶 liquify-warp：W(p) = 采样 W₀ 于 p − d(p)（选区：dest 在选区外不动；bleed import/clip/edge 整数 cell march；核 nearest/bilinear/bicubic/spline）。
//   3. 组 = 一个位移场逐叶重采样（场纹理挂在第一叶的 RegionStroke 上；其余叶只采样它）。
// 与 CPU 版的差别只有落地形态：起笔不再拷贝整块内容框像素、不再分配同面积 Float32Array（user 09-19 真机「液化每笔落笔卡顿」的根因），
//   位移场是 f32 纹理、按笔迹包围盒长；每 event = 2 + N 个小 draw。spline 核：预滤波仍是 CPU 递归 IIR（起笔一次，readPixels 内容框 → 上传 rgba16f 平面），
//   只在用户选 spline 时付这笔钱。
// 精度：位移场 f32（CPU 也是 Float32Array）；采样在字节单位镜像 CPU；u8 写回四舍五入（CPU Uint8ClampedArray 半偶舍入，±1 于 .5 处）。
// 验收：test/liquify-golden.test.mjs（20 用例 vs CPU 锚 ±2/255）+ 旧契约测试改 GPU 写靶 + gl-smoke 真 GL vs SoftGl。

import type { RegionStroke, RegionTex, Rect } from "../backend/gl/region-stroke.ts";
import { prefilterToSplinePlane, BSPLINE_PAD } from "../backend/algorithms/bspline.ts";

export interface LiquifySettings {
  bleed?: string;    // "import" | "clip" | "edge"(默认)——选区边界取样模式（v147）
  sample?: string;   // "nearest" | "bilinear" | "bicubic"(默认) | "spline"
  size: number;      // R（液化 R = size，不是半径）
  strength: number;  // 0..2
  mode: string;      // push | pinch | bloat | twirl | twirlCW | reconstruct
}

const MODE_INDEX: Record<string, number> = { push: 0, pinch: 1, bloat: 2, twirl: 3, twirlCW: 4, reconstruct: 5 };
const bleedIndex = (b: string | undefined): number => (b === "import" ? 0 : b === "clip" ? 1 : 2);
const sampleIndex = (s: string | undefined): number => (s === "nearest" ? 0 : s === "bilinear" ? 1 : s === "spline" ? 3 : 2);

interface LeafState {
  rs: RegionStroke;
  srcRect: [number, number, number, number];   // 起笔内容框 (x,y,w,h)；空叶 (0,0,0,0)
  plane: RegionTex | null;                       // spline 系数平面（rgba16f）；非 spline / 空叶 = null
  sample: number;                                // 本叶实际核（spline 无平面 → 退 bicubic，同 CPU）
}
interface Field { x: number; y: number; w: number; h: number; A: RegionTex; B: RegionTex; }
interface LiquifyStroke {
  leaves: LeafState[];
  owner: RegionStroke;   // 场纹理的 alloc 主（第一叶）
  docW: number; docH: number;
  settings: LiquifySettings;
  mode: number; bleed: number; R: number; strength: number;
  lastX: number; lastY: number;
  dirty: [number, number, number, number] | null;
  field: Field | null;
}

export class LiquifyEngine {
  _stroke: LiquifyStroke | null = null;

  /** targets = 写靶叶列表（单叶 [rs]；组液化 = 组内全部叶各一个 RegionStroke，含隐藏）。选区平面在 RegionStroke 身上。 */
  beginStroke(targets: readonly RegionStroke[], settings: LiquifySettings, x: number, y: number, _selection?: unknown): void {
    if (!targets.length) throw new Error("LiquifyEngine.beginStroke: needs at least one target leaf");
    const baseSample = sampleIndex(settings.sample);
    const leaves: LeafState[] = targets.map((rs) => {
      const cb = rs.contentBounds;
      const srcRect: [number, number, number, number] = cb ? [cb[0], cb[1], cb[2] - cb[0], cb[3] - cb[1]] : [0, 0, 0, 0];
      let plane: RegionTex | null = null;
      if (baseSample === 3 && cb) {
        // spline：起笔一次 CPU 预滤波（内容框范围，同 CPU 版）→ 上传系数平面；采样在 GPU
        const w = srcRect[2], h = srcRect[3];
        const px = new Uint8ClampedArray(rs.readPixels(cb[0], cb[1], w, h).buffer);
        const sp = prefilterToSplinePlane(px, w, h);
        plane = rs.upload(w + 2 * BSPLINE_PAD, h + 2 * BSPLINE_PAD, sp.data);
      }
      return { rs, srcRect, plane, sample: baseSample === 3 && !plane ? 2 : baseSample };
    });
    this._stroke = {
      leaves, owner: targets[0], docW: targets[0].docW, docH: targets[0].docH, settings,
      mode: MODE_INDEX[settings.mode] ?? 0, bleed: bleedIndex(settings.bleed),
      R: Math.max(2, settings.size), strength: Math.max(0, Math.min(2, settings.strength)),
      lastX: x, lastY: y, dirty: null, field: null,
    };
  }

  // 每个 event 一次。x, y = doc 坐标（input 已平滑）。
  extendStroke(x: number, y: number): void {
    const st = this._stroke;
    if (!st) return;
    const R = st.R, cx = x, cy = y;
    // 1) footprint 夹到 doc 边界（不是 layer.bbox：推出旧内容边的像素要落地）
    const x0 = Math.max(0, Math.floor(cx - R)), y0 = Math.max(0, Math.floor(cy - R));
    const x1 = Math.min(st.docW, Math.ceil(cx + R)), y1 = Math.min(st.docH, Math.ceil(cy + R));
    const w = x1 - x0, h = y1 - y0;
    if (w <= 0 || h <= 0) { st.lastX = x; st.lastY = y; return; }   // 全在 doc 外
    // 2) 场长到覆盖 footprint
    const f = this._growField(st, x0, y0, x1, y1);
    const owner = st.owner;
    const fp = { x: x0 - f.x, y: y0 - f.y, w, h };   // footprint 在场坐标
    // 3) 累加（B ← A 圈内）+ 拷回（A ← B）
    owner.run("liquify-accumulate", f.B, { u_A: f.A }, {
      u_size: [f.w, f.h], u_origin: [f.x, f.y], u_center: [cx, cy], u_R: R, u_strength: st.strength,
      u_mode: st.mode, u_vel: [x - st.lastX, y - st.lastY],
    }, fp);
    owner.run("field-copy", f.A, { u_src: f.B }, { u_size: [f.w, f.h], u_offset: [0, 0], u_srcSize: [f.w, f.h] }, fp);
    // 4) 逐叶重采样（同一个场；各叶各自 W₀ / 选区平面 / 内容框）
    for (const L of st.leaves) {
      const rs = L.rs, sel = rs.selection;
      const texs: Record<string, RegionTex | "W" | "W0" | "selection"> = { u_field: f.A, u_W0: "W0" };
      if (sel) texs.u_sel = "selection";
      if (L.plane) texs.u_plane = L.plane;
      rs.run("liquify-warp", "W", texs, {
        u_docSize: [st.docW, st.docH], u_fieldOrigin: [f.x, f.y],
        u_srcRect: L.srcRect, u_sample: L.sample, u_bleed: st.bleed,
        u_hasSel: sel ? 1 : 0, u_selOrigin: sel ? [sel.ox, sel.oy] : [0, 0], u_selSize: sel ? [sel.ow, sel.oh] : [1, 1],
        u_planeSize: [L.srcRect[2], L.srcRect[3]],
      }, { x: x0, y: y0, w, h });
    }
    // dirty 累积
    if (st.dirty) {
      if (x0 < st.dirty[0]) st.dirty[0] = x0;
      if (y0 < st.dirty[1]) st.dirty[1] = y0;
      if (x1 > st.dirty[2]) st.dirty[2] = x1;
      if (y1 > st.dirty[3]) st.dirty[3] = y1;
    } else st.dirty = [x0, y0, x1, y1];
    st.lastX = x; st.lastY = y;
  }

  // 场长到覆盖 [x0,y0,x1,y1)（只扩不缩；调用方已夹到 doc）。旧场用 field-copy 搬进新场（保留已累积位移），旧纹理归还池。
  private _growField(st: LiquifyStroke, x0: number, y0: number, x1: number, y1: number): Field {
    const owner = st.owner;
    const f = st.field;
    if (!f) {
      const w = x1 - x0, h = y1 - y0;
      st.field = { x: x0, y: y0, w, h, A: owner.alloc(w, h, "rgba-f32"), B: owner.alloc(w, h, "rgba-f32") };
      return st.field;
    }
    const nx = Math.min(f.x, x0), ny = Math.min(f.y, y0);
    const ex = Math.max(f.x + f.w, x1), ey = Math.max(f.y + f.h, y1);
    const nw = ex - nx, nh = ey - ny;
    if (nx === f.x && ny === f.y && nw === f.w && nh === f.h) return f;
    const A = owner.alloc(nw, nh, "rgba-f32");
    owner.run("field-copy", A, { u_src: f.A }, { u_size: [nw, nh], u_offset: [f.x - nx, f.y - ny], u_srcSize: [f.w, f.h] });
    owner.free(f.A); owner.free(f.B);
    st.field = { x: nx, y: ny, w: nw, h: nh, A, B: owner.alloc(nw, nh, "rgba-f32") };
    return st.field;
  }

  endStroke(): void { this._stroke = null; }   // 纹理归 RegionStroke（session dispose 时归还）
  isActive(): boolean { return !!this._stroke; }
  cancelStroke(): void { this._stroke = null; }   // 真层描边期零写（session 丢 RegionStroke 即无痕）

  flushDirty(): [number, number, number, number] | null {
    const st = this._stroke;
    if (!st || !st.dirty) return null;
    const d = st.dirty;
    st.dirty = null;
    return d;
  }

  /** 位移场的 doc 矩形 [x0,y0,x1,y1)（测试 / 诊断；null = 还没起场）。 */
  get fieldRect(): Rect | null {
    const f = this._stroke?.field;
    return f ? [f.x, f.y, f.x + f.w, f.y + f.h] : null;
  }
}
