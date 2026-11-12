export declare const SMOOTH_DEFAULTS: Readonly<{
    tauMaxMs: 500;
    tailBow: 1;
    stabMaxPx: 8;
    rawStaticSq: 0.005;
    pressureAlpha: 0.4;
}>;
/**
 * 笔的跟手（streamline）、防抖（stabilization）→ 平滑器的参数 {tau, deadzone, tailBow}（BrushEngine.beginStroke 的 smooth）。
 * 2026-11-12（CatsUp 施工单二十 1b，统筹定「平滑只有一个内核函数」）：以前后端起笔自己算一份、三维那边要再抄一份；收成这一个，后端和三维都调它。
 * - streamline / stabilization 先夹到 0..1，不是数就当 0（和后端起笔原来的写法逐字一样）。
 * - tau（毫秒）= 跟手 × SMOOTH_DEFAULTS.tauMaxMs；deadzone = 防抖 × stabMaxPx ÷ scale；tailBow = 出厂值。
 * - scale = 一个画布像素占几个屏幕像素：deadzone 在出厂表里是屏幕像素，平滑器吃的是画布像素，所以除它。
 *   没有视口的地方（后端起笔、三维的屏幕空间笔）传 1。不是正数当 1。
 * - 常数只吃出厂表，不吃用户改过的那份（前端 input.ts 的 _resolveSmooth 吃运行时副本 SMOOTH，那份不归内核）：同样的输入 → 同样的输出。
 * - pixelMode 的笔不平滑，那是调用方的事（这里不看笔的别的字段）。
 */
export declare function resolveSmooth(streamline: unknown, stabilization: unknown, scale: number): {
    tau: number;
    deadzone: number;
    tailBow: number;
};
