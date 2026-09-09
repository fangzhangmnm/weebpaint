import { BrushEngine } from "./backend/brush.ts";
import { LassoEngine } from "./lasso.ts";
import { FilterBrushEngine } from "./filter-brush.ts";
import { type StrokeGuide } from "./ruler.ts";
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
    _endStroke(): void;
    _abortStroke(): void;
    /** ADR-0013：尺子投影器提供方（app 接 ruler-ui.guideForStroke）；返回 null = 本笔不吸。 */
    setRulerGuideProvider(fn: ((role: string, pixel: boolean) => StrokeGuide | null) | null): void;
    /** 当前笔是否像素画模式（ruler-ui 拖画选整数像素集还是折线）。 */
    currentBrushPixelMode(): boolean;
    /** ADR-0013 拖画（user 2026-09-09「像素笔圆和矩形，网格应该是拖动啊……再加一个普通笔也可以用的拖动模式看谁舒服」）：
     *  尺子拖出来的整形一次落笔，走**正常 stroke 事务**（当前笔 / 当前层 / 选区 / 锁α / 橡皮 mode 与手绘同源，一个 undo 整点）。
     *  pixel：整数像素集经 stampPixels 每像素一次（首颗由 beginStroke 落）；buffered：每条折线驱动一次引擎（恒压 0.5——机械绘制，
     *  ADR-0005 §3 的拖画语义保留；直通），多条 StampCollect 合并一次 GPU commit（单令牌墙：一个 session）。只对画笔 / 橡皮工具。 */
    drawShape(shape: {
        pixels?: Array<{
            x: number;
            y: number;
        }>;
        polylines?: Array<Array<{
            x: number;
            y: number;
        }>>;
    }): boolean;
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
