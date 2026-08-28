// store 缺席行为锁（2026-08-27 替身退役后）：内存 collection 契约 + 整段 boot smoke。
// 胜利条件：store 缺席时 app 仍可 boot（kind:none，无 null-store/dormant 替身）、无库笔架
// （内存 collection）可 seed 可编辑。旧「null-store 消费面点名」已随替身物理退役——
// 缺席行为现由类型逼消费点表态（requireStore/galleryBackend），drift 由 tsc 点名而非 smoke。
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, it, assert, eq } from "./runner.mjs";
import { createMemoryCollection } from "../src/store-absent.ts";

describe("store-absent · 内存 collection", () => {
  it("getInitData seed + get/set/entries/tombstone/onChange", async () => {
    const c = createMemoryCollection({ getInitData: () => [{ id: "a", value: 1 }, { id: "b", value: 2 }] });
    await c.init();
    eq(c.getItem("a"), 1, "seed 可读");
    eq(c.keys().length, 2, "两条");
    let hits = 0;
    const off = c.onChange(() => hits++);
    c.setItem("a", 9);
    eq(c.getItem("a"), 9, "内存可编辑");
    eq(hits, 1, "整库 onChange 触发");
    let keyHits = 0;
    c.onChange("b", () => keyHits++);
    c.deleteItem("b");
    eq(c.getItem("b", "默认"), "默认", "墓碑读回默认");
    eq(c.keys().length, 1, "墓碑不进 keys");
    eq(keyHits, 1, "单 key onChange 触发");
    off();
    c.setItem("a", 10);
    eq(hits, 2 - 1 + 1, "退订后不再累计（仅剩之前那次+退订前）");   // hits 停在 2：setItem(a,9)+deleteItem(b)
    eq((await c.reconcileWithRemote()).status, "offline", "reconcile 报 offline");
    eq((await c.flushLocal()).ok, true, "flushLocal ok");
  });
});

describe("store-absent · 整段 boot smoke（子进程）", () => {
  it("WEEBPAINT_NOSTORE=1 下 app.ts 整段 boot 不炸", async () => {
    const child = fileURLToPath(new URL("./nostore-boot-child.mjs", import.meta.url));
    const r = await new Promise((resolve) => {
      const p = spawn(process.execPath, [child], {
        env: { ...process.env, WEEBPAINT_NOSTORE: "1" },
        stdio: ["ignore", "ignore", "pipe"],
      });
      let err = "";
      p.stderr.on("data", (d) => { err += d; });
      // 超时墙（2026-08-10）：子进程若挂死（boot 泄漏句柄 + 主线抛错被收集器吞），
      // 无超时 = 整个 npm test 无限等。60s 杀掉、响亮失败。
      const wall = setTimeout(() => { p.kill("SIGKILL"); }, 60_000);
      p.on("close", (code, signal) => { clearTimeout(wall); resolve({ code: signal ? `killed(${signal})` : code, err }); });
    });
    assert(r.code === 0, `nostore boot 子进程退出码 ${r.code}：\n${r.err.slice(0, 2000)}`);
  }, { timeout: 60_000 });   // 延长：spawn 整段 boot（暖 ~6s，冷可超默认 10s；与上面 60s 杀墙对齐）
});
