import type { StrokeEngine } from "./backend/stroke-session.ts";
import type { ShapedInner, ShapedStroke } from "./input.ts";
import { type Ruler, type RulerKind, type PlaceOpts } from "./ruler.ts";
import type { Pt } from "./shape-geometry.ts";
/** 恒压（ADR-0005 §3 机械绘制语义保留；= 鼠标主路径同款常量 0.5）。描尺（留尺后沿尺画）才是真笔压。 */
export declare const SHAPE_PRESSURE = 0.5;
export interface ShapeGestureOpts {
    kind: RulerKind;
    /** 每次重算时读（Shift 反转约束 / 透视 frame / 视口 rot 都是活的）。 */
    place(): PlaceOpts;
    grid(): {
        nu: number;
        nv: number;
    };
}
/** 手势 → 几何（纯）：拖一下（parallel / rect / grid / persp）或画一圈（ellipse）。
 *  persp 种在拖画里 = 平行线 + 吸 VP 射线（旧形状笔「直线 + 吸向消失点」）；透视关着就退化成普通直线。 */
export declare class ShapeGesture {
    p0: Pt | null;
    p1: Pt | null;
    pts: Pt[];
    readonly o: ShapeGestureOpts;
    constructor(o: ShapeGestureOpts);
    begin(p: Pt): void;
    extend(p: Pt): void;
    ruler(): Ruler | null;
    /** 平行线尺在拖画里是一段：起点 → 终点在尺方向上的投影（约束已在放置时吸过）。 */
    seg(r: Ruler): [Pt, Pt] | undefined;
}
export type Collect = NonNullable<ReturnType<NonNullable<StrokeEngine["collectStamps"]>>>;
export type { ShapedInner, ShapedStroke };
export interface ShapedHooks {
    /** 每次重算后给当前几何（留尺模式 overlay 画草稿用；拖画模式也给，UI 可忽略）。 */
    onDraft?(r: Ruler | null): void;
    /** 抬手：最终几何（留尺模式在这写回 desk）。 */
    onEnd?(r: Ruler | null): void;
    onCancel?(): void;
}
/** 多段（格线）的 StampCollect 合并成一条 undo（shape / layer / mode 同源取首个）——原形状笔 mergeCollects 原样。 */
export declare function mergeCollects(lists: Collect[]): Collect | null;
/** 拖画 / 留尺 decorator。io 给了 = 拖画（重驱内引擎）；io = null = 留尺（只记手势）。 */
export declare function shapedStroke(g: ShapeGesture, io: ShapedInner | null, hooks?: ShapedHooks): ShapedStroke;
