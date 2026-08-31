// 诊断日志环（2026-08-31）：环容量/截断/顺序/文本头/清空。node 下 device-kv 无 localStorage → 内存降级，本测只守逻辑。
// created 2026-08-31 by Claude Fable 5.
import { describe, it, assert, eq } from "./runner.mjs";
import { record, note, entries, clear, toText } from "../src/diag-log.ts";

describe("diag-log · 环形诊断日志", () => {
  it("record/note 追加、旧在前新在后、note 带 [tag]", () => {
    clear();
    record("error", "boom");
    note("gallery", "subscribe folder=\"\"");
    const es = entries();
    eq(es.length, 2);
    eq(es[0].l, "error"); eq(es[0].m, "boom");
    eq(es[1].l, "note"); eq(es[1].m, "[gallery] subscribe folder=\"\"");
  });
  it("环满 300 丢最旧；单条截 600 字符", () => {
    clear();
    for (let i = 0; i < 305; i++) record("log", "m" + i);
    const es = entries();
    eq(es.length, 300);
    eq(es[0].m, "m5", "最旧五条被丢");
    record("log", "x".repeat(2000));
    eq(entries()[299].m.length, 600);
  });
  it("toText：环境头 + 分隔 + 每条一行；清空后 (empty)", () => {
    clear();
    record("warning", "w1");
    const txt = toText();
    assert(txt.startsWith("WeebPaint "), "版本头");
    assert(txt.includes("\n----\n"), "分隔线");
    assert(/\d\d-\d\d \d\d:\d\d:\d\d\.\d\d\d W w1$/m.test(txt), "行格式: " + txt.split("----")[1]);
    clear();
    assert(toText().endsWith("(empty)"));
  });
});
