// 职责（单一）：汉堡 ⋯ 菜单面板——设置开关（压·粗 / 压·透 / 长按吸色 / 透明棋盘 / 像素栅格 /
// 主题 / 检测更新 stub / 清空 stub）+ 快捷键 sheet（从 KEYBOARD_SHORTCUTS 自动渲染）+ 菜单开关。
//
// 旧 app.js 「汉堡菜单」区逐字搬来；app.js 短路成 import + initSettingsMenu() 装配。
// setMenuOpen export 给 ctx（doc-ops 等也调）；boot 的 apply* 初始化调用进 initSettingsMenu()。
//
// 仍留 app.js 的协作件经 ctx 绑入：state / board / setStatus / store / updateSaveStatus（核心单例）。

import { updateCloudAuthUI } from "./gallery/cloud-auth-ui.ts";
import { els } from "./els.ts";
import { preferences } from "./app-prefs.ts";   // P5 唯一门面：scope 由 registry 定（手势/视图/开关各归其层）
import { desk } from "./workbench-state.ts";   // checkboard = per-doc desk（载入时经 wp:applyEditorState 应用到 board）
import { applyTheme, themeLabel, THEMES, currentTheme } from "./theme.ts";
import { t, lang, setLang, LANGS, langDisplayName, type Key } from "./i18n/index.ts";
import { KEYBOARD_SHORTCUTS } from "./input.ts";
import { _updateMenuCropLabel } from "./doc-ops.ts";
import { openAdoptedPopup, closePopupMenuOf, isPopupOpen } from "./ui/popup-menu.ts";
import { openSheet, closeSheet } from "./ui/sheet.ts";   // 2026-09-02 C3   // 2026-09-02 C1：主菜单收养进 popup-menu（外点关/Escape/栈/定位一处）
import { wireInlineSelect } from "./inline-select.ts";
import { openInputSheet } from "./sheets.ts";
import { reportError } from "./error-badge.ts";   // 全 app 唯一错误汇拢点（CLAUDE.md）
import { initInstallCapture, bindInstallButton } from "./install-prompt.ts";
import { hasGallery, GALLERY_CAPABILITY_EVENT } from "./gallery-capability.ts";
import { galleryAttachment } from "./gallery-attachment-host.ts";   // P3：设置页只读显示当前库
import { isAuthConfigured, isSignedIn } from "./app-store.ts";   // auth 公共面（cloud-auth-ui 同款直连）
import { session } from "./session-state.ts";   // 云开关关闭前 flush（saveAndPush）用；只调不改
import type { AppContext } from "./app-context.ts";

// KEYBOARD_SHORTCUTS 元素（input.js 未类型化 → 描述渲染用到的字段）。
interface ShortcutLike { category?: string; desc: string; combo: string; }

let state: AppContext["state"], board: AppContext["board"], setStatus: AppContext["setStatus"], updateSaveStatus: AppContext["updateSaveStatus"];

// （openSheet/closeSheet 拷贝 2026-09-02 C3 退役：走 ui/sheet）

function setMenuItem(btn: HTMLElement, on: boolean, stateLabel = on ? t("common.on") : t("common.off")) {
  btn.setAttribute("aria-pressed", on ? "true" : "false");
  const st = btn.querySelector('.menu-item-state');
  if (st) st.textContent = stateLabel;
}

