import { type PanelPos } from "./panel-gizmo.ts";
export type { PanelPos } from "./panel-gizmo.ts";
export declare const TOP_DEAD_ZONE_MIN = 24;
export declare const FLOOR_GAP = 4;
export declare const EDGE_MARGIN = 8;
/** 拖把地板（纯函数）：max(安全区 + 死区底线, 顶栏下缘 + 间距)。topBarBottom=null → 顶栏不可见。 */
export declare function computeTopFloor(safeTop: number, topBarBottom: number | null): number;
/** 当前拖把地板（每次现量：旋转 / 顶栏显隐 / safe-area 变了都准）。 */
export declare function floatingTopFloor(): number;
export interface FloatingWindowSpec {
    id: string;
    /** 拖把（标题栏）。缺省 = 不可拖（组件自己拖，如参考窗）。 */
    head?: HTMLElement | null;
    /** 拖把上哪些目标不起拖（关闭钮等）。 */
    ignoreDragOn?: (target: Element) => boolean;
    /** 每次拖动落点（已钳；module 已写 left/top）——消费者只管持久化。 */
    onMove?: (pos: PanelPos) => void;
    resize?: {
        grip: HTMLElement | null;
        min: {
            w: number;
            h: number;
        };
        axis?: "both" | "x";
        /** 起拖时量尺寸（图层窗的 h = 列表高——语义归消费者）；缺省 = 面板 offset 尺寸。 */
        getSize?: () => {
            w: number;
            h: number;
        };
        /** 自定义落地（缺省 = module 写 style.width[/height]）。给了它，module 不碰 style。 */
        apply?: (size: {
            w: number;
            h: number;
        }) => void;
    };
    /** transient（transform/crop/adjust-color）期间的去留：缺省 = 从不被抑制；给了 = 只在 keepDuring 内的 mode 留下。 */
    transient?: {
        keepDuring: string[];
    };
    /** open/close 的回声（aria-pressed 等）。抑制/复原**不**触发。 */
    onOpenChange?: (open: boolean) => void;
    /** 视口变了（旋转/resize）时的回调，带当前地板——给自己钳制的组件（参考窗）用。 */
    onViewport?: (floor: number) => void;
    /** 面板 hidden 时量不到尺寸的兜底（restore 钳制用）。 */
    fallbackSize?: {
        w: number;
        h: number;
    };
}
export interface FloatingWindowHandle {
    readonly el: HTMLElement;
    readonly id: string;
    open(): void;
    close(): void;
    toggle(force?: boolean): boolean;
    isOpen(): boolean;
    raise(): void;
    /** 钳进视口（拖把不进出血区、不出屏）。hidden 时 no-op。 */
    clamp(): void;
    /** 应用持久化几何：null = 回 CSS 默认位（清 inline）。带 width/height 时按 resize 规则写尺寸。 */
    restore(pos: (PanelPos & {
        width?: number;
        height?: number;
    }) | null): void;
    dispose(): void;
}
/** 测试/外部显式触发一次全量重钳（与视口事件同路）。 */
export declare function clampAllFloatingWindows(): void;
export declare function registerFloatingWindow(el: HTMLElement, spec: FloatingWindowSpec): FloatingWindowHandle;
/** 按元素找句柄（老调用方 _bringPanelTop(el) 的适配）。 */
export declare function floatingWindowOf(el: HTMLElement | null): FloatingWindowHandle | null;
export declare function raiseFloatingWindow(el: HTMLElement | null): void;
export declare function suppressFloatingForTransient(mode: string): void;
export declare function restoreFloatingAfterTransient(): void;
/** 诊断：当前栈（id 按 z 升序）。 */
export declare function floatingWindowStack(): string[];
