// 待办总账 lint（ai-docs/20260907-ledger.md）——总账是纯索引，一条一行；这里守住它不烂：
//   ① 编号唯一且永不复用（next-id 必须大于最大编号）；
//   ② 每条格式固定 `- #n [S|M|L|?] 一句话 · 状态 · yyyymmdd · → 指针`（状态词只准用规定集）；
//   ③ 指针指向的文件必须真的存在（索引最容易腐烂的地方就是指针）；
//   ④ 一句话里引用的 `#n` 必须是已登记条目（冲突登记 `#a ⚡ #b` 靠这条不指空）。
// 索引里不准放详情（详情住 handoff / grill 稿 / 便条 / journal），所以行长也设了上限。
// created 2026-09-07 by Claude Fable 5.1（user：「wishlist 只放引用和概括，这样改 priority、reshuffle 的时候就比较好管理」）
import { describe, it } from "./runner.mjs";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LEDGER = path.join(ROOT, "ai-docs", "20260907-ledger.md");
const STATUS = new Set(["待做", "进行中", "待拍板", "待看", "已问", "等数据", "wishlist", "远景", "park", "done", "冲突"]);
const MAX_LINE = 260; // 超过这个长度 = 往索引里塞详情了，去开 doc

function parseLedger(text) {
  const lines = text.split("\n");
  const entries = [];
  let nextId = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const nm = /^>\s*next-id:\s*(\d+)/.exec(line);
    if (nm) nextId = Number(nm[1]);
    if (!/^- #\d+/.test(line)) continue;
    const segs = line.slice(2).split(" · ");
    const head = /^#(\d+) \[([SML?])\] (.+)$/.exec(segs[0] ?? "");
    entries.push({ lineNo: i + 1, raw: line, head, segs });
  }
  return { entries, nextId };
}

function pointerFiles(seg) {
  // `→ a/b.md §3; ../x/y.md #A1` → ["a/b.md", "../x/y.md"]
  return seg.slice(2).split(";").map((p) => p.trim().replace(/\s[§#].*$/, "")).filter(Boolean);
}

describe("待办总账 lint（ai-docs/20260907-ledger.md）", () => {
  const text = fs.readFileSync(LEDGER, "utf8");
  const { entries, nextId } = parseLedger(text);

  it("有 next-id 标记，且大于最大编号（编号永不复用）", () => {
    assert.ok(nextId != null, "缺 `> next-id: N`");
    const ids = entries.map((e) => Number(e.head?.[1])).filter((n) => Number.isFinite(n));
    const max = ids.length ? Math.max(...ids) : 0;
    assert.ok(nextId > max, `next-id ${nextId} 必须 > 最大编号 ${max}`);
  });

  it("每条 = `- #n [S|M|L|?] 一句话 · 状态 · yyyymmdd · → 指针`，状态词在规定集内", () => {
    for (const e of entries) {
      assert.ok(e.head, `行 ${e.lineNo}: 头段格式错（#n [S|M|L|?] 一句话）：${e.raw.slice(0, 60)}`);
      assert.ok(e.segs.length >= 4, `行 ${e.lineNo}: 少段（要 一句话 · 状态 · 日期 · → 指针）`);
      assert.ok(STATUS.has(e.segs[1]), `行 ${e.lineNo}: 状态词「${e.segs[1]}」不在 ${[...STATUS].join("/")}`);
      assert.match(e.segs[2], /^20\d{6}$/, `行 ${e.lineNo}: 登记日要 yyyymmdd，得到「${e.segs[2]}」`);
      assert.ok(e.segs.some((s) => s.startsWith("→ ")), `行 ${e.lineNo}: 缺「→ 指针」段`);
      assert.ok(e.raw.length <= MAX_LINE, `行 ${e.lineNo}: ${e.raw.length} 字符 > ${MAX_LINE}——详情去开 doc，索引只留一句话`);
    }
  });

  it("编号唯一", () => {
    const seen = new Map();
    for (const e of entries) {
      const id = e.head?.[1];
      assert.ok(!seen.has(id), `#${id} 重复：行 ${seen.get(id)} 与行 ${e.lineNo}`);
      seen.set(id, e.lineNo);
    }
  });

  it("指针文件都存在（相对 WeebPaint 根；允许 §/# 定位后缀与 `;` 多指针）", () => {
    for (const e of entries) {
      for (const seg of e.segs.filter((s) => s.startsWith("→ "))) {
        for (const p of pointerFiles(seg)) {
          assert.ok(fs.existsSync(path.join(ROOT, p)), `行 ${e.lineNo}: 指针不存在 ${p}`);
        }
      }
    }
  });

  it("一句话里引用的 #n 都是已登记条目", () => {
    const ids = new Set(entries.map((e) => e.head?.[1]));
    for (const e of entries) {
      for (const m of (e.head?.[3] ?? "").matchAll(/#(\d+)/g)) {
        assert.ok(ids.has(m[1]), `行 ${e.lineNo}: 引用了不存在的 #${m[1]}`);
      }
    }
  });
});
