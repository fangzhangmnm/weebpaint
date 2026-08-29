// created 2026-08-28 by Claude Fable 5
// 出厂笔名多语言（数据契约内建）+ 自愈护栏（user 2026-08-28 报案：英文界面新号笔架全中文名；
// 同日拍板「工厂笔跟着界面自动改名的自愈护栏」+「多语言进数据契约本身，不烤在别处」）。
//
// 三道钉：
//   ① 数据契约完整性：每支出厂笔必有 names 字段，names.zh 与 name 逐字一致（name = 旧契约
//      的 backward-compat 面，恒中文原文），en/ja 必填非空——新加出厂笔漏写多语言名 = 这里红。
//   ② specDisplayName / staleBuiltinNameFixes：任一语言出厂名（=用户没改过）→ 改成当前语言名；
//      用户改过的名 / 非 default-* id 永不碰；幂等（应用后再跑 = 零改）。
//   ③ node 无 navigator → lang = en（i18n detectLang 既定行为），所以本文件断言 en 值。
import { readFileSync } from "node:fs";
import { test, eq, assert } from "./runner.mjs";
import { specDisplayName, staleBuiltinNameFixes, type BrushSpec } from "../src/brushes.ts";
import type { Brush } from "../src/brush-types.ts";

const SPECS: BrushSpec[] = JSON.parse(readFileSync(new URL("../builtin-brushes.json", import.meta.url), "utf-8"));

test("① 每支出厂笔的 names 字段齐全：zh==name（backward compat 面）、en/ja 非空", () => {
  for (const s of SPECS) {
    assert(!!s.names, `出厂笔 ${s.id} 缺 names 字段（多语言名进数据契约，2026-08-28 起新出厂笔必写）`);
    eq(s.names!.zh, s.name, `${s.id} 的 names.zh 必须与 name 逐字一致（name = 旧契约兼容面，恒 zh 原文）`);
    assert(!!s.names!.en && !!s.names!.ja, `${s.id} 的 names 缺 en/ja`);
  }
});

test("② specDisplayName：node（en）下拿英文名；无 names 的 spec 回落 name", () => {
  eq(specDisplayName({ name: "铅笔", names: { zh: "铅笔", en: "Pencil", ja: "鉛筆" } }), "Pencil");
  eq(specDisplayName({ name: "自定义" }), "自定义");
});

const mk = (id: string, name: string): Brush => ({ id, name, tool: "brush" } as unknown as Brush);
const spec = (id: string) => SPECS.find((s) => s.id === id)!;

test("② 自愈判定：中文/日文出厂名 → 改英文；用户改名 / 非出厂 id / 无 spec 不碰；幂等", () => {
  const rack = [
    mk("default-brush-pencil", "铅笔"),          // zh 出厂名 → 应改 Pencil
    mk("default-brush-ink", "ペン入れ"),          // ja 出厂名 → 应改 Ink
    mk("default-eraser-hard", "Hard eraser"),    // 已是当前语言 → 不动
    mk("default-brush-fill", "我调过的平涂"),     // 用户改过名 → 永不碰
    mk("default-retired-brush", "铅笔"),         // 已退役出厂 id、spec 里没有 → 不碰
    mk("b-uuid1234", "铅笔"),                    // 用户自建笔恰好叫铅笔 → 非 default-* 不碰
  ];
  const fixes = staleBuiltinNameFixes(rack, SPECS);
  eq(fixes.length, 2);
  eq(fixes.find((f) => f.brush.id === "default-brush-pencil")?.name, "Pencil");
  eq(fixes.find((f) => f.brush.id === "default-brush-ink")?.name, "Ink");
  // 应用后再跑 = 零改（幂等；heal 每次 boot 跑，稳态不能有写）
  const healed = rack.map((b) => {
    const f = fixes.find((x) => x.brush.id === b.id);
    return f ? { ...b, name: f.name } : b;
  });
  eq(staleBuiltinNameFixes(healed, SPECS).length, 0);
});

test("② 全量 json 播种自愈演练：16 支 zh 名全部收敛到 en，且再跑零改", () => {
  const rack = SPECS.map((s) => mk(s.id, s.name));   // 模拟历史中文播种的老号
  const fixes = staleBuiltinNameFixes(rack, SPECS);
  eq(fixes.length, SPECS.length, "历史中文播种的出厂笔应全部被自愈改名");
  for (const f of fixes) eq(f.name, spec(f.brush.id).names!.en);
  const healed = rack.map((b) => ({ ...b, name: fixes.find((x) => x.brush.id === b.id)!.name }));
  eq(staleBuiltinNameFixes(healed, SPECS).length, 0);
});