// （全局压感开关 applyPressureSize/Opacity 已 deprecate 2026-07-14 → 每笔自带，见 resolved-brush）
//
// ⚠**render* / apply* 的分工是纪律，不是风格**（v409 修的 P0-1）：
//   render*(on) = 只贴 RAM/DOM/board，**绝不写盘**；apply*(on) = render* + setItem（写 collection → 触发云同步）。
//   **boot 只准调 render***。v406-v408 boot 调的是 apply*（读完立刻回写）→ collection.setItem 无条件盖
//   `uat: now()` → per-item LWW 变成「**最后冷启动**的设备赢」而非「最后修改的设备赢」：
//   iPad 上开的设置，被桌面机下次冷启动的回写盖掉、还推回云端把 iPad 也清了。4 个 synced 键的跨设备同步等于打死。
//   theme.ts（renderTheme 不写盘）和 i18n（setLang 有 `l === lang()` 早退）本来就守着这条纪律，恰好躲过；
//   settings-menu 当时没守。别再让 boot 路径碰 setItem。
function renderLongPressPick(on: boolean) {
  state.longPressPick = !!on;
  setMenuItem(els.menuLongPressPick, on);
}
function applyLongPressPick(on: boolean) {
  renderLongPressPick(on);
  desk.longPressPick = !!on;   // P5 Slice C：per-doc（跟画走；切换不标脏，存时随 desk 落）
}
function renderSingleFingerDraw(on: boolean) {
  state.singleFingerDraw = !!on;
  setMenuItem(els.menuSingleFingerDraw, on);
}
function applySingleFingerDraw(on: boolean) {
  renderSingleFingerDraw(on);
  preferences.set("single-finger-draw", !!on);   // device 层（硬件耦合；默认关——不拦鼠标，见 pointer-route）
}
export function applyCheckerboard(on: boolean) {
  // v125: checkerboard per-doc，不再写 localStorage
  state.checkerboard = !!on;
  setMenuItem(els.menuCheckerboard, on);
  board.setShowCheckerboard?.(!!on);
  board.invalidateAll();
  board.requestRender();
}

// v163 像素栅格 → P5 per-doc（desk.pixelGrid，跟 ora 走；user 拍板）
function renderPixelGrid(on: boolean) {
  board.setPixelGridEnabled?.(!!on);
  setMenuItem(els.menuPixelGrid, !!on);
}
function applyPixelGrid(on: boolean) {
  renderPixelGrid(on);
  desk.pixelGrid = !!on;   // P5 Slice C：per-doc（user 拍板「必跟 ora」）
}

// v275 FPS 计：dev 性能读数（角落 overlay）；跨设备偏好（synced-user-preference），默认关。防煤气灯。
function renderFps(on: boolean) {
  board.setShowFps?.(!!on);
  setMenuItem(els.menuFps, !!on);
}
function applyFps(on: boolean) {
  renderFps(on);
  preferences.set("show-fps", !!on);   // session 层（不持久化，user 拍板）
}

// v0.5.28 生成式 AI 总开关：body[data-gen-ai] = 全 app 热切换钩子（未来 AI UI 挂 .needs-gen-ai 类即受控；
//   JS 消费者直读 pref）。不进 boot——功能入口显隐，fixup 相回灌晚一拍无感知（boot 门只配 lang/theme 那类 eval 期锁死值）。
export function genAiEnabled(): boolean {
  return preferences.get("gen-ai");
}
function renderGenAI(on: boolean) {
  document.body.dataset.genAi = on ? "1" : "";
  // v0.6.14：图库菜单的 gen-AI 代理开关已撤（user：不影响图库）——只剩主菜单一处
  document.getElementById("menuGenAI")?.setAttribute("aria-pressed", on ? "true" : "false");
  document.querySelectorAll('[data-state-for="genAI"]').forEach((st) => { st.textContent = on ? t("common.on") : t("common.off"); });
}
function applyGenAI(on: boolean) {
  renderGenAI(on);
  preferences.set("gen-ai", !!on);
}

