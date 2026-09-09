import { type Pt, type ClipBox } from "./shape-geometry.ts";
import { type PerspConfig } from "./perspective-frame.ts";
export type RulerKind = "parallel" | "persp" | "ellipse" | "rect" | "grid";
export interface RulerParallel {
    kind: "parallel";
    angle: number;
    anchor: Pt;
}
export interface RulerPersp {
    kind: "persp";
}
export interface RulerEllipse {
    kind: "ellipse";
    pts: Pt[];
    quad?: [Pt, Pt, Pt, Pt];
}
export interface RulerRect {
    kind: "rect";
    corners: [Pt, Pt, Pt, Pt];
}
export interface RulerGrid {
    kind: "grid";
    corners: [Pt, Pt, Pt, Pt];
    nu: number;
    nv: number;
}
export type Ruler = RulerParallel | RulerPersp | RulerEllipse | RulerRect | RulerGrid;
export declare const RULER_KINDS: readonly RulerKind[];
/** 一笔一个：begin 给起点（曲线尺把起点也吸上去，返回吸后的点）；project 逐点投影。
 *  像素链尺另有 projectPath：返回从上次位置到这次位置沿链吐出的**新**像素中心（seen-set 去重），调用方逐颗 stampPixels、不再 extend。 */
export interface StrokeGuide {
    begin(x: number, y: number): Pt;
    project(x: number, y: number): Pt;
    projectPath?(x: number, y: number): Pt[];
}
/** 谁吸尺（Q4 讨论中，user 2026-09-09「45 我需要讨论下」）：像素笔角色集（input pixel-stroke role）。 */
export declare const RULER_ROLES: ReadonlySet<string>;
/** 透视尺：首段走够这么远（doc px）才锁 VP 族，之前的点钉在起点。 */
export declare const PERSP_LOCK_PX = 6;
export interface PlaceOpts {
    constrain: boolean;
    frame: PerspConfig | null;
    rot: number;
    docW: number;
    docH: number;
}
/** 格线：单位方 (u,v) 经 homography 映到四边形；nu 列 nv 行 → nu+1 竖线 + nv+1 横线（含外框）。 */
export declare function gridSegments(corners: [Pt, Pt, Pt, Pt], nu: number, nv: number): Array<[Pt, Pt]>;
/** 尺的线段集（overlay 用；persp 尺无自有线段——透视 gizmo 另画）。parallel 画 5 条平行线示意方向族。 */
export declare function rulerSegments(r: Ruler, docW: number, docH: number): Array<[Pt, Pt]>;
/** 建一笔的投影器。persp 尺需要 frame（透视关 → null = 本笔不吸）；其余尺不看 frame。
 *  pixel（像素画模式）给裁剪盒 → 整数像素链投影器（projectPath）；不给 → 连续投影器（project）。 */
export declare function guideFor(r: Ruler, frame: PerspConfig | null, pixel?: {
    box: ClipBox;
}): StrokeGuide | null;
/** 拖一下放尺：parallel（方向；constrain = 15° / 透视吸 VP 射线）、rect（正方约束）、grid（nu×nv）。太短 / 病态 → null。 */
export declare function placeFromDrag(kind: "parallel" | "rect" | "grid", p0: Pt, p1: Pt, o: PlaceOpts, grid?: {
    nu: number;
    nv: number;
}): Ruler | null;
/** 画一圈放椭圆尺（ADR-0005 §4 拟合哲学不变：闭合 max 范数 / 弧 LSQ→Kasa）；尺恒是整圈（弧由笔迹自己决定）。
 *  constrain = 正圆「圆心拖半径」（起点 = 圆心，末点定半径；透视下 = 平面欧氏圆的像）。透视开 = 在平面 chart 里拟合再映回。 */
export declare function placeFromLoop(pts: Pt[], o: PlaceOpts): RulerEllipse | null;
/** 裁切 / 翻转 / 旋转 / 缩放 / 偏移：尺跟 doc 走（同 desk.persp 的 remapShapePersp）。f = 点映射。 */
export declare function remapRuler(r: Ruler, f: (p: Pt) => Pt): Ruler;
/** 载入校验（desk JSON 来自文件；坏形状 → null，别让一把坏尺炸掉起笔）。 */
export declare function sanitizeRuler(v: unknown): Ruler | null;
/** 像素画模式的整数链投影器（guideFor 的 pixel 分支）。 */
export declare function pixelGuide(r: Ruler, frame: PerspConfig | null, box: ClipBox): StrokeGuide | null;
