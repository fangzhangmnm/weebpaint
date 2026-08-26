import { type LocalFileHandle } from "./local-file-session.ts";
import type { AppContext } from "./app-context.ts";
export declare function _openImagePicker(): void;
export declare function importImageAsNewDoc(file: File, opts?: {
    nameOverride?: string;
}): Promise<void>;
export declare function importImageAsLayer(file: File, opts?: {
    center?: {
        x: number;
        y: number;
    };
}): Promise<void>;
/** 格式嗅探（唯一一份；此前 input change 与 drop 各抄一份正则）。
 *  "ora-zip" = 加密容器导出件（ADR-0012）——能导入不能原位。 */
export declare function sniffFileKind(f: File): "ora" | "ora-zip" | "image" | "other";
/** .ora 开成 doc 的**唯一进口**：菜单 picker / 拖拽 / 双击唤起 launchQueue / file-input 降级 全走这。
 *  原位优先：有句柄 → session.openLocalFile（明文+有 WeebPaint 痕迹才真原位=file 家）；
 *  交还的（无句柄 / 加密容器 / 外来 ora）落导入为新身份（gallery 家）。 */
export declare function intakeOraDoc(src: {
    handle?: LocalFileHandle | null;
    file?: File | null;
}): Promise<void>;
export declare function initImportImage(ctx: AppContext): void;
export declare function setAddImportAsNewDoc(v: boolean): void;
