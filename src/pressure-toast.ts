// 压感自诊 toast（user 2026-09-02「笔检测没压感弹 toast：no pressure? please enable windows ink [link]
//   tap to dismiss，每次 session 弹一次」）。created 2026-09-02 by Claude Fable 5.1.
// 证据来源 = input.ts 里的 PressureProbe（pen-flat / absolute-mouse，见 pressure-probe.ts 文件头），
//   经 window 事件 wp:pressure-doubt 到这里；本模块只管「一 session 一次 + 文案 + 详情跳说明书」。
import { t } from "./i18n/index.ts";
import { isWindowsPlatform } from "./pressure-probe.ts";
import { openReadmePanel } from "./readme-panel.ts";
import { reportError } from "./error-badge.ts";

export const PRESSURE_DOUBT_EVENT = "wp:pressure-doubt";
let _shown = false;

export function initPressureToast(): void {
  const toast = document.getElementById("pressureToast");
  const text = document.getElementById("pressureToastText");
  if (!toast || !text) return;
  window.addEventListener(PRESSURE_DOUBT_EVENT, (ev) => {
    const reason = (ev as CustomEvent<{ reason: string }>).detail?.reason;
    reportError(new Error(`[pressure-probe] doubt=${reason}`), "log");   // dev 诊断（英文，家规）
    if (_shown) return;
    _shown = true;
    text.textContent = t(isWindowsPlatform() ? "pressure.toast.win" : "pressure.toast.generic");
    toast.classList.remove("hidden");
  });
  // 整条 toast 点哪都关（tap to dismiss）；「详情」额外跳说明书对应节。
  toast.addEventListener("click", (e) => {
    toast.classList.add("hidden");
    if ((e.target as Element).closest("#pressureToastMore")) openReadmePanel("windows-ink");
  });
}
