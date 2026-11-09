// 统一 error report（universal error banner）——全 app + store 的错误唯一汇拢点。
//   职责：把一条错误按 severity 分流到正确的 UI 面，并作为**最终消费者** console.log（层层上报只有这里 log）。
//   - "error"   → 红色通知（ui/notice 通知栈，--z-notice：在 busy 之上、模态开着时停靠顶部不盖按钮行）+ console.error
//   - "warning" → 琥珀通知（同栈）+ console.warn
//   - "info"    → 状态栏（setStatus，瞬态）
//   - "log"     → 只 console.log（良性 offline/fallback：funnel 但不打扰用户）
//   index.html 内联 bootstrap 的 #__errBar 只管 bundle 加载前的早期兜底；本模块 init 后接管 window.__wp_showFatal，
//   让内联的 error/unhandledrejection handler 也走 severity（2026-09-02 C7 起呈现归 ui/notice，本文件零 inline 样式）。

import { t } from "./i18n/index.ts";
import { record as diagRecord } from "./diag-log.ts";
import { flashEditLock } from "./edit-lock.ts";
import { showNotice } from "@internal/workbench-elements";   // 2026-09-02 C7 通知栈   // 黑匣子（2026-08-31）：全部级别都记，dev 页可看/复制
export type ErrorLevel = "error" | "warning" | "info" | "log";


let statusSink: ((text: string, persist?: boolean) => void) | null = null;

/** app 在 boot 时注入状态栏 sink（info 级走这里）+ 接管全局 fatal handler。 */
export function initErrorBadge(deps: { status: (text: string, persist?: boolean) => void }): void {
  statusSink = deps.status;
  // 接管内联 bootstrap 的 fatal shower：往后 window.error / unhandledrejection 也过 severity（默认当 error）。
  (window as unknown as { __wp_showFatal?: (t: string) => void }).__wp_showFatal = (text: string) => {
    diagRecord("error", "[window] " + text);
    showBanner(text, "error");
  };
  // 锁着的画（2026-11-08）：没人接的拒绝（锁着时点了图层 / 滤镜这类不经交互锁的按钮 → 写门抛 WriteRefusedError；自动保存撞上锁 → EditLockedError）
  //   会走到 theme-guard.js 的全局兜底、糊一张红卡。那不是脚本错误：挂筛子接走，同 reportError 的两条规矩（按错误名认；名字没有就看消息里的字）。
  (window as unknown as { __wp_fatalFilter?: (text: string, name?: string) => boolean }).__wp_fatalFilter = (text, name) => {
    const is = (n: string) => name === n || new RegExp("\\b" + n + "\\b").test(text);
    if (is("WriteRefusedError") || /write refused \(edit-locked\)/.test(text)) { diagRecord("log", "[window] " + text); flashEditLock(); statusSink?.(t("el.refused")); return true; }
    if (is("EditLockedError") || is("LockedError") || /is locked for editing/.test(text)) { diagRecord("warning", "[window] " + text); flashEditLock(); showBanner(t("el.saveBlocked"), "warning"); return true; }
    return false;
  };
}

function errToText(err: unknown): string {
  if (err == null) return t("err.unknown");
  if (typeof err === "string") return err;
  // v0.4.11 插桩（真机 2.3「总是同步错误弹窗」）：Error 带上 err.name——旧库残留类故障
  //   （如 IDB NotFoundError）在 banner 上直接可辨，给下轮 store 大修留诊断证据。
  if (err instanceof Error) return (err.name && err.name !== "Error" ? `[${err.name}] ` : "") + (err.message || String(err));
  const anyErr = err as { message?: unknown; name?: unknown };
  if (anyErr && typeof anyErr.message === "string") {
    const n = typeof anyErr.name === "string" && anyErr.name !== "Error" ? `[${anyErr.name}] ` : "";
    return n + anyErr.message;
  }
  try { return JSON.stringify(err); } catch { return String(err); }
}

function showBanner(text: string, level: "error" | "warning"): void {
  // 同 id 原地更新（连报不堆一摞）；点空白即关（err.dismissHint 文案照旧）
  showNotice({ id: "error-banner", level, text: text + "  (" + t("err.dismissHint") + ")", dismissLabel: t("err.dismissHint") });
}

/**
 * 唯一 error 上报入口。app 各处 catch / store 的 ui.reportError 都汇到这里。
 * @param err   任意错误（Error / string / 对象）
 * @param level 默认 "error"。见文件头分流表。
 */
// 黑匣子行：文案 + 第一帧调用栈（minified bundle 里 file:line:col 仍可对 sourcemap）。
function stackHint(err: unknown): string {
  const st = err instanceof Error ? err.stack : undefined;
  if (!st) return "";
  const frame = st.split("\n").map((l) => l.trim()).find((l) => /^at |@/.test(l) && !l.includes("reportError"));
  return frame ? `  ‹${frame.slice(0, 160)}›` : "";
}

export function reportError(err: unknown, level: ErrorLevel = "error"): void {
  // 锁着的画（2026-11-08，家族「源文件原则上只读」）：
  //   · 写门拒了（WriteRefusedError：锁着时点了图层 / 滤镜这类按钮）= 契约，不是故障 → 门闪一下、状态行一句，不出横幅；
  //   · 保存被拒（EditLockedError / 库的 LockedError：锁着还有改动要存）= 上一层漏了 → 响亮（warning 横幅）+ 门闪，话说清「改动还在」。
  const lockName = (err as { name?: unknown } | null)?.name;
  if (lockName === "WriteRefusedError") { diagRecord("log", errToText(err)); flashEditLock(); statusSink?.(t("el.refused")); return; }
  if (lockName === "EditLockedError" || lockName === "LockedError") { diagRecord("warning", errToText(err) + stackHint(err)); console.warn("[wp]", err); flashEditLock(); showBanner(t("el.saveBlocked"), "warning"); return; }
  const msg = errToText(err);
  diagRecord(level, msg + stackHint(err));
  // 最终消费者 log（层层上报只此一处 log）
  if (level === "error") console.error("[wp]", err);
  else if (level === "warning") console.warn("[wp]", err);
  else console.log("[wp]", err);

  if (level === "error" || level === "warning") showBanner(msg, level);
  else if (level === "info") statusSink?.(msg);
  // level === "log"：只 console，不打扰用户
}