// ============ 图库能力区（P3 sunset 2026-08-27；接缝 = gallery-capability.ts）============
// toggle 已退役（§9.8：「关云」的真身 = 没挂图库；动词在 gallery 管理面）。设置页只读显示当前库
//   （Q1 拍板：设置页管库内偏好，不管库的生死）。gating 消费面照旧（hasGallery 换了真相源）。
function renderCurrentGallery() {
  // 「当前图库」信息行已删（user 2026-08-28「位置奇怪」）→ 改两处就地显示：
  //   ① gallery 页大标题旁小字（#galleryTitleName，下对齐）②「回到图库」行尾简写截断（#menuGalleryName）。
  const att = galleryAttachment.state();
  const name = att.kind === "attached"
    ? att.entry.label + (att.online ? "" : t("gm.offlineSuffix"))
    : hasGallery() ? "OneDrive" : "";
  const titleEl = document.getElementById("galleryTitleName");
  if (titleEl) titleEl.textContent = name;
  const menuEl = document.getElementById("menuGalleryName");
  if (menuEl) { menuEl.textContent = name; menuEl.title = name; }
  // P6 轻折叠（P5 注：无库语境该区折叠=不撒谎）：无库时 gallery scope 徽章藏起——那些行此刻
  //   经 cascade 写落 device 层，挂着「这个图库」徽章才是撒谎。行本身保留（lang 无库也要能改）。
  try { document.body.toggleAttribute("data-no-gallery", !hasGallery()); } catch { /* node */ }
  applyGalleryCapabilityGating();
}

// gating 显隐的**唯一集中点**（v1.1，2026-08-21 headless 实锤修）：菜单项显隐机制是 `hidden` **属性**
//   （styles.css:850 `.menu-item[hidden]{display:none}`）——v1 用 `.hidden` class 藏 menuGallery，
//   而全仓没有全局 .hidden 规则、.menu-item 自身 display:flex 胜出 → 藏了个寂寞。此类显隐一律走属性。
//   订阅 GALLERY_CAPABILITY_EVENT：将来任何地方切开关，这里一处重贴全部 UI。
function applyGalleryCapabilityGating() {
  const on = hasGallery();
  if (els.menuGallery) els.menuGallery.hidden = !on;                   // 图库入口（云账号 popup 等随图库一并不可达）
  const cloudImport = document.getElementById("layerImportCloudBtn");  // 图层面板「从云盘导入…」
  if (cloudImport) (cloudImport as HTMLButtonElement).hidden = !on;
  const connect = document.getElementById("menuConnectGallery");       // P3 无库单入口（与 menuGallery 反相）
  if (connect) (connect as HTMLButtonElement).hidden = on;
  document.getElementById("referencePanel")?.toggleAttribute("no-cloud", !on);   // 参考窗云盘选图钮（组件观察属性）
}
window.addEventListener(GALLERY_CAPABILITY_EVENT, renderCurrentGallery);   // 换库/卸库 → 当前库行 + gating 一并重贴

// v124 快捷键 sheet：从 KEYBOARD_SHORTCUTS 自动渲染（input.js 注册的唯一真理源）
const _shortcutsSheet = document.getElementById("shortcutsSheet");
const _shortcutsBody = document.getElementById("shortcutsBody");
function _renderShortcutsSheet() {
  if (!_shortcutsBody) return;
  const byCat = new Map<string, ShortcutLike[]>();
  for (const sc of KEYBOARD_SHORTCUTS) {
    const cat = sc.category || "sc.cat.other";   // category 现存 i18n key（input.ts）
    if (!byCat.has(cat)) byCat.set(cat, []);
    byCat.get(cat)!.push(sc);
  }
  // 同 combo 多 entry（如 Escape 在 floating / hasSelection 两条）合并展示
  let html = "";
  for (const [cat, list] of byCat) {
    html += `<div class="shortcuts-category">${t(cat as Key)}</div>`;
    for (const sc of list) {
      html += `<div class="shortcuts-row"><span>${t(sc.desc as Key)}</span><span class="shortcuts-combo">${sc.combo}</span></div>`;
    }
  }
  _shortcutsBody.innerHTML = html;
}

