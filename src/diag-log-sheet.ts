// diag-log-sheet.ts —— ☰ dev 页「诊断日志」窗口：看 + 复制 + 清空（数据源 = diag-log.ts）。
// created 2026-08-31 by Claude Fable 5（user 2026-08-31「dev 里面加一个日志窗口和拷贝按钮」）。
// 复制走 navigator.clipboard.writeText（点击手势内，iPad PWA 可用）；失败回退选中 <pre> 文本让用户长按复制。
// 无系统弹窗（家规）：结果走状态栏。

import { t } from "./i18n/index.ts";
import { entries, toText, clear } from "./diag-log.ts";
import { reportError } from "./error-badge.ts";
import { setMenuOpen } from "./settings-menu.ts";
import { openSheet, closeSheet } from "./ui/sheet.ts";   // 2026-09-02 C3

const $ = (id: string) => document.getElementById(id) as HTMLElement | null;

export function initDiagLogSheet(deps: { status: (msg: string, persist?: boolean) => void }): void {
  const btn = $("menuDiagLog"), sheet = $("diagLogSheet"),
    pre = $("diagLogText"), hint = $("diagLogHint"), copyBtn = $("diagLogCopy"), clearBtn = $("diagLogClear"), closeBtn = $("diagLogClose");
  if (!btn || !sheet || !pre || !hint || !copyBtn || !clearBtn || !closeBtn) return;   // 标记缺席（single-html 裁剪等）→ 功能静默不在

  function render(): void {
    const n = entries().length;
    hint!.textContent = t("diag.hint", { n });
    pre!.textContent = n ? toText() : t("diag.empty");
    pre!.scrollTop = pre!.scrollHeight;   // 最新在底
  }
  function open(): void { setMenuOpen(false); render(); openSheet(sheet!); }
  function close(): void { closeSheet(sheet!); }

  async function copy(): Promise<void> {
    const text = toText();
    const n = entries().length;
    try {
      if (!navigator.clipboard?.writeText) throw new Error("navigator.clipboard.writeText unavailable");
      await navigator.clipboard.writeText(text);
      deps.status(t("diag.copied", { n }));
    } catch (e) {
      // 回退：选中文本，用户长按「拷贝」；同时上报（log 级：本身就是诊断路径，别叠横幅）
      try {
        const range = document.createRange(); range.selectNodeContents(pre!);
        const sel = window.getSelection(); sel?.removeAllRanges(); sel?.addRange(range);
      } catch { /* 选区都做不了：只剩状态栏提示 */ }
      reportError(new Error("[diag-log] clipboard copy failed: " + String(e)), "log");
      deps.status(t("diag.copyFailed"), true);
    }
  }

  btn.addEventListener("click", open);
  copyBtn.addEventListener("click", () => { void copy(); });
  clearBtn.addEventListener("click", () => { clear(); render(); deps.status(t("diag.cleared")); });
  closeBtn.addEventListener("click", close);
}
