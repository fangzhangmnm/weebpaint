// diag-log.ts —— 设备诊断日志（环形、device-kv 持久；☰ dev 页「诊断日志」窗口的数据源）。
// created 2026-08-31 by Claude Fable 5（user 2026-08-31「dev 里面加一个日志窗口和拷贝按钮」）。
//
// 为什么存在：iPad 上没有 console，reportError 横幅一闪即逝——2026-08-31「图库空白 + 登录挂不上 + 凭证 1–2 小时
//   就掉」案只能靠回忆复盘。这是 app 的黑匣子：出事后打开 dev 页复制一段，粘给开发者。
//
// 设计：
// - 三条数据源：① reportError（全 app + store 唯一汇拢点，**全部级别**含 log）② 内联 bootstrap 的 window error /
//   unhandledrejection（经 error-badge 接管的 __wp_showFatal）③ 面包屑 note(tag, msg)（boot 挂库、auth 翻牌、
//   图库订阅/首帧/超时、页面可见性、在线态——没有这些，一串错误没有时间线可对）。
// - 存储：device-kv 单键 `diag-log`（localStorage，同步、**不依赖 IDB**——IDB 正是本案嫌疑人，黑匣子不能住在
//   嫌疑人家里）。环 300 条、单条 ≤ 600 字符（≈ 最坏 180KB，localStorage 5MB 配额内）；写入 250ms 合并 + pagehide 立即 flush。
// - 只进不出：本模块不 import error-badge / i18n / store（防环；自己坏了也不 report——黑匣子静默）。
// - 不是 telemetry：永不上传；只有用户在 dev 页点「复制」字节才离开设备。还原出厂（factory-reset 清 device-kv 前缀）一并清掉。

import { deviceKvGetJson, deviceKvSetJson } from "./device-kv.ts";
import { WEEBPAINT_VERSION } from "./version.ts";

export type DiagLevel = "error" | "warning" | "info" | "log" | "note";
export interface DiagEntry { t: number; l: DiagLevel; m: string }

const KEY = "diag-log";
const MAX_ENTRIES = 300;
const MAX_MSG = 600;
const FLUSH_MS = 250;

let _entries: DiagEntry[] | null = null;
let _flushTimer: ReturnType<typeof setTimeout> | null = null;

function isEntry(x: unknown): x is DiagEntry {
  const e = x as DiagEntry | null;
  return !!e && typeof e.t === "number" && typeof e.l === "string" && typeof e.m === "string";
}
function load(): DiagEntry[] {
  if (_entries) return _entries;
  const raw = deviceKvGetJson<unknown>(KEY, null);
  _entries = Array.isArray(raw) ? raw.filter(isEntry).slice(-MAX_ENTRIES) : [];
  return _entries;
}
function scheduleFlush(): void {
  if (_flushTimer != null) return;
  _flushTimer = setTimeout(flush, FLUSH_MS);
}
/** 立即落盘（pagehide / 清空时调；平时 250ms 合并）。存储不可用时 device-kv 内存降级，本函数不抛。 */
export function flush(): void {
  if (_flushTimer != null) { clearTimeout(_flushTimer); _flushTimer = null; }
  if (_entries) { try { deviceKvSetJson(KEY, _entries); } catch { /* 黑匣子自己坏了：静默 */ } }
}
/** 记一条。msg 截到 600 字符；环满丢最旧。 */
export function record(level: DiagLevel, msg: string): void {
  const arr = load();
  arr.push({ t: Date.now(), l: level, m: String(msg).slice(0, MAX_MSG) });
  if (arr.length > MAX_ENTRIES) arr.splice(0, arr.length - MAX_ENTRIES);
  scheduleFlush();
}
/** 面包屑（非错误的时间线事件）。tag 短词：boot / auth / gallery / page / net。 */
export function note(tag: string, msg: string): void { record("note", `[${tag}] ${msg}`); }
export function entries(): readonly DiagEntry[] { return load(); }
export function clear(): void { _entries = []; flush(); }

const LEVEL_TAG: Record<DiagLevel, string> = { error: "E", warning: "W", info: "I", log: "L", note: "·" };
function pad(n: number, w = 2): string { return String(n).padStart(w, "0"); }
function fmtTime(t: number): string {
  const d = new Date(t);
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`;
}
function env(): string {
  const g = globalThis as { navigator?: { userAgent?: string; onLine?: boolean; standalone?: boolean }; location?: { pathname?: string; origin?: string }; document?: { visibilityState?: string } };
  const nav = g.navigator, loc = g.location;
  const standalone = nav && "standalone" in nav ? ` standalone=${String(nav.standalone)}` : "";
  return [
    `WeebPaint ${WEEBPAINT_VERSION}`,
    `route=${loc?.origin ?? ""}${loc?.pathname ?? ""}${standalone}`,
    `online=${String(nav?.onLine)} visibility=${g.document?.visibilityState ?? "?"}`,
    `ua=${nav?.userAgent ?? "?"}`,
    `exported=${fmtTime(Date.now())} (local time)`,
  ].join("\n");
}
/** 复制/展示用的整段文本：环境头 + 每条一行「MM-DD HH:MM:SS.mmm L msg」（旧在上、新在下）。 */
export function toText(): string {
  const lines = load().map((e) => `${fmtTime(e.t)} ${LEVEL_TAG[e.l] ?? "?"} ${e.m}`);
  return env() + "\n----\n" + (lines.length ? lines.join("\n") : "(empty)");
}

/** boot 期调一次：页面生命周期 / 在线态面包屑 + pagehide flush。record() 不依赖它（懒加载）。 */
export function initDiagLog(): void {
  const g = globalThis as { document?: Document; addEventListener?: typeof addEventListener; navigator?: Navigator; location?: Location };
  if (!g.addEventListener || !g.document) return;
  note("boot", `${WEEBPAINT_VERSION} ${g.location?.pathname ?? ""} online=${String(g.navigator?.onLine)}`);
  g.document.addEventListener("visibilitychange", () => note("page", `visibility=${g.document!.visibilityState}`));
  g.addEventListener("pagehide", (e: Event) => { note("page", `pagehide persisted=${String((e as PageTransitionEvent).persisted)}`); flush(); });
  g.addEventListener("pageshow", (e: Event) => note("page", `pageshow persisted=${String((e as PageTransitionEvent).persisted)}`));
  g.addEventListener("online", () => note("net", "online"));
  g.addEventListener("offline", () => note("net", "offline"));
}
