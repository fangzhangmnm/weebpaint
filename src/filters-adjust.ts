// 职责：滤镜 / adjust 面板 + filter-brush 模式（单一职责）。
//   - adjust popup 开关（setAdjustOpen，导出给 doc-ops/ctx）
//   - v131 Filter 面板：region filter 的 preview / apply / cancel（_openFilterPanel 入口）
//   - filter 菜单渲染（_renderFilterMenu，订阅 onFilterRegistered）
//   - v132 filter-brush 模式进入/退出 + toolbar（variant / 边界 下拉）
//
// 拆分期约定：import { ctx }，在 initFiltersAdjust() 把用到的 core 单例绑进私有 let，函数体逐字搬迁。
// state.filterBrush 是 active filter-brush 的 SSoT（在 state 上，经绑定的 state 读写）。
import { els } from "./els.ts";
import { registerFloatingWindow, type FloatingWindowHandle } from "./ui/floating-window.ts";   // 2026-09-02 C2 浮窗深模块
import { t, tLatin } from "./i18n/index.ts";
import { desk } from "./workbench-state.ts";
import { PANELS, openExclusive, closeExclusive } from "./panel-state.ts";
import { getFilter, listFilters, onFilterRegistered } from "./filters.ts";
import { positionPopup } from "./anchored-popup.ts";
import { openAdoptedPopup, closePopupMenuOf, isPopupOpen } from "./ui/popup-menu.ts";   // 2026-09-02 C1：调整 popup 收养
import { mountContextToolbar, type ContextToolbarHandle, type ToolbarItem } from "./ui/context-toolbar.ts";   // 2026-09-02 C4 登记 → 2026-09-06 U1 工厂

import { setTool } from "./toolbar.ts";   // 命令 = toolbar 的接口（显式 import）
import { requireEditableLeaf } from "./editable-leaf.ts";
import { resampleItems } from "./frontend/resample-modes.ts";
import { createSelectField, type SelectFieldOpts } from "./ui/select-field.ts";   // 2026-09-02 C6 下拉标准件
import type { ViewLeafSnap as LayerSnap } from "./backend/workpiece/painting-view.ts";
import type { WriteToken } from "./backend/workpiece/workpiece.ts";
import type { AppContext } from "./app-context.ts";
import { iconHtml } from "./ui/icon.ts";
import { preferences } from "./app-prefs.ts";   // 2026-09-05：手指混色空间偏好 smudge-mix（gallery scope）
import { isMixSpace } from "./backend/algorithms/color-mix.ts";

// Filter 对象（filters.js 未类型化 → 描述本面板用到的接口）。
interface FilterLike {
  id: string; title: string; modes: string[]; category?: string;
  hiddenInMenu?: boolean;   // true = 注册但不进菜单（曲线 UI 暂禁，2026-08-25）
  defaults(): Record<string, unknown>;
  buildBody(body: HTMLElement, state: unknown, onChange: () => void): void;
  disposeBody?(state: unknown): void;   // 2026-09-05：关面板 / 重置重建前收口（渐变映射注销 color target）
  onBodyResize?(state: unknown, avail: { w: number; h: number }): void;   // 2026-09-06：声明 = 调整浮窗露右下角 grip；整窗拖大时收 body 可用尺寸（曲线滤镜贴满绘图区）
  bake(src: Uint8ClampedArray, out: Uint8ClampedArray, params: unknown, mask: Uint8Array | null, w: number, h: number): void;
  brushVariants?: { id: string; title: string; params: Record<string, unknown> }[];
  boundaryModes?: { id: string; title: string }[];
  sampleModes?: boolean;   // v0.6.36：声明即渲染采样核下拉（液化；选项 = RESAMPLE_MODES 的 liquify context）
  mixModes?: { id: string; title: string }[];   // 2026-09-05：混色空间下拉（手指 smudge 声明；值经 params.mix，持久化 preferences "smudge-mix"）
  brushSliders?: { key: string; title: string; min: number; max: number; step: number; fmt?: (v: number) => string; variants?: string[]; map?: { toParam(v: number): number; fromParam(p: number): number } }[];   // 2026-09-05：连续旋钮（手指 smear↔dull「揉匀」；值经 params[key]，session 态）；2026-09-06 variants 白名单 + map（对数刻度等）
}
// adjust panel 操作的 doc 活层（doc.js 未类型化 → 只描述用到的）。
interface AdjustLayer { id: number; name: string; bboxX: number; bboxY: number; bboxW: number; bboxH: number; snapshot(): LayerSnap; }
// editMode.enterTransient 的 apply/abort（edit-mode.js 未类型化默认 null → 调用处断言真签名）。
interface TransientOpts { apply?: () => void; abort?: () => void; }
// filter region preview 态（surrogate canvas + 提取的源/掩码数据）。
interface AdjustState {
  Filter: FilterLike; active: AdjustLayer; params: Record<string, unknown>;
  // token = v2 写令牌（T2；开面板即 begin）：apply → replaceFromBytes（collector 扣押）+ commit；
  //   cancel → token.cancel()（层从未被改——预览全在 surrogate 上，collector 空 = 无痕 no-op）。
  // v0.6.39 去 canvas 化：srcImg = tiles 直读；out = 当前预览字节（surrogate 直传 GL / apply 直落 tile）。
  token: WriteToken;
  srcImg: ImageData; out: Uint8ClampedArray; maskData: Uint8Array | null; _rafId: number;
  picker: FilterLike[] | null;
}

