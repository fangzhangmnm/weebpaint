// diag-log-sheet.ts —— ☰ dev 页「诊断日志」窗口：看 + 复制 + 清空（数据源 = diag-log.ts）。
// created 2026-08-31 by Claude Fable 5（user 2026-08-31「dev 里面加一个日志窗口和拷贝按钮」）。
// 复制走 navigator.clipboard.writeText（点击手势内）→ 失败回退 textarea+execCommand → 再失败选中 <pre> 让用户长按复制；iPad 另给 Web Share。
// 2026-09-06 user「copy 按钮没有用，手动 copy 也选不中」：反馈进 sheet 提示行（图库模式状态栏被藏）；<pre> 豁免全局 user-select:none（styles.css）。
// 无系统弹窗（家规）：结果走状态栏。

import { t } from "./i18n/index.ts";
import { entries, toText, clear } from "./diag-log.ts";
import { reportError } from "./error-badge.ts";
import { setMenuOpen } from "./settings-menu.ts";
import { openSheet, closeSheet } from "./ui/sheet.ts";   // 2026-09-02 C3

const $ = (id: string) => document.getElementById(id) as HTMLElement | null;

// 2026-09-06：图库侧入口（图库菜单项 + 卡住态钮）。图库模式下 ☰ 整条被藏 → 以前 log 取不出（user 晨案）。
let _open: (() => void) | null = null;
export function openDiagLogSheet(): void { _open?.(); }

export function initDiagLogSheet(deps: { status: (msg: string, persist?: boolean) => void }): void {
  const btn = $("menuDiagLog"), sheet = $("diagLogSheet"),
    pre = $("diagLogText"), hint = $("diagLogHint"), copyBtn = $("diagLogCopy"), shareBtn = $("diagLogShare"), clearBtn = $("diagLogClear"), closeBtn = $("diagLogClose");
  if (!btn || !sheet || !pre || !hint || !copyBtn || !clearBtn || !closeBtn) return;   // 标记缺席（single-html 裁剪等）→ 功能静默不在

  function render(): void {
    const n = entries().length;
    hint!.textContent = t("diag.hint", { n });
    pre!.textContent = n ? toText() : t("diag.empty");
    pre!.scrollTop = pre!.scrollHeight;   // 最新在底
  }
  // 2026-09-06 user「黑匣子 copy 按钮没有用」：反馈以前只走状态栏，图库模式下状态栏整条被藏 → 看起来没反应。
  //   现在反馈写进 sheet 自己的提示行（status 仍报一份）。
  function say(msg: string, persist = false): void { hint!.textContent = msg; deps.status(msg, persist); }
  function open(): void { setMenuOpen(false); render(); openSheet(sheet!); }
  _open = open;
  function close(): void { closeSheet(sheet!); }

  // 剪贴板三级回退：navigator.clipboard → 隐藏 textarea + execCommand("copy")（iOS 手势内仍可用）→ 选中 <pre> 让用户长按拷贝
  function copyViaTextarea(text: string): boolean {
    const ta = document.createElement("textarea");
    ta.value = text; ta.setAttribute("readonly", ""); ta.style.position = "fixed"; ta.style.left = "-9999px"; ta.style.top = "0";
    document.body.appendChild(ta);
    ta.focus(); ta.select(); ta.setSelectionRange(0, text.length);
    let ok = false;
    try { ok = document.execCommand("copy"); } catch { ok = false; }
    ta.remove();
    return ok;
  }
  async function copy(): Promise<void> {
    const text = toText();
    const n = entries().length;
    try {
      if (!navigator.clipboard?.writeText) throw new Error("navigator.clipboard.writeText unavailable");
      await navigator.clipboard.writeText(text);
      say(t("diag.copied", { n }));
      return;
    } catch (e) {
      reportError(new Error("[diag-log] clipboard.writeText failed: " + String(e)), "log");
    }
    if (copyViaTextarea(text)) { say(t("diag.copied", { n })); return; }
    // 回退：选中文本，用户长按「拷贝」；同时上报（log 级：本身就是诊断路径，别叠横幅）
    try {
      const range = document.createRange(); range.selectNodeContents(pre!);
      const sel = window.getSelection(); sel?.removeAllRanges(); sel?.addRange(range);
    } catch { /* 选区都做不了：只剩提示行 */ }
    reportError(new Error("[diag-log] execCommand copy failed too"), "log");
    say(t("diag.copyFailed"), true);
  }
  // Web Share（iPad：直接发给文件 / AirDrop / 邮件 / 任何 app）。2026-09-06 user：微信粘贴不吃 60KB 长文本、QQ 把它拆成几百条——
  //   复制的本来就是纯文本，问题是长度 → 分享改成 **.txt 文件**（canShare files 才走；不支持文件回退纯文本）；
  //   桌面浏览器没有 share → 钮变「下载 .txt」（a[download]）。
  const logFile = () => new File([toText()], `weebpaint-diag-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.txt`, { type: "text/plain" });
  const canShare = typeof navigator.share === "function";
  if (shareBtn) {
    if (!canShare) shareBtn.textContent = t("diag.download");
    shareBtn.addEventListener("click", async () => {
      if (!canShare) {   // 桌面：下载
        const f = logFile();
        const url = URL.createObjectURL(f);
        const a = document.createElement("a"); a.href = url; a.download = f.name; a.style.display = "none";
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 10_000);
        say(t("diag.downloaded", { name: f.name }));
        return;
      }
      try {
        const f = logFile();
        const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
        if (nav.canShare?.({ files: [f] })) await navigator.share({ title: t("diag.title"), files: [f] });
        else await navigator.share({ title: t("diag.title"), text: toText() });
      } catch (e) {
        if ((e as { name?: string })?.name !== "AbortError") { reportError(new Error("[diag-log] share failed: " + String(e)), "log"); say(t("diag.shareFailed"), true); }
      }
    });
  }

  btn.addEventListener("click", open);
  copyBtn.addEventListener("click", () => { void copy(); });
  clearBtn.addEventListener("click", () => { clear(); render(); say(t("diag.cleared")); });
  closeBtn.addEventListener("click", close);
}