// collection hydrate 后由 app.ts 的 fixup 相调：把 4 个 synced 开关的**真值**灌进 RAM/DOM/board。
//   **只 render 不写盘**（见上方纪律）——这是 P0-1 的修复核心：boot 路径永不 setItem。
export function renderSettingsFromPrefs(): void {
  // P5 Slice C：pixel-grid/long-press-pick/menu-tab 已 per-doc（desk）——由 wp:applyEditorState
  //   处的 _renderPerDocFromDesk 随每次载入回灌，不在本函数（本函数只管非 per-doc 层）。
  renderFps(preferences.get("show-fps"));
  renderGenAI(genAiEnabled());
  renderCurrentGallery();   // P3：当前库只读行 + gating 重贴
  renderSingleFingerDraw(preferences.get("single-finger-draw"));
  _renderPerDocFromDesk();   // boot 首帧也灌一次（此刻 desk=工厂默认；开画后 applyEditorState 再灌真值）
}

export function setMenuOpen(open: boolean) {
  if (!open) { closePopupMenuOf(els.menuPanel); return; }
  // 2026-09-02 C1：主菜单 = popup-menu 收养的静态节点——定位（v270 positionPopup：左对齐按钮 + safe-area + 夹视口）、
  //   外点关、Escape、与菜单内下拉（主题/语言 = 子 popup，父留着）的栈关系全在 module。内容仍在 index.html。
  openAdoptedPopup(els.menuPanel, {
    anchor: els.menuBtn, align: "left", offsetY: 6,
    onClose: () => els.menuBtn.setAttribute("aria-expanded", "false"),
  });
  els.menuBtn.setAttribute("aria-expanded", "true");
  _updateMenuCropLabel?.();
  updateCloudAuthUI();   // v0.6.26：登录项显隐每次开菜单重派生（auth 静默恢复不触发 wp:auth-changed 的路径漏网——真机：登录后没隐藏）
}

// v0.6C tab 分页状态（module 级：init 建，renderSettingsFromPrefs 回灌持久化值）
let _menuTab = "file";
let _menuTabs: HTMLElement[] = [];

// P5 Slice C：per-doc 三项（desk SSoT）→ UI/热镜像回灌。载入（wp:applyEditorState）与 boot 首帧共用。
function _renderPerDocFromDesk() {
  renderPixelGrid(desk.pixelGrid);
  renderLongPressPick(desk.longPressPick);
  if (_menuTabs.some((b) => b.dataset.menuTab === desk.menuTab)) { _menuTab = desk.menuTab; _applyMenuTab(); }
}
let _menuPages: HTMLElement[] = [];
function _applyMenuTab() {
  for (const b of _menuTabs) b.setAttribute("aria-pressed", b.dataset.menuTab === _menuTab ? "true" : "false");
  for (const p of _menuPages) p.classList.toggle("hidden", p.dataset.menuPage !== _menuTab);
}

