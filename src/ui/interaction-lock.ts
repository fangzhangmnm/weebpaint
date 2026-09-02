// InteractionLock —— 交互锁深模块：「此刻允许用户做什么」只有一处回答。created 2026-09-02 by Claude Fable 5.1（UI 纪元 C8）。
//
// user 2026-09-02：「busy 的时候各种快捷键之类的怎么拦也是最好做一个统一的深模块」「做一个只读模式…毕业的画锁起来，
//   护栏不写 ora…锁画先 park，锁操作应该和 busy 的锁是一样的，好好思考一下什么可以白名单什么不可以」。
//
// 考古（为什么要它）：busy 遮罩只是**视觉**遮罩（几何上挡 pointer），挡不住 window keydown / 原生 paste / 事件直发——
//   08-21 QA 一轮在 input.ts / topbar-menu / selection-ops ×4 / sheets 各补一句 isBusyActive()，每处措辞不同、漏一处即
//   「busy 期改 doc」（曾撞 encode await 窗口被乐观清脏吞编辑 = 红线）。锁的语义散在 6 处 = 下一次新入口必漏。
//
// 模型：锁 = kind（busy | readonly）；用户动作 = intent（下方 Intent 表）；策略 = POLICY[kind][intent]（纯数据，可测）。
//   多把锁同时在场 → 每把都放行才放行。busy 只是本模块的一个 adapter（fullscreen-busy.ts 拉/放锁）；
//   readonly（毕业的画只读，park）是第二个 adapter——策略表现在就定死，入口以后接（瑞士奶酪：UI 层这一片先在）。
//
// 白名单思路（一次想清楚，别每处再想）：
//   busy = 「系统正在替你写」——除了**看得见的反馈**（通知关闭）与**必须穿透的决策**（sync gate），一律不许：
//         连视口导航都不许（遮罩本来就盖着；放行只会制造「遮罩下面还能动」的假象）。修饰键清位永远放行（清位≠动作）。
//   readonly = 「你只能看」——读操作全放：导航 / 吸色 / 复制 / 导出（png/psd/剪贴板）/ 开菜单面板说明书 / 视图·工具·
//         窗格·笔粗类快捷键；写操作全禁：落笔 / 粘贴 / 任何改 doc 的命令 / 保存·上传·改名·删除·加密 / 编辑·套索类快捷键
//         （套索类含变换·填充·删除·选区操作，保守整类禁——选区虽不落 ora，但它是通往写像素的门口）。
//   ⚠ readonly 的「护栏不写 ora」不在这里——这是 UI 层一片奶酪；持久化层 / workbench 层的护栏另做（park）。

export type LockKind = "busy" | "readonly";
export type Intent =
  | "pointer:draw"       // 画布上落笔 / 擦 / 填 / 套索 / 滤镜笔——改像素或选区
  | "pointer:navigate"   // 平移 / 缩放 / 旋转视口（hand / space / 双指）
  | "pointer:pick"       // 吸色（读像素）
  | "key:shortcut"       // 快捷键表（readonly 再按类：ctx.shortcutCategory）
  | "key:modifier"       // Space / Alt / Shift / E 等修饰键状态位（清位永远放行）
  | "paste"              // 粘贴进画（写）
  | "copy"               // 复制（读）
  | "doc:mutate"         // 命令入口改 doc（图层 / 填充 / 调整 / 变换 / 裁切 / 重采样 / 参考图导入…）
  | "persist"            // 保存 / 上传 / 改名 / 删除 / 加密 / 导出到云
  | "export:read"        // 导出 png / psd / 剪贴板（读）
  | "menu"               // 开菜单 / 面板 / 说明书
  | "dialog"             // 开模态 sheet（input / confirm / choice / 自定义）
  | "gate"               // sync gate 决策（keep / pull / branch）——设计上必须穿透 busy
  | "notice";            // 通知关闭

export interface IntentCtx { shortcutCategory?: string }

/** readonly 放行的快捷键类（KEYBOARD_SHORTCUTS 的 category i18n key）。 */
export const READONLY_SHORTCUT_CATEGORIES = new Set(["sc.cat.view", "sc.cat.tools", "sc.cat.panels", "sc.cat.size"]);

const POLICY: Record<LockKind, Record<Intent, boolean>> = {
  busy: {
    "pointer:draw": false, "pointer:navigate": false, "pointer:pick": false,
    "key:shortcut": false, "key:modifier": true,
    paste: false, copy: false, "doc:mutate": false, persist: false, "export:read": false,
    menu: false, dialog: false, gate: true, notice: true,
  },
  readonly: {
    "pointer:draw": false, "pointer:navigate": true, "pointer:pick": true,
    "key:shortcut": true /* 再按类，见 policyAllows */, "key:modifier": true,
    paste: false, copy: true, "doc:mutate": false, persist: false, "export:read": true,
    menu: true, dialog: true, gate: true, notice: true,
  },
};

/** 纯函数：某把锁对某意图放不放行（可测；readonly 的快捷键按类）。 */
export function policyAllows(kind: LockKind, intent: Intent, ctx: IntentCtx = {}): boolean {
  const base = POLICY[kind][intent];
  if (!base) return false;
  if (kind === "readonly" && intent === "key:shortcut" && ctx.shortcutCategory !== undefined) {
    return READONLY_SHORTCUT_CATEGORIES.has(ctx.shortcutCategory);
  }
  return true;
}

// ---- 运行时：锁计数（同 kind 可嵌套：withBusy 里再 withBusy）----
const _count: Record<LockKind, number> = { busy: 0, readonly: 0 };
const _listeners = new Set<() => void>();
function _emit() { for (const f of _listeners) f(); }

/** 拉锁；返回放锁函数（幂等）。 */
export function acquireLock(kind: LockKind): () => void {
  _count[kind]++;
  _emit();
  let released = false;
  return () => {
    if (released) return;
    released = true;
    _count[kind] = Math.max(0, _count[kind] - 1);
    _emit();
  };
}
export function isLocked(kind?: LockKind): boolean {
  return kind ? _count[kind] > 0 : _count.busy > 0 || _count.readonly > 0;
}
export function activeLocks(): LockKind[] {
  return (["busy", "readonly"] as LockKind[]).filter((k) => _count[k] > 0);
}
/** 此刻放不放行：每把在场的锁都得同意。无锁 = 放行。 */
export function allows(intent: Intent, ctx: IntentCtx = {}): boolean {
  for (const k of activeLocks()) if (!policyAllows(k, intent, ctx)) return false;
  return true;
}
/** 编程错误式断言（如 busy 期开模态 = 自相矛盾 → 响亮 throw，别静默转圈）。 */
export function assertAllows(intent: Intent, what: string): void {
  if (allows(intent)) return;
  throw new Error(`${what} is not allowed while locked (${activeLocks().join("+")}): intent=${intent}`);
}
export function onLockChange(fn: () => void): () => void { _listeners.add(fn); return () => _listeners.delete(fn); }

/** pointer role（pointer-route.assignRole 的产物）→ intent。ignore/null = 不需要许可。 */
export function intentForPointerRole(role: string | null): Intent | null {
  switch (role) {
    case "draw": case "erase": case "fill": case "filterBrush": case "lasso": return "pointer:draw";
    case "pan": case "gesture": case "hold": return "pointer:navigate";
    case "pick": return "pointer:pick";
    default: return null;
  }
}
/** 测试用：清零所有锁。 */
export function _resetLocksForTest(): void { _count.busy = 0; _count.readonly = 0; _emit(); }
