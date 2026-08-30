import type { GestureViewport } from "../common/pointer-gesture.ts";
export type RefViewport = GestureViewport;
export interface RefPanelRect {
    left: number;
    top: number;
    width: number;
    height: number;
}
export type RefBitmapSource = (ImageBitmap | HTMLImageElement | HTMLCanvasElement | OffscreenCanvas) & {
    close?: () => void;
};
export type RefLiveSource = HTMLCanvasElement | OffscreenCanvas | ImageBitmap;
export interface RefLabels {
    load?: string;
    paste?: string;
    cloud?: string;
    live?: string;
    oneToOne?: string;
    del?: string;
    delConfirm?: string;
    closeWin?: string;
    prev?: string;
    next?: string;
    menu?: string;
    move?: string;
    resize?: string;
    resizeAria?: string;
}
export type RefItem = {
    kind: "image";
    bitmap: RefBitmapSource;
    blob: Blob | null;
    vp: RefViewport | null;
} | {
    kind: "live";
    vp: RefViewport | null;
};
export declare const REF_ICON_IDS: {
    readonly folder: "folder";
    readonly paste: "paste";
    readonly cloud: "cloud";
    readonly pip: "picture-in-picture";
    readonly oneToOne: "one-to-one";
    readonly trash: "trash-can";
    readonly x: "x";
    readonly plus: "new";
    readonly prev: "chevron-left";
    readonly next: "chevron-right";
};
export declare class WpReferenceWindow extends HTMLElement {
    static get observedAttributes(): string[];
    liveProvider: (() => RefLiveSource | null) | null;
    private _canvas;
    private _cctx;
    private _emptyEl;
    private _plusEl;
    private _menuEl;
    private _chipsEl;
    private _chipCountEl;
    private _delItemEl;
    private _items;
    private _index;
    private _labels;
    private _liveSource;
    private _liveDirty;
    private _lastLiveComposeT;
    private _liveThrottle;
    private _vp;
    private _raf;
    private _panelDrag;
    private _resizeDrag;
    private _pointers;
    private _gestureStart;
    private _picking;
    private _longPressTimer;
    private _lpStart;
    private _lpEvent;
    private _idleTimer;
    constructor();
    get open(): boolean;
    set open(v: boolean);
    attributeChangedCallback(name: string, oldV: string | null, newV: string | null): void;
    close(): void;
    get live(): boolean;
    isLive(): boolean;
    get viewport(): RefViewport;
    set viewport(v: RefViewport | null | undefined);
    get rect(): RefPanelRect;
    set rect(o: Partial<RefPanelRect> | null | undefined);
    set labels(l: RefLabels);
    /** 整表替换（load 恢复用）。旧 image bitmap 全部释放。 */
    setItems(items: RefItem[], index?: number): void;
    /** 追加一张图并翻到它（导入漏斗尾）。 */
    addImage(bitmap: RefBitmapSource, blob: Blob | null): void;
    /** 画布镜像页：已有 → 翻过去；没有 → 追加并翻到（liveProvider 缺席 = no-op）。 */
    showLive(): void;
    /** 清空（换画/重置）。 */
    clearAll(): void;
    /** 宿主读走全部状态（desk 同步 + 保存收集）。当前页 vp 先回写。 */
    getRefState(): {
        index: number;
        items: Array<{
            kind: "image";
            blob: Blob | null;
            vp: RefViewport | null;
        } | {
            kind: "live";
            vp: RefViewport | null;
        }>;
    };
    get itemCount(): number;
    fitToPanel(): void;
    /** 1:1 像素（user 0830）：1 图像素 = 1 **设备**像素（像素图标真面目；scale=1/dpr）、摆正（rot=0）、
     *  当前画布中心的图点保持锚定。菜单项触发 = 用户交互 → 发事件。 */
    oneToOne(): void;
    private _scaleBounds;
    private _containVp;
    markLiveDirty(): void;
    private _emit;
    private _emitViewport;
    private _emitRect;
    private _emitItems;
    private _saveCurrentVp;
    private _loadCurrentVp;
    /** fit 但不发事件（程序性初始适应；用户双击走 fitToPanel）。 */
    fitToPanelSilent(): void;
    private _page;
    private _deleteCurrent;
    private _afterItemsChanged;
    private _updateChips;
    private _sourceSize;
    private _afterShow;
    private _bind;
    private _toggleMenu;
    private _closeMenu;
    private _resetDeleteArm;
    private _pokeIdle;
    private _onDown;
    private _onMove;
    private _onUp;
    private _onWheel;
    private _cancelLongPress;
    private _beginPick;
    private _endPick;
    private _pickAt;
    private _resizeCanvasToBody;
    private _invalidate;
    private _stopLiveTimer;
    private _recomposeLive;
    private _render;
    private _updateEmptyHint;
    /** 视口护栏：尺寸不超视口预算、位置不落屏外（拖已自钳；这里兜 restore/open/浏览器窗口 resize/
     *  native CSS resize 四条路）。返回是否有修正。 */
    private _clampIntoViewport;
}
export declare const WP_REFERENCE_WINDOW_TAG = "wp-reference-window";