let state: AppContext["state"], editMode: AppContext["editMode"], doc: AppContext["doc"], board: AppContext["board"], history: AppContext["history"];
let dialReactive: AppContext["dialReactive"];   // 2026-09-05：filterBrush payload 反应式开关（手指单独 dial）
let wp2: AppContext["wp2"];
let setStatus: AppContext["setStatus"], updateSaveStatus: AppContext["updateSaveStatus"];
let _adjustWin: FloatingWindowHandle | null = null;   // 调整面板浮窗句柄（initFiltersAdjust 注册）
let _suppressTransientPanels: AppContext["_suppressTransientPanels"], _restoreTransientPanels: AppContext["_restoreTransientPanels"];

// ---- topbar：adjustments popup（液化 / 后续调色 etc）----
// 单按钮 → 弹一列 menu-item（同 menuPanel 模式）。学 Procreate adjustments icon。
export function setAdjustOpen(open: boolean) {
  if (!open) { closePopupMenuOf(els.adjustPopup); return; }
  // 2026-09-02 C1：收养进 popup-menu——锚到按钮下方右对齐、让到所有可见顶栏条以下（v219 belowToolbars：
  //   液化等 filterBrush 模式下顶栏条是 filterBrushToolbar）、夹视口；外点关/Escape 归 module。
  openAdoptedPopup(els.adjustPopup, {
    anchor: els.topAdjustBtn, align: "right", belowToolbars: true,
    onClose: () => els.topAdjustBtn.setAttribute("aria-expanded", "false"),
  });
  els.topAdjustBtn.setAttribute("aria-expanded", "true");
}

// ===== v110/114 crop / resample / adjust =====
// 通用：op 前先 commit floating + 把当前 doc + viewport snapshot 当 before
// v131 Filter 面板（重构自原 BCSH 颜色调整）
// 所有 filter 走 src/filters.js 的 Filter 接口（含 id/title/menuId/modes/bleedRadius/defaults/buildBody/bake）
// _adjustState = { Filter, active, params, beforeSnap, srcImg, out, maskData, _rafId }
// 入口 _openFilterPanel(filterId)；Reset / Cancel / Apply 共用
// preview 用 rAF coalesce：slider drag 不堵队列（user：「液化笔刷事件 last commit，slider drag 也是，gaussian blur fps 低 OK，别 queue 卡半天」）
let _adjustState: AdjustState | null = null;     // 见上注释
// === 老 BCSH 实现已迁 src/filters.js HsbFilter，这里只剩 panel infra ===

// 准备 surrogate canvas + 提取 src/mask 数据
function _initFilterSurrogate(L: AdjustLayer) {
  // v0.6.39 去 canvas 化：源像素 tiles 直读（旧 drawImage(L.canvas)+getImageData 走 canvas premult 往返）
  const srcImg = (L as unknown as { getImageData: (x: number, y: number, w: number, h: number) => ImageData }).getImageData(L.bboxX, L.bboxY, L.bboxW, L.bboxH);
  const out = new Uint8ClampedArray(srcImg.data);   // 初始预览 = 原样
  let maskData: Uint8Array | null = null;
  if (doc.selection) {
    // v0.4.6：gray8 窄读口（layer.bbox 对齐平面），canvas 中转死
    maskData = doc.selection.materializeMaskRegion(L.bboxX, L.bboxY, L.bboxW, L.bboxH);
  }
  return { srcImg, out, maskData };
}

