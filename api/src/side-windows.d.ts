import { WpReferenceWindow } from "@internal/reference-window";
import { PaletteWindow } from "./palette.ts";
import type { ReferenceFiles } from "./backend/ora.ts";
import type { AppContext } from "./app-context.ts";
export declare const referenceWindow: WpReferenceWindow;
/** 保存收集（session-state _buildOraMeta 调）：库编好的目录文件表，原样进 ora。 */
export declare function collectReferenceFilesForSave(): Map<string, Uint8Array | Blob>;
/** 载入恢复（session-state adopt 时调）：ora 交来的参考目录 → 库解清单（含它自己的版本迁移）→ 牌组整副换掉。
 *  库解不了（清单比库新）→ 目录原样带着、状态行如实说。 */
export declare function applyLoadedReferences(files: ReferenceFiles): Promise<void>;
export declare const paletteWindow: PaletteWindow;
export declare function initSideWindows(ctx: AppContext): void;
/** 导入唯一漏斗（spec §5；genai era 同入口）：转码政策（1024² / 小图原样豁免 / 拍平白底 jpeg /
 *  压大保原）→ 追加为新页并翻到 → desk manifest 同步 + sidecar 标脏 + 状态行（压缩了就报 X→Y）。
 *  file input / 剪贴板 / 云盘 picker / import-image drop 路径全走这里。 */
export declare function addReferenceImage(file: File | Blob): Promise<void>;
