// verb-segment —— 上下文条**左段**「子工具栏」：同一动词的子工具并排成图标钮，当前项 pressed。created 2026-09-06 by Claude Fable 5.1
//
// ADR-0012 修订 ③（user 2026-09-06 晚）：「根因在于同一个图标会有 context subtoolbar vs subtool stack 两个不同的弹出，真正的问题是这个」
//   → 「子工具栈并入上下文条，成为它的左段；长按不再弹菜单，只是把这条上下文条叫出来……先试试这个吧，次优解。先活下来再说」。
// 一个动词位从此只会冒出一种东西 = 它的上下文条；本段就是那条的左端。何时显条归宿主（套索/形状/滤镜笔随动词激活即显；
//   笔·自由手默认没有条，长按叫出，✓ 收起）。本模块零业务依赖：tools/current/onPick 全由宿主注入。
import { iconHtml } from "./icon.ts";

export interface VerbSegmentTool { id: string; icon: string; title: string }
export interface VerbSegmentOpts {
  tools: () => VerbSegmentTool[];
  current: () => string;
  onPick(id: string): void;
  ariaLabel?: string;
}
export interface VerbSegmentHandle { el: HTMLElement; refresh(): void; dispose(): void }

export function mountVerbSegment(host: HTMLElement, o: VerbSegmentOpts): VerbSegmentHandle {
  const el = document.createElement("span");
  el.className = "lasso-section verb-segment";
  el.setAttribute("role", "group");
  if (o.ariaLabel) el.setAttribute("aria-label", o.ariaLabel);
  const btns = new Map<string, HTMLButtonElement>();
  function refresh(): void {
    const cur = o.current();
    for (const [id, b] of btns) b.setAttribute("aria-pressed", id === cur ? "true" : "false");
  }
  for (const t of o.tools()) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "lasso-tool-btn lasso-tool-icon";
    b.setAttribute("data-verb-sub", t.id);   // 真 DOM 同步反映到 dataset；node shim 只认属性
    b.title = t.title;
    b.setAttribute("aria-label", t.title);
    b.innerHTML = iconHtml(t.icon);
    b.addEventListener("click", (e) => { e.stopPropagation(); o.onPick(t.id); refresh(); });
    el.appendChild(b);
    btns.set(t.id, b);
  }
  const sep = document.createElement("span");
  sep.className = "ct-sep";
  sep.setAttribute("aria-hidden", "true");
  sep.textContent = "|";
  el.appendChild(sep);
  refresh();
  host.appendChild(el);
  return { el, refresh, dispose() { el.remove(); btns.clear(); } };
}
