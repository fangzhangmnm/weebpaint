/** owner 在 init 时登记（幂等）。 */
export declare function registerContextToolbar(el: HTMLElement | null): void;
/** 已登记 id（测试/诊断）。 */
export declare function contextToolbarIds(): string[];
/** 可见顶栏条的最大 bottom（anchored-popup belowToolbars 用）；无可见 = 0。 */
export declare function contextToolbarBottom(): number;
