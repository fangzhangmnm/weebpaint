// shape-stroke —— 「几何」extension 的拖画 decorator（ADR-0013 修订 ③，2026-09-10）。created 2026-09-10 by Claude Fable 5.1
//
// user 2026-09-10：「之前的行为也就是复制了一份画笔，然后加上了这个 extension。现在是要把这个 extension 抽出来，然后我希望画笔，橡皮，
//   套索，选区笔，甚至手指，都能享受得到」「如果 geometry engine related 脚本突然不见了，其他地方只要最小的修复程序也能跑」「旧版本的是用不着预览」。
// 形制 = 旧 ShapeBrushEngine（v0.14.6 删）的 decorator 本质，只把私有内嵌的 BrushEngine 改成**注入**：任何满足 StrokeEngine 事务面
//   （backend/stroke-session.ts）的引擎都能被包——BrushEngine（画笔 / 橡皮 / 选区笔借的 brush）、FilterBrushEngine（手指族）。
//   extend 只记手势；每个输入事件批（flushDirty 被调一次）用当前几何**从头重驱**内引擎——笔触本身就是预览，没有草稿层。
//   几何全复用 ruler.ts（placeFromDrag / placeFromLoop / shapePolylines / shapePixels），本文件零几何、零 DOM、零 desk。
// 可拔：本文件 + ruler-ui + ruler.ts 删掉、app.ts 三行去掉，程序照跑（input 的接线口是可选 provider，类型归 input 自己）。
//
// 两种用法由 io 决定：io 给了 = 拖画（重驱引擎落笔）；io = null = 留尺（只记手势，抬手把几何交给 onEnd，引擎不动、零像素）。

import type { StrokeEngine } from "./backend/stroke-session.ts";
import type { ShapedInner, ShapedStroke } from "./input.ts";   // 接线口的类型归 input（core），本文件是可拔的 extension
import { placeFromDrag, placeFromLoop, shapePolylines, shapePixels, type Ruler, type RulerKind, type PlaceOpts } from "./ruler.ts";
import type { Pt } from "./shape-geometry.ts";

/** 恒压（ADR-0005 §3 机械绘制语义保留；= 鼠标主路径同款常量 0.5）。描尺（留尺后沿尺画）才是真笔压。 */
export const SHAPE_PRESSURE = 0.5;
/** 重驱时喂内引擎的合成时间步（ms）：直通平滑下只要单调即可。 */
const SYNTH_DT = 8;

export interface ShapeGestureOpts {
  kind: RulerKind;
  /** 每次重算时读（Shift 反转约束 / 透视 frame / 视口 rot 都是活的）。 */
  place(): PlaceOpts;
  grid(): { nu: number; nv: number };
}

/** 手势 → 几何（纯）：拖一下（parallel / rect / grid / persp）或画一圈（ellipse）。
 *  persp 种在拖画里 = 平行线 + 吸 VP 射线（旧形状笔「直线 + 吸向消失点」）；透视关着就退化成普通直线。 */
export class ShapeGesture {
  p0: Pt | null = null;
  p1: Pt | null = null;
  pts: Pt[] = [];
  readonly o: ShapeGestureOpts;
  constructor(o: ShapeGestureOpts) { this.o = o; }   // （node strip-only TS 不认 parameter property）
  begin(p: Pt): void { this.p0 = p; this.p1 = p; this.pts = [p]; }
  extend(p: Pt): void { this.p1 = p; if (this.o.kind === "ellipse") this.pts.push(p); }
  ruler(): Ruler | null {
    if (!this.p0 || !this.p1) return null;
    const k = this.o.kind;
    if (k === "ellipse") return placeFromLoop(this.pts, this.o.place());
    if (k === "persp") { const o = this.o.place(); return placeFromDrag("parallel", this.p0, this.p1, { ...o, constrain: !!o.frame }); }
    return placeFromDrag(k, this.p0, this.p1, this.o.place(), this.o.grid());
  }
  /** 平行线尺在拖画里是一段：起点 → 终点在尺方向上的投影（约束已在放置时吸过）。 */
  seg(r: Ruler): [Pt, Pt] | undefined {
    if (r.kind !== "parallel" || !this.p0 || !this.p1) return undefined;
    const dx = Math.cos(r.angle), dy = Math.sin(r.angle);
    const t = (this.p1.x - r.anchor.x) * dx + (this.p1.y - r.anchor.y) * dy;
    return [r.anchor, { x: r.anchor.x + dx * t, y: r.anchor.y + dy * t }];
  }
}

export type Collect = NonNullable<ReturnType<NonNullable<StrokeEngine["collectStamps"]>>>;
type Rect4 = [number, number, number, number];

