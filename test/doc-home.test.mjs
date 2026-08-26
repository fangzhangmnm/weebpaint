// doc-home（一画一家）契约测试：keeper 单持权 + (家×动作) 矩阵。
// created 2026-08-26 by Claude Fable 5（无地骑士 P1；拍板 = ai-docs/20260825-localfile-knight-grill-verdicts.md §1.1/§2.1）。
// 纯模块（无 DOM/IDB/store）——身份/保存派发这些「错了就是数据事故」的判断钉在 node 层。
import { describe, it, assert, eq } from "./runner.mjs";
import {
  claimHomeAuthority, docHome, fileDirty, saveRoute, homeDisplayName,
  SOLE_GALLERY_ID, _resetHomeKeeperForTest,
} from "../src/doc-home.ts";

const fakeHandle = { name: "夏音.ora", getFile: async () => null, createWritable: async () => null };
const GAL = { kind: "gallery", galleryId: SOLE_GALLERY_ID, path: "练习/夏音" };
const FIL = { kind: "file", handle: fakeHandle, fileName: "夏音.ora", lastSeenMtime: 1000 };
const TRA = { kind: "transient" };

describe("doc-home · keeper 单持权（workpiece 令牌同手法）", () => {
  it("authority 只许 claim 一次——第二个持权人是结构 bug，响亮 throw", () => {
    _resetHomeKeeperForTest();
    claimHomeAuthority();
    let threw = false;
    try { claimHomeAuthority(); } catch { threw = true; }
    assert(threw, "二次 claim 必须 throw");
  });

  it("消费者拿到的家快照是冻结的——改家只能走 authority 动词", () => {
    _resetHomeKeeperForTest();
    const auth = claimHomeAuthority();
    auth.setHome(GAL);
    const h = docHome();
    assert(Object.isFrozen(h), "快照必须冻结");
    try { h.path = "别处"; } catch { /* strict mode throw 也算拦住 */ }
    eq(docHome().path, "练习/夏音", "绕过 authority 的写必须无效");
  });

  it("file 家 dirty：mark/clear 只有 authority 能动；换家自动归零（新家=干净）", () => {
    _resetHomeKeeperForTest();
    const auth = claimHomeAuthority();
    auth.setHome(FIL);
    eq(fileDirty(), false, "初始干净");
    auth.markFileDirty();
    eq(fileDirty(), true, "落笔标脏");
    auth.clearFileDirty();
    eq(fileDirty(), false, "写回成功才清");
    auth.markFileDirty();
    auth.setHome(GAL);   // 换家（收编入库等）
    eq(fileDirty(), false, "换家后 file-dirty 不许残留（残留=下一个 file 家背上一个家的脏）");
  });

  it("★非 file 家动 file-dirty = 结构 bug，throw 不静默吞", () => {
    _resetHomeKeeperForTest();
    const auth = claimHomeAuthority();
    auth.setHome(GAL);
    for (const op of ["markFileDirty", "clearFileDirty"]) {
      let threw = false;
      try { auth[op](); } catch { threw = true; }
      assert(threw, `${op} 在 gallery 家必须 throw`);
    }
  });

  it("patchFileMtime：写回后前移对表基准；快照不可变（返回新对象）", () => {
    _resetHomeKeeperForTest();
    const auth = claimHomeAuthority();
    auth.setHome(FIL);
    const before = docHome();
    auth.patchFileMtime(2000);
    eq(docHome().lastSeenMtime, 2000, "基准前移");
    eq(before.lastSeenMtime, 1000, "旧快照不被原地改（调用方持有的引用不失真）");
    assert(before !== docHome(), "patch 换新对象——docHome() 引用相等可用作「家没换过」指纹");
  });
});

describe("doc-home · (家×动作) 保存派发矩阵（宪法：保存=送回家）", () => {
  // 全矩阵逐格钉死：家 × {显式保存, implicit 偷存}。implicit 对 file/transient = noop——
  //   静默写用户磁盘违背 Windows 文件语义（Alt+F4=不保存，human 拍板 spec 20260819 §7.1）。
  const MATRIX = [
    // [home,  explicit 期望,       implicit 期望]
    [null,    "noop",              "noop"],
    [GAL,     "store",             "store"],            // gallery 家：IDB/云是自家地盘，autosave 照走
    [FIL,     "file-writeback",    "noop"],
    [TRA,     "settle",            "noop"],             // 安家仪式必须显式（P2 落地）
  ];
  it("矩阵全格", () => {
    for (const [home, exp, impExp] of MATRIX) {
      const label = home ? home.kind : "无doc";
      eq(saveRoute(home, {}), exp, `${label} × 显式保存`);
      eq(saveRoute(home, { implicit: true }), impExp, `${label} × implicit`);
    }
  });
});

describe("doc-home 收尾", () => {
  it("归还 keeper claim（同进程后面还有 app.js boot smoke 要真 claim 一次）", () => {
    _resetHomeKeeperForTest();
  });
});

describe("doc-home · 展示基名（不是身份）", () => {
  it("file=stem / gallery=户口path / transient·无doc=fallback", () => {
    eq(homeDisplayName(FIL, "export"), "夏音");
    eq(homeDisplayName(GAL, "export"), "练习/夏音");
    eq(homeDisplayName(TRA, "export"), "export");
    eq(homeDisplayName(null, "export"), "export");
    eq(homeDisplayName({ kind: "file", handle: fakeHandle, fileName: ".ora", lastSeenMtime: 0 }, "export"), "export", "stem 空兜 fallback，文件名别变空串");
  });
});
