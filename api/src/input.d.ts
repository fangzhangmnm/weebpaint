import { BrushEngine } from "./backend/brush.ts";
import { LassoEngine } from "./lasso.ts";
import { FilterBrushEngine } from "./filter-brush.ts";
import type { StrokeEngine } from "./backend/stroke-session.ts";
/** 一笔一个投影器：begin 给起点（曲线尺把起点也吸上去，返回吸后的点）；project 逐点投影；像素链尺另有 projectPath（返回沿链新吐的像素，调用方逐颗 stampPixels）。 */
export interface StrokeGuide {
    begin(x: number, y: number): {
        x: number;
        y: number;
    };
    project(x: number, y: number): {
        x: number;
        y: number;
    };
    projectPath?(x: number, y: number): Array<{
        x: number;
        y: number;
    }>;
}
/** 被包的内引擎 + 调用方给的闭包（各引擎 begin 签名不同，调用方最清楚）。 */
export interface ShapedInner {
    inner: StrokeEngine & {
        stampPixels?(pts: Array<{
            x: number;
            y: number;
        }>, pressure: number): void;
    };
    /** 在 (x,y) 给内引擎起一笔（settings / mode / 写靶全由闭包捕获）。 */
    beginInner(x: number, y: number): void;
    /** 把写靶退回笔前：buffered 笔只需 inner.cancelStroke；就地写（shadow）要 restore 替身。每次重驱前调一次。 */
    reset(): void;
    /** 引擎就地写靶（像素笔 / 滤镜笔）= 每帧必须 reset 后重画；buffered 笔（StampCollect）= 纯收集，不写靶。 */
    inPlace: boolean;
    /** 像素画模式：整数像素集经 stampPixels 每像素一次（ADR-0013 Q5）。 */
    pixel: boolean;
    /** 像素链裁剪盒（doc + 出血）。 */
    box: {
        x0: number;
        y0: number;
        x1: number;
        y1: number;
    };
}
/** 包好的引擎：满足 StrokeEngine 面 + begin(x,y)，StrokeSession 当它是引擎。 */
export interface ShapedStroke extends StrokeEngine {
    begin(x: number, y: number): void;
    collectStamps(): ReturnType<BrushEngine["collectStamps"]>;
}
/** 每笔起笔问一次 mode：null = 本笔不整形；"drag" = 拖画（重驱内引擎）；"trace" = 留尺（只记手势，引擎不动）。 */
export interface StrokeShaper {
    mode(role: string): "drag" | "trace" | null;
    wrap(io: ShapedInner | null): ShapedStroke;
}
import { PressureProbe } from "./pressure-probe.ts";
import type { GestureViewport, TapRef } from "./common/pointer-gesture.ts";
import type { PaintingView, ViewLeaf } from "./backend/workpiece/painting-view.ts";
import type { Board } from "./board.ts";
import type { EditMode } from "./edit-mode.ts";
import type { History } from "./backend/workpiece/history.ts";
import type { PaintingWorkpiece } from "./backend/workpiece/painting-workpiece.ts";
import type { LayerTiles } from "./backend/workpiece/layer-tiles.ts";
import type { ResolvedBrush } from "./resolved-brush.ts";
import { StrokeSession } from "./backend/stroke-session.ts";
import type { StrokeSessionDeps } from "./backend/stroke-session.ts";
import { Selection } from "./backend/selection.ts";
type Doc = PaintingView;
interface FilterBrushState {
    Filter: unknown;
    params: unknown;
}
interface SelectionChangeEntry {
    before?: Selection | null;
    after?: Selection | null;
}
interface PointerRec {
    pointerType: string;
    role: string | null;
    x: number;
    y: number;
    startX?: number;
    startY?: number;
    smX?: number;
    smY?: number;
    downTime?: number;
    lastUpdateTs?: number;
    longPressTimer?: ReturnType<typeof setTimeout> | null;
    lastRawX?: number;
    lastRawY?: number;
    lastP?: number | null;
    smP?: number;
    lastEventTs?: number;
    rawSX?: number;
    rawSY?: number;
    stabX?: number;
    stabY?: number;
    rawToEngine?: boolean;
    _deferGroupWarn?: boolean;
    _deferHiddenWarn?: boolean;
    _lastX?: number;
    _lastY?: number;
    _lassoMode?: string;
    _lassoStartDocX?: number;
    _lassoStartDocY?: number;
}
interface GestureTap {
    startTime: number;
    firstDownTime: number;
    isTap: boolean;
    maxCount: number;
    startPositions: Record<string, {
        x: number;
        y: number;
    }>;
}
interface InputOpts {
    getTool?: () => string;
    editMode?: EditMode | null;
    getResolvedBrush?: () => ResolvedBrush | null;
    getFilterBrushState?: () => FilterBrushState | null;
    getLongPressPickEnabled?: () => boolean;
    getSingleFingerDraw?: () => boolean;
    getPickMode?: () => string;
    onColorSampled?: (hex: string) => void;
    status?: (msg: string) => void;
    history?: History | null;
    wp2?: PaintingWorkpiece | null;
    layerTiles?: LayerTiles | null;
    isContentReplacing?: () => boolean;
}
interface KeyboardShortcut {
    combo: string;
    desc: string;
    category: string;
    when?: (i: InputController) => boolean;
    run: (i: InputController) => void;
}
export declare const KEYBOARD_SHORTCUTS: KeyboardShortcut[];
export declare class InputController {
    board: Board;
    doc: Doc;
    canvas: HTMLCanvasElement;
    brush: BrushEngine;
    lasso: LassoEngine;
    filterBrush: FilterBrushEngine;
    _strokeGuide: StrokeGuide | null;
    _selPenGuide: StrokeGuide | null;
    _rulerGuideProvider: ((role: string, pixel: boolean) => StrokeGuide | null) | null;
    shiftDown: boolean;
    _strokeShaper: StrokeShaper | null;
    _shapeCleanup: (() => void) | null;
    _selPenEng: StrokeEngine & {
        collectStamps(): ReturnType<BrushEngine["collectStamps"]>;
    };
    getTool: () => string;
    editMode: EditMode | null;
    getResolvedBrush: () => ResolvedBrush | null;
    getFilterBrushState: () => FilterBrushState | null;
    getLongPressPickEnabled: () => boolean;
    getSingleFingerDraw: () => boolean;
    getPickMode: () => string;
    isContentReplacing: () => boolean;
    onColorSampled: (hex: string) => void;
    status: (msg: string) => void;
    pointers: Map<number, PointerRec>;
    penEverSeen: boolean;
    pressureProbe: PressureProbe;
    spaceDown: boolean;
    altDown: boolean;
    eraserHold: boolean;
    _eHoldStart: number;
    _eHoldUsed: boolean;
    gestureStart: {
        dist: number;
        midX: number;
        midY: number;
        angle: number;
        vp: GestureViewport;
        lastDist: number;
        lastAngle: number;
        velEma: number;
        lastMoveT: number;
    } | null;
    _gestureTap: GestureTap | null;
    _lastTap: TapRef | null;
    _lastPenActivity: number;
    history: History | null;
    wp2: PaintingWorkpiece | null;
    layerTiles: LayerTiles | null;
    _activeStroke: StrokeSession | null;
    _strokeDeps: StrokeSessionDeps;
    constructor(board: Board, doc: Doc, opts?: InputOpts);
    _bind(): void;
    _updateCursorPreview(e: PointerEvent): void;
    _down(e: PointerEvent): void;
    _probePressure(e: PointerEvent, up: boolean): void;
    _move(e: PointerEvent): void;
    _up(e: PointerEvent, cancelled?: boolean): void;
    _beginStroke(e: PointerEvent, rec: PointerRec, mode: string): void;
    /** 像素链 / 拖画像素集的裁剪盒 = doc + 64px 出血（透视链端点可飞远）。 */
    _shapeClipBox(): {
        x0: number;
        y0: number;
        x1: number;
        y1: number;
    };
    _endStroke(): void;
    _abortStroke(): void;
    /** ADR-0013：尺子投影器提供方（app 接 ruler-ui.guideForStroke）；返回 null = 本笔不吸。 */
    setRulerGuideProvider(fn: ((role: string, pixel: boolean) => StrokeGuide | null) | null): void;
    /** 「几何」拖画 / 留尺的接线口（app 接 ruler-ui.strokeShaper；null = 拔掉 extension）。 */
    setStrokeShaper(fn: StrokeShaper | null): void;
    isStrokeActive(): boolean;
    collectActiveStamps(): ReturnType<BrushEngine["collectStamps"]>;
    abortActiveStroke(): void;
    liveMutatedLeaf(): ViewLeaf | null;
    _filterBrushAllowsGroup(): boolean;
    _filterBrushTargets(): ViewLeaf[];
    _beginFilterBrush(rec: PointerRec): void;
    _beginLasso(rec: PointerRec, e?: PointerEvent): void;
    _endLasso(rec: PointerRec): void;
    _flushLineartHint(): void;
    _polygonUp(rec: PointerRec): void;
    _polygonClose(): void;
    _commitLasso(): void;
    _selPenPixel: boolean;
    _selPenLive: boolean;
    selPenStrokeActive(): boolean;
    /** 抬笔：stamps → alpha → ≥128 二值 → setOp 合成（一笔一条 selectionChange；蚂蚁线此刻才更新=A 档拍板） */
    _endSelPen(): void;
    _abortSelPen(): void;
    _abortLasso(): void;
    commitLassoIfFloating(): void;
    _doPick(sx: number, sy: number): void;
    _gestureTouches(): PointerRec[];
    _updateGestureTapSnapshot(): void;
    _beginGesture(): void;
    _updateGesture(): void;
    _endGesture(): void;
    _wheel(e: WheelEvent): void;
    _keydown(e: KeyboardEvent): void;
    _keyup(e: KeyboardEvent): void;
    _emitTool(tool: string): void;
    _adjustSize(delta: number): void;
    canUndo(): boolean;
    canRedo(): boolean;
    ctrlZ(): void;
    undo(): void;
    redo(): void;
    clearHistory(): void;
    _pushSelEntry(entry: SelectionChangeEntry | null | undefined): void;
    _purgeStalePointers(): void;
    _purgeAllTouches(): void;
    _discardPointer(pid: number): void;
    _maybeEndGesture(): void;
    cancelAllPointers(): void;
    clearKeyHolds(): void;
}
export {};
