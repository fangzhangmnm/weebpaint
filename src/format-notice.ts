// 「这份是更新版本写的」提示——每次打开一张画、每一类最多说一次（家族格式版本纪律：minor 比本版新 = 能开能改能存，不认识的部分原样带回，
//   **告诉用户一次**，不弹窗不拦；家族根 ai-docs/20261021-format-version-discipline.md §2）。created 2026-10-21 by Claude Opus 5.5
//   一张画里几个子结构各自有拍子（stack.xml 布局 / desk / 录像 / 参考清单），谁先报谁触发，后面同类的只记黑匣子。
//   两类：newer-minor（整体能用，只是有的看不到）/ part-too-new（某一部分 major 比本版新：那部分按默认显示、原字节带着存回）。
//   第三类 newer-app（2026-10-21 审计恢复，Claude Fable 5.1）：写这画的 app 版本比本版新（wrote-with 戳）——拍子那层兜不住 stack.xml 内部的未知属性
//   （test/format-stack-xml-unknown.test.mjs），所以这层并存：说一次（警告级、不自动收）+ 顶栏红边 + 落盘前确认（session-state）。
//   整张画的 major 比本版新不在这里——那是拒开（session-state refuseIfTooNew，警告级通知）。
//   session-state 开画时 begin()；各子结构的读取点报。sink 由 session-state init 注入。
//   用通知条（workbench-elements notice，info 级、可关、10 s 自己收），不用状态行：开画之后紧跟着「已打开…」会把状态行顶掉，等于没说。
// edited by Claude Opus 5.5 2026-10-21（F-69：加 part-too-new 一类）
import { note as diagNote } from "./diag-log.ts";

export type FormatNoticeKind = "newer-minor" | "part-too-new" | "newer-app";
let _sink: ((kind: FormatNoticeKind, msg: string, part: string) => void) | null = null;
let _message: (kind: FormatNoticeKind, part: string) => string = () => "";
const _said = new Set<string>();   // `${kind}:${part}`——part-too-new 按部位分句（desk 说设置、references 说参考），各说一次

export function configureFormatNotice(sink: (kind: FormatNoticeKind, msg: string, part: string) => void, message: (kind: FormatNoticeKind, part: string) => string): void { _sink = sink; _message = message; }
/** 开一张画（任何来源：图库 / 本地文件 / 导入 / 崩溃恢复）之前调：这张画还没说过。 */
export function beginFormatNotice(): void { _said.clear(); }

function say(kind: FormatNoticeKind, part = ""): void {
  const key = kind === "part-too-new" ? `${kind}:${part}` : kind;
  if (_said.has(key)) return;
  _said.add(key);
  _sink?.(kind, _message(kind, part), part);
}
/** 某个子结构读到 minor 比本版新：这张画第一次 = 通知条说一句；之后只记黑匣子。 */
export function noteNewerMinor(part: string, fileStamp: string, appStamp: string): void {
  diagNote("format", `${part} ${fileStamp} newer-minor than this app (${appStamp}): unknown parts kept as-is`);
  say("newer-minor");
}
/** 写这画的 app 版本比本版新：这张画第一次 = 说一句（警告级）；覆盖确认在 session-state。 */
export function noteNewerApp(writer: string, app: string): void {
  diagNote("format", `written by a newer app (${writer}; this is ${app}): stack.xml extensions this version does not know would be lost on save — confirm before any write`);
  say("newer-app");
}
/** 某个子结构的 major 比本版新（desk / 录像 / 参考清单）：那部分按默认显示、原字节带着存回。这张画第一次 = 说一句。 */
export function noteTooNewPart(part: string, fileStamp: string, appStamp: string): void {
  diagNote("format", `${part} ${fileStamp} too new for this app (${appStamp}): shown at defaults, original bytes carried back on save`);
  say("part-too-new", part);
}