// v132 opts.picker = [Filter, ...]：在 panel body 顶部插一个 dropdown 切其他 filter
//   切换 = cancel 当前 → reopen 新 filter（同一 picker）。用于"艺术滤镜"组
function _openFilterPanel(filterId: string, opts: { picker?: FilterLike[] } = {}) {
  const Filter = getFilter(filterId) as FilterLike | undefined;
  if (!Filter) { setStatus(t("mi.unknownFilter", { id: filterId }), true); return; }
  const L = requireEditableLeaf(doc, setStatus) as AdjustLayer | null;   // 组/隐藏 → 标准状态行 + 退出（取代旧的只查 !L）
  if (!L) return;
  if (L.bboxW <= 0 || L.bboxH <= 0) { setStatus(t("mi.activeLayerEmpty"), true); return; }
  // v232 (user：「液化状态下调出色彩平衡，液化没自动关掉」)：filterBrush（液化/锐化模糊）是持久
  // 模式，enterTransient 只捕获 _returnTool、不收它的 toolbar → UI 留着但笔禁用，像坏了。
  // 开任何滤镜面板前先整个退出 filterBrush 模式（收 toolbar / 清 state / 回前一工具）。
  if (state.filterBrush) _exitFilterBrushMode();
  if (_adjustState) _closeFilterPanel(false);
  const { srcImg, out, maskData } = _initFilterSurrogate(L);
  _adjustState = {
    Filter, active: L, params: Filter.defaults(),
    token: wp2.begin("adjust"), srcImg, out, maskData,
    _rafId: 0,
    picker: opts.picker || null,
  };
  if (els.adjustPanelTitle) els.adjustPanelTitle.textContent = opts.picker ? t("mi.artFilters") : Filter.title;
  els.adjustParamsBody.innerHTML = "";
  // picker 模式：插 dropdown
  if (opts.picker) {
    const wrap = document.createElement("label");
    wrap.className = "brush-slider-row";
    wrap.innerHTML = `<span class="brush-slider-label">${t("mi.chooseFilter")}</span>`;
    // 2026-09-02 C6：滤镜挑选下拉走 select-field 标准件（原生 <select> 退役）
    const picker = opts.picker;
    const field = createSelectField({
      className: "generic-sheet-input",
      items: () => picker.map((F) => ({ value: F.id, label: F.title })),
      value: () => filterId,
      onChange: (newId) => {
        if (newId === filterId) return;
        _closeFilterPanel(false);
        _openFilterPanel(newId, { picker });
      },
    });
    field.el.style.flex = "1";
    wrap.appendChild(field.el);
    wrap.appendChild(document.createElement("span"));
    els.adjustParamsBody.appendChild(wrap);
  }
  Filter.buildBody(els.adjustParamsBody, _adjustState, _onFilterChange);
  // 2026-09-06 整窗可拖大：只有声明 onBodyResize 的滤镜露 grip；宽回 CSS 默认，内容比默认宽（记住的大绘图区）就撑开
  els.adjustPanel.classList.toggle("resizable", !!Filter.onBodyResize);
  els.adjustPanel.style.width = "";
  _adjustWin?.open();   // 显示 + 置顶（z 归 floating-window）
  if (Filter.onBodyResize) {
    const over = els.adjustParamsBody.scrollWidth - els.adjustParamsBody.clientWidth;
    if (over > 0) els.adjustPanel.style.width = (els.adjustPanel.offsetWidth + over) + "px";
  }
  const w = els.adjustPanel.offsetWidth || 320;
  // v270：滤镜面板（液化等）走统一 positionPopup——钉视口右边 16px、让到顶栏条以下、读 safe-area、
  //   夹视口。取代原来手搓的 left=innerWidth-w-16 / top=max(104,…)（漏 safe-area、和 toolbar 挤）。
  void w;   // 宽度由 CSS 定，右钉不再需要算 left
  positionPopup(els.adjustPanel, { align: "right", edgeMargin: 16, belowToolbars: true, offsetY: 8 });
  _adjustWin?.clamp();   // positionPopup 之后再钳一次（出血区地板/视口）
  board.setActiveLayerSurrogate?.(L.id, { data: out, w: L.bboxW, h: L.bboxH }, L.bboxX, L.bboxY);   // bbox 给 GL 上传替身 tiles 用（字节直传，就地更新）
  _runFilterPreview();      // 初次渲染（identity）
  _suppressTransientPanels("adjust-color");
  // adjust transient：apply=烤进(true)，abort=丢弃(false)。_closeFilterPanel 是 sync 点（见其尾 exitTransient）。
  (editMode.enterTransient as (n: string, o?: TransientOpts) => void)("adjust", { apply: () => _closeFilterPanel(true), abort: () => _closeFilterPanel(false) });
}

