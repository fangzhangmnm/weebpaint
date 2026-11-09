// edit-lock-door —— 那扇门：开着的画锁着时，画布顶上一条「锁着：接着改 / 存一版再改」。created 2026-11-08 by Claude Fable 5.1
//   user 2026-11-08：「解锁的时候…两个选项，一个是直接 in place 的编辑，一个是创建一个新的」「随手锁一下，就跟汽车…按下车钥匙滴滴一下，这种随手的习惯…能随手打开」
//   设计稿（家族根 ai-docs/20261108-design-lock-star-versions.md）：界面灰的、不收输入；蹭到了只让锁闪一下，不弹东西；不弹确认。
// **解锁只在人点这两个钮时发生**（test/edit-lock-guard.test.mjs 钉：src 里调解锁的地方只有这里和图库菜单）。
//   非模态：通知栈里一条常驻（不能点掉——锁着是事实，不是提醒）；图库开着时藏起来（styles.css）。
import { showNotice, closeNotice } from "@internal/workbench-elements";
import { t } from "./i18n/index.ts";
import { isEditLocked, onEditLockChange, onEditLockFlash, flashEditLock } from "./edit-lock.ts";

const NOTICE_ID = "edit-lock";

export interface EditLockDoorDeps {
  /** 开着的这幅画在图库里的身份（全名）；没有 → null。 */
  activeIdentifier(): string | null;
  /** 「接着改」：解锁（图库库的动词，自己会说话）。 */
  unlock(identifier: string): Promise<boolean>;
  /** 「存一版再改」：先存一版，成了才解锁。 */
  saveVersionThenUnlock(identifier: string): Promise<boolean>;
}

export function initEditLockDoor(d: EditLockDoorDeps): void {
  let busy = false;
  const act = (fn: (id: string) => Promise<boolean>) => (): void => {
    const id = d.activeIdentifier();
    if (!id || busy) return;
    busy = true;
    void fn(id).catch(() => false).finally(() => { busy = false; });   // 成没成图库库都说过了；解成了 → 库的 watchUnlocks → 锁态变 → 下面收门
  };
  const render = (locked: boolean): void => {
    if (!locked) { closeNotice(NOTICE_ID); document.body.removeAttribute("data-edit-locked"); return; }
    document.body.setAttribute("data-edit-locked", "1");   // 工具栏淡一档（styles.css）；画本身不动——看是要看清楚的
    showNotice({
      id: NOTICE_ID, level: "info", dismissible: false, tapToDismiss: false,
      text: t("el.lockedText"),
      actions: [
        { label: t("el.continue"), primary: true, onClick: act((id) => d.unlock(id)) },
        { label: t("el.versionThenEdit"), onClick: act((id) => d.saveVersionThenUnlock(id)) },
      ],
    });
  };
  onEditLockChange(render);
  onEditLockFlash(() => {
    const el = document.querySelector<HTMLElement>(`[data-notice-id="${NOTICE_ID}"]`) ?? null;
    if (!el) { if (isEditLocked()) render(true); return; }   // 门不在（被别的通知挤掉了）→ 重新立起来就是提示
    el.classList.remove("edit-lock-flash"); void el.offsetWidth; el.classList.add("edit-lock-flash");   // 重新触发一次动画
  });
  render(isEditLocked());

  // 界面那一层补齐（user 11-08「图层、滤镜这些界面的那层锁，你修一下呗」）：图层面板 / 调整（滤镜）面板 / 裁切条 / 套索条这些会改画的面板，
  //   锁着时点不动、门闪一下、看起来淡一档（styles.css）。它们的按钮各有各的处理函数、不经交互锁的意图表——在捕获阶段统一拦，比每个按钮各补一句稳。
  //   窗口自己的壳（关闭 / 拖动 / 缩放）和「取消」照常。写门（Workpiece.writeGate）仍是后面那一道：这里漏了的入口照样改不了。
  const SURFACES = "#layersList, .layers-foot, #layerAddPopup, #adjustPanel, #adjustPopup, #cropToolbar, #lassoToolbarStack, #lassoSelOpPopup, #lassoSelEditMenu, #fillSelEditMenu";
  const CHROME = "#adjustPanelClose, #adjustPanelHead, #adjustPanelResize, #cropToolbarCancel";
  const guard = (e: Event): void => {
    if (!isEditLocked()) return;
    const el = e.target as Element | null;
    if (!el?.closest || !el.closest(SURFACES) || el.closest(CHROME)) return;
    e.preventDefault(); e.stopPropagation();
    if (e.type === "click") flashEditLock();
  };
  document.addEventListener("pointerdown", guard, true);
  document.addEventListener("click", guard, true);
}
