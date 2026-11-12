import { type Stamp } from "./format/migrate.ts";
export interface OraNode {
    id: number;
    name: string;
    visible: boolean;
    opacity?: number;
    mode?: string;
    clippingMask?: boolean;
    isGroup: boolean;
    children?: OraNode[];
    bboxX?: number;
    bboxY?: number;
    lockAlpha?: boolean;
}
export interface OraDoc {
    layers: readonly OraNode[];
    width: number;
    height: number;
    activeId?: number | null;
    referenceLayerId?: number | null;
}
interface ParsedCommon {
    id: number | null;
    name: string;
    opacity: number;
    visible: boolean;
    mode: string;
    clippingMask: boolean;
    isActive: boolean;
}
export type ParsedNode = (ParsedCommon & {
    isGroup: true;
    children: ParsedNode[];
}) | (ParsedCommon & {
    isGroup: false;
    src: string;
    x: number;
    y: number;
    lockAlpha: boolean;
    isReference: boolean;
});
export declare function oraCompositeOp(canvasMode: string): string;
export declare function canvasModeFromOra(op: string): string;
export declare const ORA_FORMAT_VERSION: number;
/** 能写进 weebpaint:id、能拿来起像素文件名的 id：安全范围里的非负整数（读的时候也只认这种：parseNode）。 */
export declare const usableLayerId: (id: unknown) => id is number;
/**
 * 写的时候每个节点的 id 能不能用、每片叶的像素文件路径（stack.xml 的 src 和 zip 里的条目必须是同一个；buildStackXml 和 encodeDocToOra 都问它，2026-11-12 CatsUp 统筹批）。
 * 「可用」= 安全范围的非负整数，**而且这份文档里按同一种走法（doc.layers 深度优先、组先于它的子节点、子节点按先后）前面没出现过**——组的 id 也算「出现过」。
 * 不可用的（没有 / NaN / 负数 / 小数 / 和前面的重复）：不写 weebpaint:id、不按 id 认选中和参考、经 warn 报一句；是叶的话像素路径 = data/layer-<第几个>.png
 * （第几个 = 同一种走法里第几片不可用的叶；「-」开头的永远不和 layer<数字> 撞）。可用的照旧 data/layer<id>.png——正常文档（id 都不重复）写出来和以前逐字节一样。
 * 以前没有 id 的叶写成 data/layerundefined.png、两片同 id 的叶写成同一个 data/layer<id>.png：一层盖掉另一层。
 */
export declare function layerIdPlan(doc: {
    readonly layers: readonly OraNode[];
}): {
    readonly usable: ReadonlySet<OraNode>;
    readonly paths: ReadonlyMap<OraNode, string>;
    readonly why: ReadonlyMap<OraNode, string>;
};
export declare function buildStackXml(doc: OraDoc, wroteWithVersion?: string, warn?: (msg: string) => void): string;
export declare function parseStackXml(xmlText: string): {
    w: number;
    h: number;
    nodes: ParsedNode[];
    wroteWith: string | null;
    formatVersion: number;
    formatStamp: Stamp;
};
export {};