// preview coalesce：rAF 保证最多 1 帧 1 次 bake，slider drag 不堵队列
// (user：「液化笔刷事件 last commit，slider drag 也是，fps 低 OK，别 queue 卡半天」)
function _onFilterChange() {
  if (!_adjustState) return;
  if (_adjustState._rafId) return;
  _adjustState._rafId = requestAnimationFrame(() => {
    if (!_adjustState) return;
    _adjustState._rafId = 0;
    _runFilterPreview();
  });
}
function _runFilterPreview() {
  const s = _adjustState;
  if (!s) return;
  s.Filter.bake(s.srcImg.data, s.out, s.params, s.maskData, s.srcImg.width, s.srcImg.height);   // 就地写预览字节（surrogate 持同一 buffer）
  board.invalidateAll();
}

function _closeFilterPanel(applied: boolean) {
  if (!_adjustState) return;
  const L = _adjustState.active;
  if (_adjustState._rafId) { cancelAnimationFrame(_adjustState._rafId); _adjustState._rafId = 0; }
  board.setActiveLayerSurrogate?.(null, null);
  _adjustState.Filter.disposeBody?.(_adjustState);   // 插件收口（color target 注销等），在 DOM 清空前
  els.adjustPanel.classList.remove("resizable");
  els.adjustPanel.style.width = "";
  if (applied) {
    // 烤进 layer（surrogate 字节已是最终结果 → 直落 tile，零 canvas）。
    // C6 顺手账（census §6.4）：replaceFromBytes（整层 clear+重写 → collector 扣押整层）换
    //   applyRegionDiff——逐 tile memcmp 只封真变 tile，undo 包 = 实际改动（bbox 外无内容、
    //   bbox 内未变 tile 不再陪葬）。字节结果与旧路径逐位一致。
    (L as unknown as { applyRegionDiff: (x: number, y: number, w: number, h: number, src: Uint8ClampedArray) => unknown })
      .applyRegionDiff(L.bboxX, L.bboxY, _adjustState.srcImg.width, _adjustState.srcImg.height, _adjustState.out);
    // 令牌收口：applyRegionDiff 的换手已被 collector 扣押 → 一步入栈（wp:histchange 由栈 onChange 派）。
    _adjustState.token.commit();
    setStatus(t("mi.filterApplied", { title: _adjustState.Filter.title, name: L.name }));
  } else {
    // cancel/abort：层从未被改（预览全在 surrogate 上）→ collector 空，cancel 即无痕收口。
    _adjustState.token.cancel();
  }
  _adjustState = null;
  _adjustWin?.close();
  els.adjustParamsBody.innerHTML = "";
  _restoreTransientPanels();
  board.invalidateAll();
  editMode.exitTransient();   // sync 点：任何关闭路径（OK/cancel/重开/picker/decisive）都清 EditMode transient
}

