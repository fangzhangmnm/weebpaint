import { type Ruler, type StrokeGuide } from "./ruler.ts";
import type { AppContext } from "./app-context.ts";
/** 当前生效的尺：desk.ruler.geo 经校验且种类与 desk.ruler.kind 一致；透视尺 = 透视开着即有。 */
export declare function currentRuler(): Ruler | null;
export declare function rulerPlacing(): boolean;
/** 吸附是否生效（有尺且开关开）。 */
export declare function rulerSnapping(): boolean;
/** input 的投影器提供方（app.ts 接 input.setRulerGuideProvider）。放置态 canDraw=false 结构上到不了这。
 *  pixel = 当前笔是像素画模式 → 整数像素链投影器（Q5，user「必须用整数的像素算法」）；裁剪盒 = doc + 64px 出血（透视链端点可飞远）。 */
export declare function guideForStroke(_role: string, pixel: boolean): StrokeGuide | null;
export declare function enterRulerPlace(): void;
export declare function exitRulerPlace(): void;
/** 左栏尺钮 tap / S 键：放置态 → 收（吸附开）；有尺 → 开/关吸附；无尺 → 进放置。 */
export declare function rulerTap(): void;
export declare function rulerLongpress(): void;
/** 反应式镜像给左栏（尺钮显隐 / 开关态 / 放置态）。toolbar._syncEditModeUI 与本模块的每次状态变化都调。 */
export declare function syncRulerUi(): void;
export declare function initRulerUi(ctx: AppContext): void;
