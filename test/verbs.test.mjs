// 顶栏动词表（ADR-0012）：路由纯数据 + mode→verb/subTool 反推。created 2026-09-06 by Claude Fable 5.1
import { describe, it, eq, assert } from "./runner.mjs";
import { VERBS, VERB_SUBTOOLS, DEFAULT_SUBTOOL, isVerb, subToolDef, verbOfMode, subToolOfMode } from "../src/common/verbs.ts";
import { readFileSync } from "node:fs";

describe("verbs · 表的形状", () => {
  it("四个动词；每个动词的缺省子工具在表里；子工具 id 不重复", () => {
    eq(VERBS.join(","), "brush,eraser,smudge,lasso");
    for (const v of VERBS) {
      const ids = VERB_SUBTOOLS[v].map((s) => s.id);
      assert(ids.includes(DEFAULT_SUBTOOL[v]), `${v} 缺省 ${DEFAULT_SUBTOOL[v]} 不在 ${ids}`);
      eq(new Set(ids).size, ids.length, `${v} 子工具 id 重复`);
    }
    assert(isVerb("brush") && !isVerb("picker") && !isVerb(null));
    eq(subToolDef("brush", "bogus").id, "freehand", "未知 id 回第一条");
  });
  it("子工具图标都在 sprite（库 icons.svg 或本地 stopgap icons-local.svg）", () => {
    const lib = readFileSync(new URL("../assets/icons.svg", import.meta.url), "utf-8") + readFileSync(new URL("../assets/icons-local.svg", import.meta.url), "utf-8");
    for (const v of VERBS) for (const s of VERB_SUBTOOLS[v]) assert(lib.includes(`id="${s.icon}"`), `图标缺失：${v}/${s.id} → #${s.icon}`);
  });
  it("i18n key 都存在", async () => {
    const { S } = await import("../src/i18n/strings.ts");
    for (const v of VERBS) for (const s of VERB_SUBTOOLS[v]) assert(s.titleKey in S, `i18n 缺 ${s.titleKey}`);
  });
});

describe("verbs · mode ↔ 动词/子工具", () => {
  it("verbOfMode：brush/shapeBrush→brush，lasso/fill→lasso，filterBrush(有 payload)→smudge，其余 null", () => {
    eq(verbOfMode("brush"), "brush"); eq(verbOfMode("shapeBrush"), "brush");
    eq(verbOfMode("eraser"), "eraser");
    eq(verbOfMode("lasso"), "lasso"); eq(verbOfMode("fill"), "lasso");
    eq(verbOfMode("filterBrush", "smudge"), "smudge"); eq(verbOfMode("filterBrush", "liquify"), "smudge");
    eq(verbOfMode("filterBrush", null), null);
    eq(verbOfMode("picker"), null); eq(verbOfMode("hand"), null); eq(verbOfMode("transform"), null);
  });
  it("subToolOfMode：老模式反推子工具；滤镜笔按 filter+variant；未知 variant 归该 filter 首条", () => {
    eq(subToolOfMode("shapeBrush").sub, "shape");
    eq(subToolOfMode("fill").sub, "fill");
    eq(subToolOfMode("lasso").sub, "select");
    eq(subToolOfMode("filterBrush", "smudge", "dull").sub, "dull");
    eq(subToolOfMode("filterBrush", "smudge", "paint").sub, "smear", "带颜料的手指 → 手指位首条");
    eq(subToolOfMode("filterBrush", "sharpenBlur", "sharp").sub, "sharpen");
    eq(subToolOfMode("filterBrush", "sharpenBlur", "blur").sub, "blur");
    eq(subToolOfMode("filterBrush", "liquify", "pinch").sub, "liquify");
    eq(subToolOfMode("picker"), null);
  });
  it("每个子工具的 route 都回得来（表自洽）", () => {
    for (const v of VERBS) for (const s of VERB_SUBTOOLS[v]) {
      const r = s.route;
      const back = "mode" in r ? subToolOfMode(r.mode) : subToolOfMode("filterBrush", r.filter, r.variant ?? null);
      assert(back && back.verb === v && back.sub === s.id, `${v}/${s.id} 路由往返失败：${JSON.stringify(back)}`);
    }
  });
});
