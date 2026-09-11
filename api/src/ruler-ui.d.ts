import { type Ruler, type StrokeGuide } from "./ruler.ts";
import type { AppContext } from "./app-context.ts";
import type { StrokeShaper } from "./input.ts";
/** 几何开着（拖画或留尺）。 */
export declare function shapeOn(): boolean;
/** 当前生效的尺：desk.ruler.geo 经校验且种类与 desk.ruler.kind 一致；透视尺 = 透视开着即有。 */
export declare function currentRuler(): Ruler | null;
/** 吸尺是否生效（有尺且开）。 */
export declare function rulerSnapping(): boolean;
/** 描尺：像素笔 / 选区笔起笔取投影器（唯一切口在 input._move）。谁吸尺 = RULER_ROLES。pixel = 整数像素链投影器（Q5）。 */
export declare function guideForStroke(role: string, pixel: boolean): StrokeGuide | null;
/** 拖画 / 留尺：起笔问一次（几何开 + 该 role 在册）；wrap 把内引擎包成「拖一下 = 整形」。 */
export declare const strokeShaper: StrokeShaper;
/** 几何开关（chip / S 键）。 */
export declare function toggleShape(): void;
/** 显隐 + 位置：编辑态（非 transient、非吸色 / 抓手）常显；有别的上下文条可见就挂到它下面一行（入口 A：固定尾位）。
 *  wp:modechange / lassochange / histchange / resize 都调（本模块自己听，toolbar 不认识本模块）。 */
export declare function syncShapeToolbar(): void;
export declare function initRulerUi(ctx: AppContext): void;
