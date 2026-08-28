// #18 全库备份内核契约测试：订阅→一次性快照 / 递归清单 / 字节预算 / 编排回执。
// created 2026-08-28 by Claude Opus 5 (subagent)。
// store 面、zip、下载全是注入端口（mock）——本文件零网络零 DOM。
import { describe, it, assert, eq } from "./runner.mjs";
import {
  snapshotFolderOnce, walkLibrary, createByteBudget, runLibraryBackup,
  backupArchiveName, spillName, BACKUP_BUDGET_BYTES,
} from "../src/gallery/library-backup.ts";
import { ensureZipLoaded } from "./zip-node.mjs";
import { zipPack, zipUnpack } from "../src/backend/zip.ts";

const AT = new Date(2026, 7, 28, 14, 3);   // 2026-08-28 14:03（月份 0 基）
const blobOf = (n) => new Blob([new Uint8Array(n)]);

/** watchFolder 替身：按脚本逐帧异步推给订阅者；记录退订。 */
function fakeWatch(script, log = {}) {
  log.subscribed = log.subscribed || [];
  log.unsubscribed = log.unsubscribed || [];
  return (folder, cb) => {
    log.subscribed.push(folder);
    let dead = false;
    void (async () => {
      for (const frame of (script[folder] ?? [])) {
        await new Promise((r) => setTimeout(r, 0));
        if (dead) return;
        cb(frame);
      }
    })();
    return () => { dead = true; log.unsubscribed.push(folder || "<root>"); };
  };
}
const frame = (path, names, folders = [], complete = true, extra = {}) =>
  ({ path, items: names.map((n) => ({ path: n, size: 10 })), folders, complete, ...extra });

describe("library-backup · 订阅 → 一次性快照（snapshotFolderOnce）", () => {
  it("收到权威帧（complete）立刻返回并退订", async () => {
    const log = {};
    const watch = fakeWatch({ "": [frame("", ["a.ora"], [], false), frame("", ["a.ora", "b.ora"], ["f"], true)] }, log);
    const p = await snapshotFolderOnce(watch, "", { settleMs: 500, timeoutMs: 2000 });
    eq(p.authoritative, true, "权威");
    eq(p.files.length, 2);
    eq(p.folders.join(","), "f");
    eq(log.unsubscribed.join(","), "<root>", "拿到权威帧即退订");
  });
  it("离线两帧节律（都 complete:false）→ 拿第二帧、诚实标 authoritative:false", async () => {
    const watch = fakeWatch({ "": [frame("", ["a.ora"], [], false), frame("", ["a.ora", "b.ora"], ["f"], false)] });
    const p = await snapshotFolderOnce(watch, "", { settleMs: 5000, timeoutMs: 8000 });
    eq(p.authoritative, false);
    eq(p.files.map((f) => f.path).join(","), "a.ora,b.ora", "用的是第二帧（更全）");
  });
  it("stale 帧（dir-index-cache 冷首帧）即使 complete 也不算权威", async () => {
    const watch = fakeWatch({ "": [frame("", ["a.ora"], [], true, { stale: true })] });
    const p = await snapshotFolderOnce(watch, "", { settleMs: 30, timeoutMs: 500 });
    eq(p.authoritative, false, "stale 不权威");
    eq(p.files.length, 1, "但内容仍然拿来用（有总比没有强）");
  });
  it("别夹的帧被丢弃（绝不把别夹内容算进本夹）", async () => {
    const watch = fakeWatch({ "x": [frame("y", ["wrong.ora"], [], true), frame("x", ["right.ora"], [], true)] });
    const p = await snapshotFolderOnce(watch, "x", { settleMs: 200, timeoutMs: 2000 });
    eq(p.files.map((f) => f.path).join(","), "right.ora");
  });
  it("一帧都没有 → settle 兜底返回空清单 + authoritative:false（不吊死）", async () => {
    const watch = fakeWatch({});
    const p = await snapshotFolderOnce(watch, "", { settleMs: 10, timeoutMs: 300 });
    eq(p.files.length, 0);
    eq(p.folders.length, 0);
    eq(p.authoritative, false);
  });
  it("超时兜底路径也退订（备份绝不留常驻订阅）", async () => {
    const log = {};
    const watch = fakeWatch({}, log);   // 一帧不发 → 走 settle 兜底
    await snapshotFolderOnce(watch, "练习", { settleMs: 10, timeoutMs: 300 });
    eq(log.subscribed.join(","), "练习");
    eq(log.unsubscribed.join(","), "练习");
  });
});