// v132 菜单 3 组渲染（user：「3 组 hr 分组：调色 / 液化锐化模糊 / 艺术滤镜」）
//   - 调色 = adjustment category + 有 region 模式（HSV / ColorBalance / Curves）
//             左侧 prefix = 旧 adjust SVG（3 条滑块 + 圆点）
//   - 笔刷类 = 液化 + 所有有 brush 模式的 filter
//             左侧 prefix = 笔刷 SVG（跟工具栏一致）
//   - 艺术滤镜 = category="artist"，1 个 picker item（点开 panel 里有 dropdown 切）
//   - 组之间 hr 分隔，不写类别 label
const ADJUST_PREFIX_SVG = iconHtml("sliders", { cls: "menu-item-icon" });
const BRUSH_PREFIX_SVG = iconHtml("pencil", { cls: "menu-item-icon" });
function _renderFilterMenu() {
  const container = document.getElementById("adjustFilterList");
  if (!container) return;
  container.innerHTML = "";
  const all = (listFilters() as FilterLike[]).filter((F) => !F.hiddenInMenu);
  const adjustmentRegion = all.filter((F) => (F.category || "adjustment") === "adjustment" && F.modes.includes("region"));
  const brushFilters     = all.filter((F) => F.modes.includes("brush"));
  const artistFilters    = all.filter((F) => F.category === "artist");
  const addHr = () => {
    const hr = document.createElement("hr"); hr.className = "menu-sep"; container.appendChild(hr);
  };
  const addItem = (label: string, prefixSvg: string, onClick: () => void) => {
    const btn = document.createElement("button");
    btn.className = "menu-item menu-item-with-icon";
    btn.type = "button";
    btn.setAttribute("role", "menuitem");
    btn.innerHTML = `${prefixSvg}<span class="menu-item-label">${label}</span>`;
    btn.addEventListener("click", onClick);
    container.appendChild(btn);
    return btn;
  };
  let groupOpened = false;
  // 1) 调色
  for (const F of adjustmentRegion) {
    addItem(F.title, ADJUST_PREFIX_SVG, () => {
      setAdjustOpen(false);
      _openFilterPanel(F.id);
    });
    groupOpened = true;
  }
  // 2) 笔刷类 filter（液化 / 锐化模糊 都是 plugin，自动列出来）
  if (groupOpened && brushFilters.length > 0) addHr();
  groupOpened = brushFilters.length > 0;
  for (const F of brushFilters) {
    addItem(F.title, BRUSH_PREFIX_SVG, () => {
      setAdjustOpen(false);
      _enterFilterBrushMode(F);
    });
  }
  // 3) 艺术滤镜（1 picker item）
  if (artistFilters.length > 0) {
    if (groupOpened) addHr();
    addItem(t("mi.artFilters"), ADJUST_PREFIX_SVG, () => {
      setAdjustOpen(false);
      _openArtistPicker();
    });
  }
}
// 艺术滤镜：开 adjust panel，body 顶部加 dropdown 切具体 filter
function _openArtistPicker() {
  const artist = (listFilters() as FilterLike[]).filter((F) => F.category === "artist");
  if (artist.length === 0) { setStatus(t("mi.noArtFilters")); return; }
  _openFilterPanel(artist[0].id, { picker: artist });
}

