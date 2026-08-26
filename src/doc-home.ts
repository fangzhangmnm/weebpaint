// doc-home.ts —— 「一画一家」的身份联合类型 + 家状态唯一持权 keeper（P1 核心）。
// created 2026-08-26 by Claude Fable 5（无地骑士 P1；契约 = ai-docs/20260825-localfile-knight-proposal-api.md，
// 拍板 = ai-docs/20260825-localfile-knight-grill-verdicts.md §1.1/§2.1/§4-P1）。
//
// 宪法（美工版）：每幅画任一时刻恰好有一个家——图库、或磁盘上的一个文件、或还没有家（transient）。
//   保存 = 送回家，只有回了家才清 dirty；送去别的地方 = 导出，导出永不清 dirty。
//
// 纯模块：无 DOM / 无 IDB / 无 store（LocalFileHandle 只 import type，擦除）→ node 可测。
// 持权手法 = workpiece 令牌同款（ADR-0008）：**家动词（换家 / 清 file-dirty）只有 authority 持有者能调**，
//   claimHomeAuthority() 只许 claim 一次（session-state 在 module init 持走）；其余模块只有只读快照。
//   结构上不存在第二个能清 dirty / 改家的路径——这就是「安家/搬家/清 dirty 单模块持权」的钉法。

import type { LocalFileHandle } from "./local-file-session.ts";

// ─── 身份联合类型（提案 .h 原文形状）────────────────────────────────────
/** 一画一家。徽章/保存/导出基名/守卫 全部 switch 此联合类型（exhaustive，编译器守——
 *  消费点请用 switch + assertNever，加第四种家时 tsc 逐点报错，而不是静默走错分支）。 */
export type DocHome =
  | { kind: "gallery"; galleryId: string; path: string }   // 户口 =（gallery-id, 相对path）；path=库裸名（自带夹前缀，0607 身份判决原样）
  | { kind: "file"; handle: LocalFileHandle; fileName: string; lastSeenMtime: number }   // 文件家；mtime 对表基准
  | { kind: "transient" };                                  // 无家（Editor Only / 安家仪式前）；行李牌归 P2 CrashStore

/** P3 registry 铸 opaque id 之前的唯一 gallery（单 store 实例现状）。registry 落地后由它供值，此常量退役。 */
export const SOLE_GALLERY_ID = "default";

/** 消费点 exhaustive 守卫：switch 落到这儿 = 联合类型加了新成员而这个消费点没跟上。 */
export function assertNever(x: never): never {
  throw new Error("[doc-home] non-exhaustive switch: " + JSON.stringify(x));
}

// ─── 家状态（keeper 私有 SSoT）───────────────────────────────────────
let _home: Readonly<DocHome> | null = null;
let _fileDirty = false;   // 仅 file 家使用：相对「磁盘上那个文件」的脏。gallery 家的脏归 editor-session（store 正门清）。
let _claimed = false;

/** 只读快照（冻结对象；消费者拿不到可变引用，改家只能走 authority 动词）。 */
export function docHome(): Readonly<DocHome> | null { return _home; }
/** file 家的 dirty（非 file 家恒 false）。gallery 家的 dirty 不在这儿——问 editor-session。 */
export function fileDirty(): boolean { return _home?.kind === "file" ? _fileDirty : false; }

// ─── 家动词（唯一持权；workpiece 令牌同手法）──────────────────────────
export interface HomeAuthority {
  /** 换家（安家/搬家/离家=null）。换家即换世界线：file-dirty 归零（新家相对自己天然干净）。 */
  setHome(h: DocHome | null): void;
  /** file 家标脏（编辑落笔）。非 file 家调用 = 结构 bug，throw（不静默吞）。 */
  markFileDirty(): void;
  /** file 家清脏——**只有写回文件成功后**允许调（导出永不清 dirty 由「导出路径根本拿不到本方法」结构保证）。 */
  clearFileDirty(): void;
  /** 写回成功后前移 mtime 对表基准（陈旧检查的比较对象）。非 file 家 throw。 */
  patchFileMtime(lastSeenMtime: number): void;
}

export function claimHomeAuthority(): HomeAuthority {
  if (_claimed) throw new Error("[doc-home] authority already claimed (single-holder token)");
  _claimed = true;
  return {
    setHome(h) {
      _home = h == null ? null : Object.freeze({ ...h });
      _fileDirty = false;
    },
    markFileDirty() {
      if (_home?.kind !== "file") throw new Error("[doc-home] markFileDirty outside file home");
      _fileDirty = true;
    },
    clearFileDirty() {
      if (_home?.kind !== "file") throw new Error("[doc-home] clearFileDirty outside file home");
      _fileDirty = false;
    },
    patchFileMtime(lastSeenMtime) {
      if (_home?.kind !== "file") throw new Error("[doc-home] patchFileMtime outside file home");
      _home = Object.freeze({ ..._home, lastSeenMtime });
    },
  };
}

/** 仅供 node 测试重置 keeper（app 运行时永不调；不导出到任何 UI 路径）。 */
export function _resetHomeKeeperForTest(): void { _home = null; _fileDirty = false; _claimed = false; }

// ─── 保存派发（纯函数；(家×动作) 矩阵契约测试钉在 test/doc-home.test.mjs）────
/** 保存 = 送回家 的路由。implicit（autosave/beforeunload 偷存）对 file/transient = noop——
 *  静默写用户磁盘文件违背 Windows 文件语义（Alt+F4=不保存，human 拍板 spec 20260819 §7.1）；
 *  transient 的 implicit 同理（安家仪式必须显式）。gallery 家 implicit 照走 store（IDB 自家地盘）。 */
export type SaveRoute =
  | "store"            // gallery：store 正门（editor-session flushLocal / forceSaveAndPush）
  | "file-writeback"   // file：器官写回（mtime 陈旧对表在写回路径内）
  | "settle"           // transient：安家仪式（P2 落地 Editor-only 三键；本 slice 无 transient 产者）
  | "noop";            // 无家可保存 / implicit 不碰用户磁盘
export function saveRoute(home: Readonly<DocHome> | null, opts: { implicit?: boolean } = {}): SaveRoute {
  if (!home) return "noop";
  switch (home.kind) {
    case "gallery": return "store";
    case "file": return opts.implicit ? "noop" : "file-writeback";
    case "transient": return opts.implicit ? "noop" : "settle";
    default: return assertNever(home);
  }
}

/** 导出/标题/建议名的展示基名（不是身份！只是给人看的字符串）。
 *  file 家 = 文件 stem（去扩展名）；gallery 家 = 库裸名（自带夹前缀）；transient/无家 = fallback。 */
export function homeDisplayName(home: Readonly<DocHome> | null, fallback: string): string {
  if (!home) return fallback;
  switch (home.kind) {
    case "gallery": return home.path || fallback;
    case "file": return home.fileName.replace(/\.[^.]+$/, "") || fallback;
    case "transient": return fallback;
    default: return assertNever(home);
  }
}