const probeOf = (tree) => async (folder) => {
  const n = tree[folder];
  if (!n) return { path: folder, files: [], folders: [], authoritative: false };
  return { path: folder, files: (n.files ?? []).map((p) => ({ path: p })), folders: n.folders ?? [], authoritative: n.authoritative !== false };
};

describe("library-backup · 递归全库清单（walkLibrary）", () => {
  it("BFS 走完整棵树，清单去重 + 按 path 排序", async () => {
    const files = [];
    const m = await walkLibrary(probeOf({
      "": { files: ["b.ora", "a.ora"], folders: ["练习", "空夹"] },
      "练习": { files: ["练习/x.ora", "练习/y.png"], folders: ["练习/深"] },
      "练习/深": { files: ["练习/深/z.ora"], folders: [] },
      "空夹": { files: [], folders: [] },
    }), { onFolder: (f) => files.push(f) });
    eq(m.files.map((f) => f.path).join("|"), "a.ora|b.ora|练习/x.ora|练习/y.png|练习/深/z.ora");
    eq(m.foldersVisited, 4);
    eq(m.truncated, false);
    eq(m.partialFolders.length, 0);
    eq(files.length, 4, "每夹恰好探一次");
  });
  it("子夹重复报出只走一次（防环 / 防重复列举）", async () => {
    const visited = [];
    await walkLibrary(async (folder) => {
      visited.push(folder);
      if (folder === "") return { path: "", files: [], folders: ["a", "a"], authoritative: true };
      if (folder === "a") return { path: "a", files: [], folders: [""], authoritative: true };
      return { path: folder, files: [], folders: [], authoritative: true };
    });
    eq(visited.join(","), ",a", "根和 a 各一次，环不再走");
  });
  it("列不全的夹进 partialFolders（诚实性：备份可能缺项）", async () => {
    const m = await walkLibrary(probeOf({
      "": { files: ["a.ora"], folders: ["离线夹"] },
      "离线夹": { files: ["离线夹/b.ora"], folders: [], authoritative: false },
    }));
    eq(m.partialFolders.join(","), "离线夹");
    eq(m.files.length, 2, "拿到的仍然收进清单");
  });
  it("maxFolders 上限截断 → truncated:true（病态深树不放飞）", async () => {
    const m = await walkLibrary(async (folder) => ({
      path: folder, files: [`${folder}f.ora`], folders: [`${folder}s`], authoritative: true,
    }), { maxFolders: 3 });
    eq(m.foldersVisited, 3);
    eq(m.truncated, true);
  });
});

describe("library-backup · 字节预算（createByteBudget）", () => {
  it("预算内进包；一旦溢出就不再回头（顺序不被小文件插队打乱）", () => {
    const b = createByteBudget(100);
    eq(b.admit(60), "zip");
    eq(b.admit(50), "spill", "60+50>100");
    eq(b.admit(1), "spill", "溢出后不回头");
    eq(b.used(), 60);
    eq(b.spilling(), true);
  });
  it("单件就超预算 → 直接 spill（不会把包撑爆）", () => {
    const b = createByteBudget(100);
    eq(b.admit(1000), "spill");
    eq(b.used(), 0);
  });
  it("默认预算 = 512 MiB", () => { eq(BACKUP_BUDGET_BYTES, 512 * 1024 * 1024); });
});

