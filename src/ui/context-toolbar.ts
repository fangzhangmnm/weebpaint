// ContextToolbar —— 顶栏条登记表：「现在哪些上下文工具条在顶部占着位」只有一处知道。created 2026-09-02 by Claude Fable 5.1（UI 纪元 C4）。
//
// 考古：anchored-popup 里手填 `_TOP_TOOLBAR_IDS = ["lassoToolbarStack","cropToolbar","filterBrushToolbar"]`——六条顶栏条
//   只登记了三条（shape / picker / persp 漏），新增一条要记得改那个数组 = T2「popup 定位各写一套」的下一次。
//   本模块：每条 toolbar 由**自己的 owner** 在 init 时登记一行；「让到顶栏条以下」的高度由登记表现算；
//   test/context-toolbar.test.mjs 守住「index.html 里每条 .lasso-toolbar-stack / .crop-toolbar 都登记了」——漏登记 = 测试红。
// 显隐语义不动（各 owner 按 EditMode 自己派生：lasso 两行/shape/picker 在 toolbar.ts，crop 在 doc-ops，persp 在 persp-edit，
//   filterBrush 在 filters-adjust）；本模块只做登记 + 几何查询。

const _registry = new Map<string, HTMLElement>();

/** owner 在 init 时登记（幂等）。 */
export function registerContextToolbar(el: HTMLElement | null): void {
  if (!el) return;
  _registry.set(el.id || `anon-${_registry.size}`, el);
}
/** 已登记 id（测试/诊断）。 */
export function contextToolbarIds(): string[] { return [..._registry.keys()]; }
/** 可见顶栏条的最大 bottom（anchored-popup belowToolbars 用）；无可见 = 0。 */
export function contextToolbarBottom(): number {
  let bottom = 0;
  for (const el of _registry.values()) {
    if (el.classList.contains("hidden")) continue;
    const r = el.getBoundingClientRect();
    if (r.height > 0) bottom = Math.max(bottom, r.bottom);
  }
  return bottom;
}
