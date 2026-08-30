import { WpReferenceWindow } from "./frontend/reference-window.ts";
import { PaletteWindow } from "./palette.ts";
import type { DecodedReference } from "./backend/ora.ts";
import type { AppContext } from "./app-context.ts";
export declare const referenceWindow: WpReferenceWindow;
/** 保存收集（session-state _buildOraMeta 调）：先同步 desk manifest，再交出与 manifest **位置对齐**
 *  的 blob 列表（live 占位 null，encode 跳过但保索引）。 */
export declare function collectReferenceBlobsForSave(): (Blob | null)[];
/** 载入恢复（session-state 在 desk.Unserialize **之后**调）：decode 的 _references（manifest 顺序）
 *  → bitmap → 组件整表灌入；vp 按 desk.refPanels 对位取（旧文件单张 → desk.refPanel.viewport）。 */
export declare function applyLoadedReferences(refs: DecodedReference[]): Promise<void>;
export declare const paletteWindow: PaletteWindow;
export declare function initSideWindows(ctx: AppContext): void;
/** 导入唯一漏斗（spec §5；genai era 同入口）：转码政策（1024² / 小图原样豁免 / 拍平白底 jpeg /
 *  压大保原）→ 追加为新页并翻到 → desk manifest 同步 + sidecar 标脏 + 状态行（压缩了就报 X→Y）。
 *  file input / 剪贴板 / 云盘 picker / import-image drop 路径全走这里。 */
export declare function addReferenceImage(file: File | Blob): Promise<void>;
