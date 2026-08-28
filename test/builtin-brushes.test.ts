// created 2026-08-28 by Claude Opus 5 (subagent)
// 出厂笔数据契约 + 「固定」变体不变式（builtin-brushes.json 是根目录 asset，runtime fetch；
// node 下 fetch 不到，所以这里直接从磁盘读——canvas-templates.test.ts 同款先例）。
//
// 这个文件存在的理由（2026-08-28，总账 §3 #12）：
//   user 0823 问「笔刷压感toggle还是是否有压感做成不同的笔刷？」→ 0828 拍板【分两支笔，笔压toggle sunset】。
//   全局「禁用笔压」toggle 撤了，「不要压感」改成**选另一支笔**：每支压感主导的出厂笔配一支 `-fixed` 变体。
//   变体的唯一合法差异 = 三个压感 coeff 归零。**逐字段比对**钉住这条，是为了防两种漂移：
//     ① 有人顺手给「固定版」调个手感（size/hardness/spacing/taper/smooth…）→ 两支笔悄悄分叉，
//        原笔的调参再也传不到变体上（手感是人类钉死区，AI 不许自己发明数值）；
//     ② 有人漏配变体 / 多配变体（比如给 flow 主导的喷枪族也来一发，那需要发明新 flow 值）。
import { readFileSync } from "node:fs";
import { test, eq, assert } from "./runner.mjs";

interface Spec { id: string; name: string; tool: string; args?: Record<string, unknown>; }
const SPECS: Spec[] = JSON.parse(readFileSync(new URL("../builtin-brushes.json", import.meta.url), "utf-8"));

// 三个压感 coeff（brush.ts signedLerp 的输入；0 = 完全不响应压感）= 「固定」变体唯一准改的字段。
const PRESSURE_COEFFS = ["sizeCoeff", "opaCoeff", "flowCoeff"] as const;
const FIXED_SUFFIX = "-fixed";

const byId = new Map(SPECS.map((s) => [s.id, s]));
const origins = SPECS.filter((s) => !s.id.endsWith(FIXED_SUFFIX));
const variants = SPECS.filter((s) => s.id.endsWith(FIXED_SUFFIX));
const num = (s: Spec, k: string): number => Number(s.args?.[k] ?? 0);

// 拆哪几支的判据（克制，不全量翻倍）：压感主导笔宽、且不是 flow 主导的那些。
//   flow 主导（喷枪 / 软橡皮 / 滤镜笔，flowCoeff = 1）：压感→流量**就是**喷枪本身，归零会得到一支
//   满流量糊块 —— 那是另一支笔的设计题（要发明新 flow 值），故**不拆**，留人类裁决。
//   像素三支（三个 coeff 本来就是 0）= 它们**就是**固定版，不需要变体。
const needsFixed = (s: Spec): boolean => num(s, "sizeCoeff") >= 0.5 && num(s, "flowCoeff") < 1;

test("出厂笔数据契约：id 唯一、字段齐全", () => {
  const ids = new Set<string>();
  for (const s of SPECS) {
    for (const k of ["id", "name", "tool"]) assert(k in s, `出厂笔缺 ${k}: ${JSON.stringify(s)}`);
    assert(!ids.has(s.id), `id 重复: ${s.id}`);
    ids.add(s.id);
    assert(!!s.args, `${s.id} 缺 args（出厂笔约定每个字段都显式写全，见 brushes.ts makeBrush 注释）`);
    for (const c of PRESSURE_COEFFS) {
      assert(typeof s.args![c] === "number", `${s.id} 缺 ${c}（出厂笔不许依赖 makeBrush 默认值）`);
    }
  }
});

test("固定变体：该有的一支不少、不该有的一支不多", () => {
  for (const o of origins) {
    const want = o.id + FIXED_SUFFIX;
    if (needsFixed(o)) {
      assert(byId.has(want), `${o.id}（${o.name}）压感主导笔宽，缺固定变体 ${want}`);
    } else {
      assert(!byId.has(want), `${o.id}（${o.name}）不在拆分判据内，不该有 ${want}——` +
        `flow 主导 / 本来零压感的笔要「固定版」得先发明新参数值，那是人类的活`);
    }
  }
  assert(variants.length > 0, "一支固定变体都没有——判据或数据大概被改坏了，先修这条");
});

test("★ 固定变体 = 原笔逐字拷贝，只有三个压感 coeff 归零（不许发明数值）", () => {
  for (const v of variants) {
    const origin = byId.get(v.id.slice(0, -FIXED_SUFFIX.length));
    assert(!!origin, `${v.id} 找不到同名原笔（-fixed 前缀必须是一支真出厂笔的 id）`);
    eq(v.tool, origin!.tool, `${v.id} 的 tool 必须与原笔一致`);
    eq(v.name, "固定" + origin!.name, `${v.id} 命名约定 = 「固定」+ 原名`);

    const a = origin!.args!, b = v.args!;
    eq(Object.keys(b).sort().join(","), Object.keys(a).sort().join(","),
       `${v.id} 的 args 键集必须与原笔逐字一致（多一个少一个都是分叉）`);
    for (const k of Object.keys(a)) {
      if ((PRESSURE_COEFFS as readonly string[]).includes(k)) {
        eq(b[k], 0, `${v.id} 的 ${k} 必须为 0（固定 = 不响应压感）`);
      } else {
        eq(JSON.stringify(b[k]), JSON.stringify(a[k]),
           `${v.id} 的 ${k} 与原笔 ${origin!.id} 不一致 —— 固定变体只准改三个压感 coeff，` +
           `手感数值一律从原笔逐字拷贝（手感是人类钉死区）`);
      }
    }
  }
});

test("固定变体 id 走 stable「default-{tool}-{slug}」约定（restoreBuiltins 靠 id 比对）", () => {
  for (const v of variants) assert(v.id.startsWith("default-"), `${v.id} 不是 default- 前缀的 stable id`);
});
