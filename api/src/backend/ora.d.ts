export declare function setOraLogReporter(fn: (msg: string) => void): void;
import type { PaintingData } from "./workpiece/painting-workpiece.ts";
export interface EncodeLeaf {
    isGroup: false;
    id: number;
    name: string;
    visible: boolean;
    opacity: number;
    mode: string;
    clippingMask: boolean;
    lockAlpha: boolean;
    bboxX: number;
    bboxY: number;
    bboxW: number;
    bboxH: number;
    getImageData(x: number, y: number, w: number, h: number): ImageData;
}
export interface EncodeGroup {
    isGroup: true;
    id: number;
    name: string;
    visible: boolean;
    opacity: number;
    mode: string;
    clippingMask: boolean;
    children: EncodeNode[];
}
export type EncodeNode = EncodeLeaf | EncodeGroup;
type EncodeDoc = {
    width: number;
    height: number;
    layers: readonly EncodeNode[];
    activeId: number | null;
    referenceLayerId: number | null;
};
/** exportData 冻结快照 → encode 消费面（保存路径的 freezeDocForEncode 后继；bytes 已当场拷出，
 *  getImageData = 纯切片，无 canvas、无追写风险）。 */
export declare function paintingDataToEncodeDoc(data: PaintingData): EncodeDoc;
export declare function refEntryName(i: number, mime: string): string;
/** decode 产出的参考项（manifest 顺序）。live=零字节标记（宿主重绑合成 provider）。 */
export type DecodedReference = {
    kind: "image";
    blob: Blob;
} | {
    kind: "live";
};
interface EncodeOpts {
    wroteWith: string;
    mergedBytes?: {
        data: Uint8ClampedArray;
        w: number;
        h: number;
    } | null;
    references?: (Blob | null)[];
    desk?: object;
    timelapse?: {
        json: string;
        mp4: Uint8Array;
    } | null;
}
export interface DecodedPainting {
    data: PaintingData;
    _references?: DecodedReference[];
    _weebpaintState?: unknown;
    _editorState?: unknown;
    _timelapseJson?: string;
    _timelapseMp4?: Uint8Array;
    _wroteWith: string | null;
    _formatVersion: number;
}
/** doc → Blob (.ora)
 *
 * ══ zip 布局契约（format 2，2026-08-30 user 拍板；动布局必须上报+附目录表 = CLAUDE.md 纪律）══
 * 终态目录表（写端唯一形状）：
 *   mimetype                              ← ORA spec 强制第一
 *   stack.xml                             ← 结构 + wrote-with / weebpaint:format
 *   mergedimage.png                       ← spec
 *   data/layer<id>.png × N                ← spec
 *   .weebpaint/editor-state.json          ← desk（含 refPanels manifest）
 *   .weebpaint/references/r<i>.<ext>      ← 多参考（refEntryName；manifest 驱动，扩展名说真话）
 *   .weebpaint/timelapse.json / .mp4      ← 录像（format 2 起 mp4 与 json 团圆）
 *   Thumbnails/thumbnail.png              ← spec 强制，恒最后（byte-range 尾窗契约）
 * 心智模型：根目录 = ORA spec 领土；`.weebpaint/` = 全部 WP 私货（与云端 store `.weebpaint/` 同义）。
 * **非点 `weebpaint/` 已停写**（format 2）；读端兜底链见 decode 尾部路由表——只读不写、保存即自愈。
 * （旧轨 webpaint/state.json v0.8.21 停写——ADR-0008 §9；decode 读兼容保留存量。）
 */
export declare function encodeDocToOra(doc: EncodeDoc, opts: EncodeOpts): Promise<any>;
/** Blob (.ora 明文) → DecodedPainting（json 形 + 内联 tile 字节 + sidecar）。 */
export declare function decodeOraToPainting(blob: Blob): Promise<DecodedPainting>;
export declare function parseAppVersion(s: string | null | undefined): number | null;
export {};