describe("library-backup · 编排（runLibraryBackup）", () => {
  const mkPorts = (bytesOf) => {
    const delivered = [];
    const packed = [];
    const errors = [];
    return {
      delivered, packed, errors,
      ports: {
        readBytes: async (p) => bytesOf(p),
        pack: async (entries) => { packed.push(entries.map((e) => e.path)); return blobOf(entries.reduce((n, e) => n + e.data.size, 0)); },
        deliver: (blob, filename) => delivered.push({ filename, size: blob.size }),
        onError: (p, e) => errors.push(`${p}:${String(e && e.message)}`),
      },
    };
  };

  it("全部进包：pack 一次、deliver 一次、包名 = weebpaint-backup-YYYYMMDD-HHMM.zip", async () => {
    const h = mkPorts(() => blobOf(10));
    const r = await runLibraryBackup([{ path: "a.ora" }, { path: "练习/b.ora" }], h.ports, { budget: 1000, now: AT });
    eq(r.zipped, 2); eq(r.spilled, 0); eq(r.failed.length, 0); eq(r.bytes, 20);
    eq(r.overBudget, false);
    eq(r.archiveName, "weebpaint-backup-20260828-1403.zip");
    eq(h.packed.length, 1);
    eq(h.packed[0].join("|"), "a.ora|练习/b.ora", "包内保留原路径结构");
    eq(h.delivered.length, 1);
    eq(h.delivered[0].filename, "weebpaint-backup-20260828-1403.zip");
  });

  it("超预算 → 前面进包、其余逐件下载（落地名压平路径保住来源夹）", async () => {
    const h = mkPorts(() => blobOf(40));
    const r = await runLibraryBackup(
      [{ path: "a.ora" }, { path: "练习/b.ora" }, { path: "练习/c.ora" }],
      h.ports, { budget: 50, now: AT },
    );
    eq(r.zipped, 1); eq(r.spilled, 2); eq(r.overBudget, true);
    eq(h.packed[0].join("|"), "a.ora");
    eq(h.delivered.map((d) => d.filename).join("|"), "练习_b.ora|练习_c.ora|weebpaint-backup-20260828-1403.zip");
  });

  it("全部溢出 → 不打包（archiveName=null），只逐件下载", async () => {
    const h = mkPorts(() => blobOf(40));
    const r = await runLibraryBackup([{ path: "a.ora" }, { path: "b.ora" }], h.ports, { budget: 0, now: AT });
    eq(r.zipped, 0); eq(r.spilled, 2); eq(r.archiveName, null);
    eq(h.packed.length, 0, "空包不打");
    eq(h.delivered.map((d) => d.filename).join("|"), "a.ora|b.ora");
  });

  it("取不到的文件进 failed 清单，绝不静默跳过、也不中断整批", async () => {
    const h = mkPorts((p) => {
      if (p === "gone.ora") return null;                       // 纯云端 + 离线
      if (p === "boom.ora") throw new Error("network down");   // 读抛错
      return blobOf(10);
    });
    const r = await runLibraryBackup(
      [{ path: "a.ora" }, { path: "gone.ora" }, { path: "boom.ora" }, { path: "z.ora" }],
      h.ports, { budget: 1000, now: AT },
    );
    eq(r.total, 4); eq(r.zipped, 2);
    eq(r.failed.join(","), "gone.ora,boom.ora");
    eq(h.errors.join(","), "boom.ora:network down", "抛错的有诊断出口；返 null 的不算异常");
    eq(h.packed[0].join("|"), "a.ora|z.ora", "拿到的照样备份");
  });

  it("空清单 → 不 pack 不 deliver", async () => {
    const h = mkPorts(() => blobOf(10));
    const r = await runLibraryBackup([], h.ports, { now: AT });
    eq(r.total, 0); eq(r.archiveName, null);
    eq(h.packed.length, 0); eq(h.delivered.length, 0);
  });

  it("进度回调逐件报（done 从 0 起、total 恒为清单长度）", async () => {
    const h = mkPorts(() => blobOf(1));
    const seen = [];
    await runLibraryBackup([{ path: "a" }, { path: "b" }], { ...h.ports, onProgress: (d, tt, p) => seen.push(`${d}/${tt}:${p}`) }, { now: AT });
    eq(seen.join(","), "0/2:a,1/2:b");
  });

  it("只读：端口面里没有任何写口 —— 备份全程只调 readBytes", async () => {
    const called = [];
    await runLibraryBackup([{ path: "a.ora" }], {
      readBytes: async (p) => { called.push(`read:${p}`); return blobOf(1); },
      pack: async () => { called.push("pack"); return blobOf(1); },
      deliver: () => called.push("deliver"),
    }, { now: AT });
    eq(called.join(","), "read:a.ora,pack,deliver", "读 → 打包 → 交付，没有第四种动作");
  });
});