export function initSettingsMenu(ctx: AppContext) {
  // 0828 iPad 实锤：boot 静默探号在后台，attach 时 isSignedIn 还 false → 名字行落「已离线」尾巴，
  //   setOnline(true) 后没人重画 → 长挂假离线。attachment 一变就重画（attach/detach/翻牌全覆盖）。
  galleryAttachment.onChange(() => renderCurrentGallery());
  ({ state, board, setStatus, updateSaveStatus } = ctx);

  // v0.9.26 PWA 安装入口（user 2026-08-20）：capture 要尽早挂（事件发在监听前就收不到了）；
  //   设置页按钮在此绑，图库菜单那颗在 gallery-shell 绑（各自收各自的面板）。
  initInstallCapture();
  bindInstallButton(document.getElementById("menuInstallApp"), () => setMenuOpen(false));

  // v0.6C（user 拍板）：☰ tab 分页。0830 重组后五页（文件/画布/设置/插件/dev）——视图 tab 解散：
  //   工作台件归画布页、显示开关并入设置页（旧 desk.menuTab="view" 由下方 some() 守卫自然落回 file）。
  //   停留页 RAM 记忆（session 内）。
  {
    _menuTabs = [...document.querySelectorAll<HTMLElement>("#menuPanel .menu-tab")];
    _menuPages = [...document.querySelectorAll<HTMLElement>("#menuPanel .menu-page")];
    for (const b of _menuTabs) b.addEventListener("click", (e: Event) => {
      e.stopPropagation();
      _menuTab = b.dataset.menuTab!;
      desk.menuTab = _menuTab;   // v0.5.27 停留页 → P5 per-doc（editor 语境跟画走，user 拍板）
      _applyMenuTab();
    });
    _applyMenuTab();
    // 持久化回灌走 renderSettingsFromPrefs（fixup 相，prefs 已 hydrate——同其它 pref 的时序纪律）
  }

  els.menuLongPressPick.addEventListener("click", () => {
    applyLongPressPick(!state.longPressPick);
    setStatus(t("status.longPressPick", { s: state.longPressPick ? t("common.on") : t("common.off") }));
  });
  els.menuSingleFingerDraw.addEventListener("click", () => {
    applySingleFingerDraw(!state.singleFingerDraw);
    setStatus(t("status.singleFingerDraw", { s: state.singleFingerDraw ? t("common.on") : t("common.off") }));
  });
  // desk 载入：文档的 checkboard 回灌到 board（applyCheckerboard 只写 board+mirror，不写 desk→不标脏；守人类 2026-06-10 决定）。
  window.addEventListener("wp:applyEditorState", () => { applyCheckerboard(desk.checkboard); _renderPerDocFromDesk(); });
  els.menuCheckerboard.addEventListener("click", () => {
    applyCheckerboard(!state.checkerboard);
    // UI 态不 mark dirty（user 2026-06-10）：棋盘是观感开关，下次真编辑保存时顺手捞进 state.json。
    //   不再 edits.mark()——否则切个棋盘就让已同步的画变「未保存」。
    setStatus(t("status.checkerboard", { s: state.checkerboard ? t("common.on") : t("common.off") }));
  });

  if (els.menuPixelGrid) els.menuPixelGrid.addEventListener("click", () => {
    const next = !board.getPixelGridEnabled();
    applyPixelGrid(next);
    setStatus(t("status.pixelGrid", { s: next ? t("common.on") : t("common.off") }));
  });

  // #10 主栅格（tilemap 对齐）：per-doc（desk.grid），一直显示不渐隐（对照像素栅格的放大渐显）。
  //   同 checkerboard 纪律：观感开关不 mark dirty（desk setter 本就不标脏）。
  const applyDocGrid = () => {
    board.setDocGrid?.(desk.grid.on, desk.grid.cell);
    setMenuItem(els.menuDocGrid, desk.grid.on);
    // 并行样式（2026-08-21）：尺寸显示挪进主按钮的 sub 槽（menuDocGridCell 已变扳手，内部无 state 槽）
    const cellLabel = document.getElementById("menuDocGridCellSub");
    if (cellLabel) cellLabel.textContent = `${desk.grid.cell}px`;
  };
  window.addEventListener("wp:applyEditorState", applyDocGrid);
  els.menuDocGrid?.addEventListener("click", () => {
    desk.grid.on = !desk.grid.on;
    applyDocGrid();
    setStatus(t("status.docGrid", { s: desk.grid.on ? t("common.on") : t("common.off") }));
  });
  els.menuDocGridCell?.addEventListener("click", async () => {
    setMenuOpen(false);
    const v = await openInputSheet(t("menu.docGridCellTitle"), String(desk.grid.cell), { placeholder: "16" });
    if (v == null) return;
    const n = Math.max(2, Math.min(1024, parseInt(v, 10) || 0));
    if (!n) return;
    desk.grid.cell = n;
    if (!desk.grid.on) desk.grid.on = true;   // 设了尺寸=想看到它，顺手打开
    applyDocGrid();
    setStatus(t("status.docGridCell", { n }));
  });
  applyDocGrid();

  if (els.menuFps) els.menuFps.addEventListener("click", () => {
    const next = !board.getShowFps?.();
    applyFps(next);
    setStatus(t("status.fps", { s: next ? t("common.on") : t("common.off") }));
  });
  document.getElementById("menuGenAI")?.addEventListener("click", () => {
    const next = !genAiEnabled();
    applyGenAI(next);
    setStatus(t("status.genAI", { s: next ? t("common.on") : t("common.off") }));
  });
  // P3 sunset：云端功能 toggle 已退役（关云前 flush 的数据安全职责由 attachment 器官的
  //   收口开画 gate + 绿灯门接管——detach 前必须无开画、无 dirty，比旧 flush 更硬）。
  // v0.5.37（user）：主题/语言换 in-app 下拉——原生 select 打开态是 chrome 域（iPad 弹层系统字体，
  //   UCSUR 必豆腐；夜间白底、装不了 SVG 同根性坑）。弹层复用紧凑菜单 list 形态 + 锚定。
  //   条目开时现建 → 标签永远新鲜（字体门迟到翻转后 endonym/主题名自动带字形）。
  wireInlineSelect("menuThemeBtn",
    () => THEMES.map((th) => ({ value: th, label: themeLabel(th) })),
    () => currentTheme(),
    (th) => { applyTheme(th); setStatus(t("status.theme", { s: themeLabel(th) })); });
  // 语言：下拉框选择（endonym = 各语母语名，任何 UI 语言都认得；change 即 setLang→reload）。
  // 语言：endonym 各语自称；tok 在字形可用时=sitelen pona（langDisplayName）。setLang async 失败必 surface。
  const langBtnLabel = document.getElementById("menuLanguageBtnLabel");
  if (langBtnLabel) langBtnLabel.textContent = langDisplayName(lang());
  wireInlineSelect("menuLanguageBtn",
    () => LANGS.map((l) => ({ value: l, label: langDisplayName(l) })),
    () => lang(),
    (l) => {
      void setLang(l).catch((e) => {
        if (langBtnLabel) langBtnLabel.textContent = langDisplayName(lang());   // 回滚显示
        reportError(e);
      });
    });
  // v100：删「检测更新」menu (实测在 iPad PWA 上不可靠，user：「检测更新功能没用」)。
  // 强制更新一律走「强制清缓存重启」（menuForcePwaReset）— 详 ai-docs/20260526-pwa-update-detection.md。
  // 老 element 在 HTML 里 hidden，handler 留空保 element exists 防 null deref。
  if (els.menuCheckUpdate) els.menuCheckUpdate.addEventListener("click", () => setMenuOpen(false));
  // v124b: menuClear 撤了（user：「清空内容跟删除重复，删掉」）。stub 留兜底
  if (els.menuClear) els.menuClear.addEventListener("click", () => setMenuOpen(false));

  document.getElementById("menuShortcuts")?.addEventListener("click", () => {
    setMenuOpen(false);
    _renderShortcutsSheet();
    if (_shortcutsSheet) openSheet(_shortcutsSheet);
  });
  document.getElementById("shortcutsClose")?.addEventListener("click", () => closeSheet(_shortcutsSheet));

  // ⚠ boot 期**不**在这读 pref —— collection 还没 hydrate（v409 拆了 TLA 门），读到的是 DEFAULTS。
  //   真值由 app.ts 的 fixup 相（await prefsReady 后）调 renderSettingsFromPrefs() 灌入。
  applyCheckerboard(state.checkerboard);   // checkboard 是 per-doc desk（非 pref），不等 collection

  els.menuBtn.addEventListener("click", (e: Event) => {
    e.stopPropagation();
    setMenuOpen(!isPopupOpen(els.menuPanel));
  });
  // （外点关 2026-09-02 C1 归 popup-menu；这里那份删）
}