// v132 进入 / 退出 filter brush 模式
//   进入：state.filterBrush = { Filter, params, variantId, variantLabel }；setTool("filterBrush")
//        + openExclusive 弹 filter brush rack（user：「我不是让你做两个新笔吗」）
//        + variantId 优先用 toolStates.filterBrush.variantId 持久化值
//        + toolbar 渲染子算法 dropdown（user：「不同算法是 toolbar dropdown」）
//   退出：清 state.filterBrush；关 rack；setTool 回前一个
let _filterBrushPreviousTool: string | null = null;
function _enterFilterBrushMode(Filter: FilterLike, variantId?: string) {
  editMode.applyPendingTransient();
  _filterBrushPreviousTool = editMode.current() === "filterBrush" ? "brush" : editMode.current();
  // 取持久化的 variantId（user 上次选过的；新 doc 默认第一个）；显式传入（顶栏子工具）优先
  const variants = Filter.brushVariants || [{ id: "default", title: Filter.title, params: Filter.defaults() }];
  const tsKey = _toolStateKeyFor(Filter);   // 2026-09-05：手指的 variant/dial 记在 toolStates.smudge
  const savedVid = state.toolStates[tsKey]?.variantId;
  let variant = (variantId ? variants.find((v) => v.id === variantId) : undefined) || variants.find((v) => v.id === savedVid) || variants[0];
  // v147 声明了 boundaryModes 的 filter（液化）→ params 带上持久化的 bleed；其他 filter 不掺这个 key
  let params = Filter.boundaryModes
    ? { ...variant.params, bleed: desk.liquify.bleed }
    : variant.params;
  if (Filter.sampleModes) params = { ...params, sample: desk.liquify.sample };
  if (Filter.mixModes) params = { ...params, mix: _currentMixSpace() };   // 2026-09-05 手指：混色空间跟偏好
  // 2026-09-06 「揉匀」旋钮值跟画走（toolStates.<key>.dull）：有记录 → 覆盖 variant 预设
  { const savedDull = state.toolStates[tsKey]?.dull; if (Filter.brushSliders?.some((sl) => sl.key === "dull") && typeof savedDull === "number") params = { ...params, dull: savedDull }; }
  state.filterBrush = { Filter, params, variantId: variant.id, variantLabel: variant.title };
  if (state.toolStates[tsKey]) state.toolStates[tsKey].variantId = variant.id;
  dialReactive.payload = Filter.id;   // 先于 setTool：currentBrush/rack 按 payload 选 dial key
  setTool("filterBrush");
  _renderFilterBrushToolbar();
  // v132 (user：「点 filter brush 不要自动弹笔架」) 进入时不开 rack
  //   user 想换笔点 toolbar 的「笔架」button
  setStatus(t("mi.filterBrushMode", { title: Filter.title }));
}
function _currentMixSpace(): string {
  const v = preferences.get("smudge-mix");
  return isMixSpace(v) ? v : "srgb";
}
// 手指（smudge）单独 dial（2026-09-05 user 拍板）；其它滤镜笔共用 filterBrush 那份。与 rack.getRackToolKey 同判据。
function _toolStateKeyFor(Filter: FilterLike): string { return Filter.id === "smudge" ? "smudge" : "filterBrush"; }
function _exitFilterBrushMode() {
  state.filterBrush = null;
  dialReactive.payload = null;
  _fbToolbar?.hide();
  closeExclusive();   // 收 rack
  setTool(_filterBrushPreviousTool || "brush");
  _filterBrushPreviousTool = null;
  setStatus(t("mi.exitedFilterBrush"));
}
// 滤镜笔上下文工具条（v0.6.62 模板化 → 2026-09-06 U1 走 ui/context-toolbar 工厂）：
//   按 filter 声明的能力**按序**出 spec：title → variant → sample → mix → 连续旋钮 → bleed（有选区）→ | → 笔架 → ✓。
//   chrome/定位/「…」溢出全归工厂（与套索/形状条同皮同位——user 2026-09-05「smudge 笔刷工具条位置不对」的病根是 .crop-toolbar 皮）。
let _fbToolbar: ContextToolbarHandle | null = null;
function _fbRows(): ToolbarItem[][] {
  const fb = state.filterBrush;
  if (!fb) return [];
  const Filter = fb.Filter as FilterLike;
  const items: ToolbarItem[] = [{ kind: "title", text: Filter.title }];
  // ① 子算法（多 variant 才显）
  const variants = Filter.brushVariants || [];
  if (variants.length > 1) {
    items.push({ kind: "select", id: "filterBrushVariantSel", title: tLatin("fb.variant"), items: () => variants.map((v) => ({ value: v.id, label: v.title })), value: () => fb.variantId || "", onChange: (id) => {
      const v = variants.find((x) => x.id === id);
      if (!v) return;
      // 切 variant 别丢 bleed/sample/mix（声明了对应能力的 filter 才有这些 key）
      let np = Filter.boundaryModes ? { ...v.params, bleed: fb.params.bleed } : v.params;
      if (Filter.sampleModes) np = { ...np, sample: fb.params.sample };
      if (Filter.mixModes) np = { ...np, mix: fb.params.mix };
      fb.params = np;
      fb.variantId = v.id;
      fb.variantLabel = v.title;
      { const k = _toolStateKeyFor(Filter); const ts = state.toolStates[k]; if (ts) { ts.variantId = v.id; ts.dull = typeof np.dull === "number" ? np.dull : undefined; } }   // 切 variant：旋钮记忆回预设
      // UI 态不 mark dirty（user 2026-06-10）：variant 选择是工具态，保存时顺手捞；真应用滤镜走 histchange 门。
      setStatus(t("mi.switchedTo", { title: v.title }));
      _renderFilterBrushToolbar();   // 旋钮值随 variant 预设变 → 重画条
    } });
  }
  // ② 采样核（液化）：选项 = RESAMPLE_MODES 的 liquify context；持久化 desk.liquify.sample
  if (Filter.sampleModes) {
    items.push({ kind: "select", id: "filterBrushSampleSel", title: tLatin("fb.sample"), items: () => resampleItems("liquify", tLatin as (key: string) => string), value: () => (fb.params.sample as string) || "bicubic",
      onChange: (v) => { fb.params = { ...fb.params, sample: v }; desk.liquify.sample = v; } });
  }
  // ②b 混色空间（手指）：值 → params.mix，持久化 preferences "smudge-mix"（gallery scope）
  if (Filter.mixModes) {
    items.push({ kind: "select", id: "filterBrushMixSel", title: tLatin("fb.mix"), items: () => Filter.mixModes!.map((m) => ({ value: m.id, label: m.title })), value: () => (fb.params.mix as string) || "srgb",
      onChange: (v) => {
        fb.params = { ...fb.params, mix: v };
        preferences.set("smudge-mix", v);
        const m = Filter.mixModes!.find((x) => x.id === v);
        setStatus(t("mi.switchedTo", { title: m ? m.title : v }));
      } });
  }
  // ②c 连续旋钮（手指 smear↔dull「揉匀」）：值 → params[key]；session 态
  for (const sl of Filter.brushSliders || []) {
    if (sl.variants && !sl.variants.includes(fb.variantId || "")) continue;   // 2026-09-06 variant 专属旋钮（稀释/记忆只在带颜料的手指）
    const toP = sl.map?.toParam ?? ((v: number) => v), fromP = sl.map?.fromParam ?? ((p: number) => p);
    items.push({ kind: "slider", id: `filterBrushSlider-${sl.key}`, label: sl.title, min: sl.min, max: sl.max, step: sl.step, fmt: sl.fmt ? (v) => sl.fmt!(toP(v)) : undefined,
      value: () => (typeof fb.params[sl.key] === "number" ? fromP(fb.params[sl.key] as number) : sl.min),
      onInput: (v) => {
        const pv = toP(v);
        fb.params = { ...fb.params, [sl.key]: pv };
        // 持久化只有 dull（per-doc，user 点头）；稀释/记忆 = 新持久化字段，落地前要 user 一句话同意（handoff §5）→ 先 session 态
        if (sl.key === "dull") { const ts = state.toolStates[_toolStateKeyFor(Filter)]; if (ts) ts.dull = pv; }
      } });
  }
  // ③ 边界取样（液化且有选区）
  if (Filter.boundaryModes && doc.selection) {
    items.push({ kind: "select", id: "filterBrushBleedSel", title: tLatin("fb.bleed"), items: () => Filter.boundaryModes!.map((b) => ({ value: b.id, label: b.title })), value: () => (fb.params.bleed as string) || "edge",
      onChange: (v) => {
        fb.params = { ...fb.params, bleed: v };
        desk.liquify.bleed = v;
        const m = Filter.boundaryModes!.find((b) => b.id === v);
        setStatus(t("mi.boundary", { mode: m ? m.title : v }));
      } });
  }
  items.push({ kind: "sep" });
  // 笔架（user v132「ui 里有开笔架，不然关了开不了」）+ ✓ 退出
  items.push({ kind: "button", id: "filterBrushOpenRack", icon: "brush-rack", title: tLatin("rack.sheet"), onClick: () => openExclusive(PANELS.RACK_FILTER_BRUSH), foldPriority: -1 });
  items.push({ kind: "button", id: "filterBrushExit", icon: "check", title: tLatin("common.exit"), onClick: _exitFilterBrushMode, foldPriority: -2 });
  return [items];
}
function _renderFilterBrushToolbar() {
  if (!state.filterBrush || !_fbToolbar) return;
  _fbToolbar.replaceRows(_fbRows());
  _fbToolbar.show();
}

