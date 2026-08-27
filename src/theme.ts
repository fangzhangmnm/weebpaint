// 职责（单一）：主题切换（auto/日/夜）——data-theme attr + board void 色 + 菜单标签 + 持久化（local-user-preference）。
//
// 主题 = **一个 css**：换主题只改 `data-theme` attr + board void 色，无 reload、随时可换（对比 i18n 的 setLang 是 reload 制）。
// SSoT = preferences device 层（device-kv；P5 2026-08-27——原 collection+boot 快照双源塌成一份）。
// boot（P5）：`<head>` guard 与本模块读同一个 device-kv 键（同步）——单源，无对账；
//   reconcileThemeFromPrefs 只剩「legacy 播种后重读」一职（见函数注释）。
import type { AppContext } from "./app-context.ts";
import { els } from "./els.ts";
import { preferences } from "./app-prefs.ts";   // 主题 = device 层偏好（跟设备日夜/环境；P5 起 device-kv=唯一 SSoT，同步读）
import { t, type Key } from "./i18n/index.ts";

export const THEMES = ["auto", "day", "night"];
// 主题状态标签走 i18n（key: theme.auto / theme.day / theme.night）。
export function themeLabel(th: string): string { return t(`theme.${th}` as Key); }

const valid = (v: string | null | undefined): string => (v && THEMES.includes(v) ? v : "auto");

// P5：SSoT = device-kv（localStorage 同步读）——boot 期即权威，「快照 vs collection 双源对账」整套退役。
//   index.html 的 pre-paint guard 读同一个键（JSON 引号剥掉），首帧与 JS 首渲天然一致。
function readTheme(): string { return valid(preferences.get("color-theme")); }

let theme = readTheme();
let board: AppContext["board"];

function readCssColor(name: string) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}
function applyThemeColorsToBoard() {
  board.setThemeColors({
    voidColor: readCssColor("--void"),
    voidDotColor: readCssColor("--void-dot"),     // 透明显示模式：点网格色 + doc 细框（框点同色）
  });
}

// 只贴 DOM/board/label（**不写盘**）——boot 贴 / 对账热重贴 复用（换主题=换 CSS，无 reboot）。
function renderTheme(th: string) {
  theme = th;
  document.documentElement.setAttribute("data-theme", th);
  const lbl = els.menuTheme?.querySelector?.('[data-state-for="theme"]');
  if (lbl) lbl.textContent = themeLabel(th);
  const lbl2 = document.getElementById("menuThemeBtnLabel");   // v0.5.37 in-app 下拉按钮 label
  if (lbl2) lbl2.textContent = themeLabel(th);
  requestAnimationFrame(applyThemeColorsToBoard);
}

// 用户显式换主题：贴 + 写 SSoT（device-kv 一份即全——guard 与运行时同源）。
export function applyTheme(th: string) {
  renderTheme(th);
  preferences.set("color-theme", th);
}
export function cycleTheme() { return THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length]; }
export function currentTheme(): string { return theme; }
// （currentTheme 已删 v415：零调用者。）

// fixup 相对账（P5 起只为**播种后再读**：legacy collection 值刚被 seedDevicePrefsFromLegacy 迁入
//   device-kv 时，boot 早读可能还是默认值 → 这里重读一次，不符就地换（主题=css，无 reload）。
//   播种期过后（存量设备升完）本函数天然恒 no-op，可拆）。
export function reconcileThemeFromPrefs(): void {
  const th = readTheme();
  if (th !== theme) renderTheme(th);
}

export function initTheme(ctx: AppContext) {
  board = ctx.board;
  renderTheme(readTheme());   // boot：device-kv 同步读=已是权威（与 <head> guard 同源）；播种补读见 reconcileThemeFromPrefs
  // ⚠ 不订 onChange：local-user-preference 是 {local:true}=cloudless，collection 的 fireChanged 只在 sync() 里调，
  //   而 sync() 对 cloudless 直接 return → **永不触发**。v406-v408 这里挂过一个 onChange，是结构上不可达的死代码。
  //   主题不跨设备（设计如此），同 tab 内的改动 applyTheme 已经贴过了。
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    if (theme === "auto") requestAnimationFrame(applyThemeColorsToBoard);
  });
}
