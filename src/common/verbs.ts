// verbs —— 顶栏动词表（ADR-0012「动词原则」）：动词 × 子工具 × 路由到现有 EditMode / 滤镜笔 payload 的纯数据（零 DOM，node 直测）。
// created 2026-09-06 by Claude Fable 5.1。策划 = ai-docs/20260906-ui-abstraction-round-proposal.md §2.3。
//
// 动词 = 你的手在做什么（笔 / 橡皮 / 手指 / 套索）；子工具 = 同一动词下的另一种走法，长按顶栏钮切（钮面图标随之换，角上小三角）。
// 行为语义零变更：子工具只是**入口**，落地仍是老 EditMode（brush / shapeBrush / lasso / fill）或滤镜笔 payload（smudge / sharpenBlur / liquify）。
// user 2026-09-06 工作流观察（进 ADR 理由栏）：「你要么是形状笔和橡皮，要么是画笔和橡皮。反而不太会在形状笔和画笔之间切」。
// 记忆：desk.subTool[verb]（per-doc，user 2026-09-06 批准）。

export type Verb = "brush" | "eraser" | "smudge" | "lasso";
export const VERBS: readonly Verb[] = ["brush", "eraser", "smudge", "lasso"];

export interface SubToolDef {
  id: string;
  icon: string;          // sprite symbol id（缺图标的走 stopgap 字形，登记见 20260708 SVG Icons/TODO.md）
  titleKey: string;      // i18n key
  /** 落地路由：老 EditMode 名，或滤镜笔 payload。 */
  route: { mode: string } | { filter: string; variant?: string };
}

export const VERB_SUBTOOLS: Record<Verb, readonly SubToolDef[]> = {
  brush: [
    { id: "freehand", icon: "pencil", titleKey: "tool.brush", route: { mode: "brush" } },
    { id: "shape", icon: "shapes", titleKey: "tool.shapeBrush", route: { mode: "shapeBrush" } },
  ],
  eraser: [
    { id: "pixel", icon: "eraser", titleKey: "tool.eraser", route: { mode: "eraser" } },
    // 「整笔」智能擦：另案（需每笔归属图）；落地时在此追加一条即可
  ],
  smudge: [
    { id: "smear", icon: "finger", titleKey: "flt.smudge.smear", route: { filter: "smudge", variant: "smear" } },
    { id: "dull", icon: "blend", titleKey: "flt.smudge.dull", route: { filter: "smudge", variant: "dull" } },
    { id: "blur", icon: "blur", titleKey: "flt.sb.blurBrush", route: { filter: "sharpenBlur", variant: "blur" } },
    { id: "sharpen", icon: "sharpen", titleKey: "flt.sb.sharpBrush", route: { filter: "sharpenBlur", variant: "sharp" } },
    { id: "liquify", icon: "liquify", titleKey: "flt.liq.title", route: { filter: "liquify" } },
    // 克隆（stamp）：引擎另案；落地时追加
  ],
  lasso: [
    { id: "select", icon: "lasso", titleKey: "tool.lasso", route: { mode: "lasso" } },
    { id: "fill", icon: "paint-bucket", titleKey: "tool.fill", route: { mode: "fill" } },
  ],
};

export const DEFAULT_SUBTOOL: Record<Verb, string> = { brush: "freehand", eraser: "pixel", smudge: "smear", lasso: "select" };

export function isVerb(v: unknown): v is Verb { return typeof v === "string" && (VERBS as readonly string[]).includes(v); }

export function subToolDef(verb: Verb, id: string): SubToolDef {
  const list = VERB_SUBTOOLS[verb];
  return list.find((s) => s.id === id) ?? list[0];
}

/** 当前 EditMode（+ 滤镜笔 payload）→ 动词；transient / hand / picker 等非动词模式 → null。 */
export function verbOfMode(mode: string, filterId?: string | null): Verb | null {
  switch (mode) {
    case "brush": case "shapeBrush": return "brush";
    case "eraser": return "eraser";
    case "lasso": case "fill": return "lasso";
    case "filterBrush": return filterId ? "smudge" : null;   // 任何滤镜笔 payload 都归手指位（模糊/锐化/液化已搬家）
  }
  return null;
}

/** 当前 EditMode（+ payload）→ 子工具 id（用于同步 desk.subTool 记忆与钮面图标）；对不上 → null。 */
export function subToolOfMode(mode: string, filterId?: string | null, variantId?: string | null): { verb: Verb; sub: string } | null {
  const verb = verbOfMode(mode, filterId);
  if (!verb) return null;
  for (const s of VERB_SUBTOOLS[verb]) {
    const r = s.route;
    if ("mode" in r) { if (r.mode === mode) return { verb, sub: s.id }; }
    else if (mode === "filterBrush" && r.filter === filterId && (r.variant == null || r.variant === variantId)) return { verb, sub: s.id };
  }
  // filterBrush 的 variant 不在表里（如液化 pinch/bloat、带颜料的手指 paint）→ 归该 filter 的第一条
  if (mode === "filterBrush" && filterId) {
    const s = VERB_SUBTOOLS[verb].find((x) => "filter" in x.route && x.route.filter === filterId);
    if (s) return { verb, sub: s.id };
  }
  return null;
}