export function initFiltersAdjust(ctx: AppContext) {
  ({ state, editMode, doc, board, history, setStatus, updateSaveStatus, wp2,
     _suppressTransientPanels, _restoreTransientPanels, dialReactive } = ctx);
  // 调整面板 = 浮窗（2026-09-02 C2）：z/拖/钳制归 ui/floating-window；初始摆位仍走 positionPopup（钉右、让顶栏）。
  //   不进 transient 抑制（它本身就是 adjust-color transient 的 UI）。拖动那份原在 topbar-menu.ts，已删。
  // 2026-09-06 U1：滤镜笔条 = 工厂造（init 即 mount，hidden；登记自动）。id 保留 "filterBrushToolbar"（toolbar.ts setTool 按 id 藏它）。
  _fbToolbar = mountContextToolbar({ id: "filterBrushToolbar", rows: [], ariaLabel: tLatin("fb.title") });
  // 2026-09-05 手指工具：toolbar setTool("smudge") 发事件进 filterBrush 模式（payload = smudge 插件）。
  //   toolbar 不 import 本模块（本模块 import 它的 setTool，防环），故走 window 事件（同 wp:settool 姿势）。
  //   2026-09-06：detail 可带 variant（{ id, variant }）——顶栏「手指」位子工具（模糊/锐化/液化）直接进指定 variant。
  window.addEventListener("wp:enter-filter-brush", (e: Event) => {
    const d = (e as CustomEvent).detail as string | { id?: string; variant?: string } | undefined;
    const id = typeof d === "string" ? d : String(d?.id ?? "");
    const variant = typeof d === "object" && d ? d.variant : undefined;
    const F = getFilter(id) as FilterLike | null | undefined;
    if (F && (F.modes || []).includes("brush")) _enterFilterBrushMode(F, variant);
    else setStatus(t("st.filterBrushErr", { msg: `unknown filter brush "${id}"` }));
  });
  // 2026-09-06 晚 整窗可拖大（user「resize curves window」）：右下角 grip 归 floating-window；本窗只写宽（高由内容撑，
  //   滤镜按 onBodyResize 收到的可用尺寸自己撑内容——曲线滤镜把绘图区贴满）。没声明 onBodyResize 的滤镜不露 grip（.resizable）。
  _adjustWin = registerFloatingWindow(els.adjustPanel, {
    id: "adjust", head: els.adjustPanelHead, ignoreDragOn: (t) => !!t.closest(".float-panel-close"), fallbackSize: { w: 320, h: 300 },
    resize: {
      grip: document.getElementById("adjustPanelResize"),
      min: { w: 240, h: 200 },
      apply: ({ w, h }) => {
        const st = _adjustState;
        const panel = els.adjustPanel;
        const F = st?.Filter as FilterLike | undefined;
        if (!st || !F?.onBodyResize) return;
        // 面板非 body 的 chrome 高（标题栏 + 参数区里绘图区以外的行 + 脚）：= 现高 − 现 body 内容区高
        const bodyEl = els.adjustParamsBody;
        const chromeH = panel.offsetHeight - bodyEl.clientHeight;
        const padX = panel.offsetWidth - bodyEl.clientWidth;
        panel.style.width = Math.round(w) + "px";
        F.onBodyResize(st, { w: w - padX, h: h - chromeH });
      },
    },
  });

  els.topAdjustBtn.addEventListener("click", (e: Event) => {
    e.stopPropagation();
    setAdjustOpen(!isPopupOpen(els.adjustPopup));
  });
  // （调整 popup 外点关 2026-09-02 C1 归 popup-menu；这里那份删）

  _renderFilterMenu();
  onFilterRegistered(_renderFilterMenu);

  document.getElementById("adjustReset")?.addEventListener("click", () => {
    if (!_adjustState) return;
    _adjustState.Filter.disposeBody?.(_adjustState);
    _adjustState.params = _adjustState.Filter.defaults();
    els.adjustParamsBody.innerHTML = "";
    _adjustState.Filter.buildBody(els.adjustParamsBody, _adjustState, _onFilterChange);
    _onFilterChange();
  });
  document.getElementById("adjustCancel")?.addEventListener("click", () => _closeFilterPanel(false));
  document.getElementById("adjustPanelClose")?.addEventListener("click", () => _closeFilterPanel(false));
  document.getElementById("adjustApply")?.addEventListener("click", () => _closeFilterPanel(true));
}
