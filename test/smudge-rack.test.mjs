// 手指笔架/dial（created 2026-09-05 by Claude Fable 5.1）：smudge 别名列表、默认笔 = 小滤镜笔、出厂笔参数自愈（spacing 10%→2%）。
import { describe, it, eq, assert } from "./runner.mjs";
import { brushesByTool, defaultBrushForTool, staleBuiltinArgFixes, makeBrush } from "../src/brushes.ts";

const rack = { brushes: [
  makeBrush({ id: "default-brush-pencil", name: "铅笔", tool: "brush", spacingValue: 0.06 }),
  makeBrush({ id: "default-filter-big", name: "大滤镜笔", tool: "filterBrush", size: 300, spacingValue: 0.1 }),
  makeBrush({ id: "default-filter-small", name: "小滤镜笔", tool: "filterBrush", size: 32, spacingValue: 0.1 }),
  makeBrush({ id: "u-texture-finger", name: "纹理手指", tool: "smudge", spacingValue: 0.02 }),
] };
const specs = [
  { id: "default-filter-big", name: "大滤镜笔", tool: "filterBrush", args: { spacingValue: 0.02 } },
  { id: "default-filter-small", name: "小滤镜笔", tool: "filterBrush", args: { spacingValue: 0.02 } },
];

describe("smudge 笔架", () => {
  it("brushesByTool(smudge) = smudge 笔在前 + 全部滤镜笔；不串画笔", () => {
    const ids = brushesByTool(rack, "smudge").map((b) => b.id);
    eq(ids.join(","), "u-texture-finger,default-filter-big,default-filter-small");
    eq(brushesByTool(rack, "filterBrush").length, 2, "滤镜笔架不含 smudge 笔");
  });
  it("默认笔：smudge → 小滤镜笔；没有小滤镜笔时退首支", () => {
    eq(defaultBrushForTool(rack, "smudge").id, "default-filter-small");
    const r2 = { brushes: rack.brushes.filter((b) => b.id !== "default-filter-small") };
    eq(defaultBrushForTool(r2, "smudge").id, "u-texture-finger");
    eq(defaultBrushForTool(rack, "filterBrush").id, "default-filter-big", "滤镜笔默认不变");
  });
});

describe("出厂笔参数自愈（spacing 10% → 2%）", () => {
  it("仍是旧出厂值 0.1 的滤镜笔 → 报修正到 spec 的 0.02；用户改过的 / 已是新值的 / 非出厂 id 不碰", () => {
    const edited = makeBrush({ id: "default-filter-small", name: "小滤镜笔", tool: "filterBrush", spacingValue: 0.07 });
    const done = makeBrush({ id: "default-filter-big", name: "大滤镜笔", tool: "filterBrush", spacingValue: 0.02 });
    const fixes = staleBuiltinArgFixes([rack.brushes[1], edited, done, rack.brushes[0]], specs);
    eq(fixes.length, 1);
    eq(fixes[0].brush.id, "default-filter-big");
    const patched = { ...fixes[0].brush, ...fixes[0].patch };
    const sp = typeof patched.spacing === "number" ? patched.spacing : patched.spacing?.value;
    assert(Math.abs(sp - 0.02) < 1e-9, `patch 后 spacing=0.02（got ${sp}）`);
    eq(staleBuiltinArgFixes([makeBrush({ ...patched })], specs).length, 0, "幂等：修过不再报");
  });
});