describe("library-backup · 接真 zipPack（备份包必须是能解开的真备份）", () => {
  it("Blob 端口打包 → zipUnpack 逐字节还原，路径结构原样保留", async () => {
    ensureZipLoaded();
    const enc = new TextEncoder(), dec = new TextDecoder();
    const delivered = [];
    const r = await runLibraryBackup(
      [{ path: "a.ora" }, { path: "练习/夏音.ora" }],
      {
        readBytes: async (p) => new Blob([enc.encode("BYTES:" + p)]),
        pack: (entries) => zipPack(entries, { lastModDate: AT }),
        deliver: (blob, filename) => delivered.push({ blob, filename }),
      },
      { budget: 1e9, now: AT },
    );
    eq(r.zipped, 2);
    eq(delivered.length, 1);
    eq(delivered[0].filename, "weebpaint-backup-20260828-1403.zip");
    const out = await zipUnpack(delivered[0].blob);
    eq(Object.keys(out).sort().join("|"), "a.ora|练习/夏音.ora");
    eq(dec.decode(out["a.ora"]), "BYTES:a.ora");
    eq(dec.decode(out["练习/夏音.ora"]), "BYTES:练习/夏音.ora", "非 ASCII 夹名也原样进出");
  });
});

describe("library-backup · 命名", () => {
  it("backupArchiveName 复用下载分钟戳", () => {
    eq(backupArchiveName(AT), "weebpaint-backup-20260828-1403.zip");
    eq(backupArchiveName(new Date(2026, 0, 3, 9, 5)), "weebpaint-backup-20260103-0905.zip");
  });
  it("spillName 压平路径（不同夹同名不互相盖）", () => {
    eq(spillName("练习/夏音.ora"), "练习_夏音.ora");
    eq(spillName("a/b/c.png"), "a_b_c.png");
    eq(spillName("裸名.ora"), "裸名.ora");
  });
  it("整批合法性：包名不含斜杠（浏览器下载名不许带路径）", () => {
    assert(!backupArchiveName(AT).includes("/"), "包名无斜杠");
    assert(!spillName("a/b.ora").includes("/"), "溢出名无斜杠");
  });
});

describe("library-backup · 透明账（0828 user：溢出必须说明是哪些；包内自带 manifest）", () => {
  it("spilledNames/zippedNames 全名单；renderManifest 进包但不计入 zipped", async () => {
    const mk = (n) => new Blob([new Uint8Array(n)]);
    const delivered = [];
    const r = await runLibraryBackup(
      [{ path: "a.ora" }, { path: "big.ora" }, { path: "b.ora" }],
      {
        readBytes: async (p) => (p === "big.ora" ? mk(100) : mk(10)),
        pack: async (entries) => { delivered.push(["zip", entries.map((e) => e.path)]); return mk(1); },
        deliver: (_b, name) => { delivered.push(["file", name]); },
      },
      { budget: 50, renderManifest: (m) => `Z:${m.zipped.join()};S:${m.spilled.join()};F:${m.failed.join()}` },
    );
    eq(r.zipped, 1, "zipped 不含 manifest 自己（单向阀：超出点起后续全逐件）");
    eq(r.zippedNames.join(","), "a.ora");
    eq(r.spilledNames.join(","), "big.ora,b.ora", "★溢出名单逐件可见（不是驱逐：已逐件下载交付）");
    const zipEntries = delivered.find((d) => d[0] === "zip")[1];
    assert(zipEntries.includes("backup-manifest.txt"), "manifest 在包内");
  });
});
