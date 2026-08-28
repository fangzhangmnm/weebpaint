// created 2026-08-28 by Claude Fable 5
// F3 入口（esbuild --bundle → tmp/preflight-f3.js）：**真 local-cache（真 IDB）**上重放 A4 契约。
// 为什么直接吃库仓源码：LocalCache 是库内部模块（exports 门牌不放行 deep import），而 wave 6 这层
//   要抓的正是「mock 镜像 ↔ 真 IDB 实现」的契约漂移——node 层 355 测试打的是 mock，这里补真身。
//   tgz 由同一源构建（v0.8.0 收货同 commit），源即真身。
// 双 tab 模型：两个 createLocalCache 实例共一个 IDB 库 = 双 tab 共库；per-tab seenRev 是实例级——
//   同页两实例与真双 tab 在 local-cache 代码路径上等价（跨页版本归真机批）。
import { createLocalCache } from "../../../20260813 internal-store/src/local-cache.ts";

const DB = "preflight-f3.guard";
const u8 = (s: string) => new TextEncoder().encode(s);
const txt = async (b: Blob | null) => (b ? new TextDecoder().decode(await b.arrayBuffer()) : "<null>");

type Res = { fails: string[] };
async function run(): Promise<Res> {
  const fails: string[] = [];
  const expect = (name: string, cond: boolean, detail = "") => { if (!cond) fails.push(name + (detail ? ` — ${detail}` : "")); };
  await new Promise<void>((res) => { const r = indexedDB.deleteDatabase(DB); r.onsuccess = r.onerror = r.onblocked = () => res(); });   // 轮间幂等

  const tabA = createLocalCache(DB);
  const tabB = createLocalCache(DB);
  type Receipt = { rev: number; foreignOverwrite?: { backedUp: boolean; foreignRev: number } };

  // 单写手：guarded 连写永不报冲突，rev 单调
  const r1 = await tabA.save("f.ora", u8("A1"), undefined, "user-save") as Receipt;
  expect("rev1", r1.rev === 1 && !r1.foreignOverwrite, JSON.stringify(r1));

  // 双 tab：B 打开同作品再保存 → A 的下一次 autosave 撞版
  await tabB.get("f.ora");
  const r2 = await tabB.save("f.ora", u8("B1"), undefined, "user-save") as Receipt;
  expect("B rev2 no-conflict", r2.rev === 2 && !r2.foreignOverwrite, JSON.stringify(r2));
  const r3 = await tabA.save("f.ora", u8("A2"), undefined, "user-save") as Receipt;
  expect("A conflict receipt", !!r3.foreignOverwrite && r3.foreignOverwrite.foreignRev === 2 && r3.foreignOverwrite.backedUp === true, JSON.stringify(r3));
  expect("A bytes win", (await txt(await tabA.get("f.ora"))) === "A2");

  // 对方字节确实留底：backup 分区 1 份，restore 出来 = B1（落点占用 → 改名恢复，顺带走真 restore 路径）
  const bks = await tabA.listBackup();
  expect("one backup", bks.length === 1, JSON.stringify(bks));
  const restored = await tabA.restore(bks[0].trashKey);
  expect("restore renamed (no overwrite)", restored !== "f.ora" && !!restored, String(restored));
  expect("backup bytes are B's", (await txt(await tabA.get(restored))) === "B1");

  // 防 spam：冷却窗内 B 再撞 → 回执照出、backup 不再堆（B 自己的首次撞版备份 1 份后静默）
  const r4 = await tabB.save("f.ora", u8("B2"), undefined, "user-save") as Receipt;
  expect("B conflict receipt", !!r4.foreignOverwrite, JSON.stringify(r4));
  const r5 = await tabB.save("f.ora", u8("B3"), undefined, "user-save") as Receipt;
  expect("B second save clean", !r5.foreignOverwrite, JSON.stringify(r5));
  const r6 = await tabA.save("f.ora", u8("A3"), undefined, "user-save") as Receipt;
  expect("A cooldown: receipt yes backup no", !!r6.foreignOverwrite && r6.foreignOverwrite.backedUp === false, JSON.stringify(r6));
  // 此刻 backup 分区 = 只有 B 撞版那份（A 那份上面已被 restore **移走**——restore=move 语义，不是 copy）
  expect("backups stay 1 (B的1份；A的已restore移出)", (await tabA.listBackup()).length === 1);

  // 系统路径（无 guard）：覆盖照常、零冲突零留底
  const r7 = await tabB.save("f.ora", u8("cloud"), undefined) as Receipt;
  expect("unguarded no conflict", !r7.foreignOverwrite, JSON.stringify(r7));

  tabA.close?.(); tabB.close?.();
  return { fails };
}

(window as unknown as { __F3__: () => Promise<Res> }).__F3__ = run;
