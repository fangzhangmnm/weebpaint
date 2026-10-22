// 「这份是更新版本写的」提示——每次打开一张画最多说一次（家族格式版本纪律：minor 比本版新 = 能开能改能存，不认识的部分原样带回，
//   **告诉用户一次**，不弹窗不拦；家族根 ai-docs/20261021-format-version-discipline.md §2）。created 2026-10-21 by Claude Opus 5.5
//   一张画里几个子结构各自有拍子（stack.xml 布局 / desk / 录像 / 参考清单），谁先报 newer-minor 谁触发，后面的只记黑匣子。
//   session-state 开画时 begin()；各子结构的读取点报 newerMinor(part)。sink 由 session-state init 注入。
//   用通知条（workbench-elements notice，info 级、可关、10 s 自己收），不用状态行：开画之后紧跟着「已打开…」会把状态行顶掉，等于没说。
import { note as diagNote } from "./diag-log.ts";

let _sink: ((msg: string) => void) | null = null;
let _message: () => string = () => "";
let _saidThisDoc = false;

export function configureFormatNotice(sink: (msg: string) => void, message: () => string): void { _sink = sink; _message = message; }
/** 开一张画（任何来源：图库 / 本地文件 / 导入 / 崩溃恢复）之前调：这张画还没说过。 */
export function beginFormatNotice(): void { _saidThisDoc = false; }
/** 某个子结构读到 minor 比本版新：这张画第一次 = 状态行说一句；之后只记黑匣子。 */
export function noteNewerMinor(part: string, fileStamp: string, appStamp: string): void {
  diagNote("format", `${part} ${fileStamp} newer-minor than this app (${appStamp}): unknown parts kept as-is`);
  if (_saidThisDoc) return;
  _saidThisDoc = true;
  _sink?.(_message());
}