export type { ShapedInner, ShapedStroke };

export interface ShapedHooks {
  /** 每次重算后给当前几何（留尺模式 overlay 画草稿用；拖画模式也给，UI 可忽略）。 */
  onDraft?(r: Ruler | null): void;
  /** 抬手：最终几何（留尺模式在这写回 desk）。 */
  onEnd?(r: Ruler | null): void;
  onCancel?(): void;
}

/** 多段（格线）的 StampCollect 合并成一条 undo（shape / layer / mode 同源取首个）——原形状笔 mergeCollects 原样。 */
export function mergeCollects(lists: Collect[]): Collect | null {
  if (!lists.length) return null;
  if (lists.length === 1) return lists[0];
  const base = lists[0];
  const stamps = lists.flatMap((c) => c.stamps);
  let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity;
  for (const c of lists) {
    bx0 = Math.min(bx0, c.bx); by0 = Math.min(by0, c.by);
    bx1 = Math.max(bx1, c.bx + c.bw); by1 = Math.max(by1, c.by + c.bh);
  }
  return { ...base, stamps, bx: bx0, by: by0, bw: bx1 - bx0, bh: by1 - by0 };
}

function unionRect(a: Rect4 | null, b: Rect4 | null): Rect4 | null {
  if (!a) return b; if (!b) return a;
  const x0 = Math.min(a[0], b[0]), y0 = Math.min(a[1], b[1]);
  const x1 = Math.max(a[0] + a[2], b[0] + b[2]), y1 = Math.max(a[1] + a[3], b[1] + b[3]);
  return [x0, y0, x1 - x0, y1 - y0];
}

/** 拖画 / 留尺 decorator。io 给了 = 拖画（重驱内引擎）；io = null = 留尺（只记手势）。 */
export function shapedStroke(g: ShapeGesture, io: ShapedInner | null, hooks: ShapedHooks = {}): ShapedStroke {
  let dirty = false;
  let cs: Collect | null = null;      // buffered：最近一次重驱的合并 StampCollect（overlay 拉取 / 抬手 commit）
  let drawn = false;                  // inPlace：靶上有上一帧的画 → 下次重驱前 reset
  let last: Rect4 | null = null;      // 上一帧画过的区（restore 后也要重渲）
  let t = 0;

  const resynth = (): Rect4 | null => {
    dirty = false;
    const r = g.ruler();
    hooks.onDraft?.(r);
    if (!io) return null;
    if (drawn) { io.reset(); drawn = false; }
    cs = null;
    let acc: Rect4 | null = null;
    if (r) {
      const seg = g.seg(r);
      if (io.pixel) {
        const pts = shapePixels(r, io.box, seg);
        if (pts.length) {
          io.beginInner(pts[0].x, pts[0].y);
          io.inner.stampPixels?.(pts.slice(1), SHAPE_PRESSURE);
          acc = io.inner.flushDirty();
          drawn = true;                                   // 像素笔的内笔保持活着，抬手由 endStroke 收
        }
      } else {
        const collects: Collect[] = [];
        for (const pl of shapePolylines(r, seg)) {
          if (!pl.length) continue;
          io.beginInner(pl[0].x, pl[0].y);
          for (let i = 1; i < pl.length; i++) { t += SYNTH_DT; io.inner.extendStroke(pl[i].x, pl[i].y, SHAPE_PRESSURE, t); }
          acc = unionRect(acc, io.inner.flushDirty());
          const c = io.inner.endStroke() as Collect | null | void;
          if (c && c.stamps.length) collects.push(c);
        }
        cs = mergeCollects(collects);
        drawn = io.inPlace;                               // 就地写的引擎（滤镜笔）靶上有画了
      }
    }
    const out = unionRect(last, acc);
    last = acc;
    return out;
  };

  return {
    begin(x, y) { t = 0; g.begin({ x, y }); dirty = true; },
    extendStroke(x, y) { g.extend({ x, y }); dirty = true; },
    /** 每个输入事件批调一次（input._move 在 extend 批之后）→ 此刻重驱；返回本帧 + 上帧的脏区。 */
    flushDirty() { return dirty ? resynth() : null; },
    collectStamps() { return cs; },
    endStroke() {
      if (dirty) resynth();
      hooks.onEnd?.(g.ruler());
      if (io && drawn) { io.inner.endStroke(); drawn = false; }   // 像素笔的开着的内笔（滤镜笔已逐段 end，此处 no-op）
      return cs;
    },
    cancelStroke() {
      if (io) { if (drawn) io.reset(); io.inner.cancelStroke(); drawn = false; }
      cs = null; dirty = false;
      hooks.onCancel?.();
    },
  };
}
