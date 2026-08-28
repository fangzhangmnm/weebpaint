// gallery-attachment.ts —— P3 挂载器官（纯核心，deps 注入，node 可测；浏览器装配 = gallery-attachment-host.ts）。
// created 2026-08-27 by Claude Fable 5. 契约 = ai-docs/20260827-p3-gallery-multiinstance-grill-verdicts.md §3。
//
// 「当前 gallery」是 **tab 级**真状态（0825 拍板：双 tab 双库合法）；cloud-enabled toggle 的继任者
//   （P5 §9.8：关云的真身 = detached，无库模式 = null-store）。
// detach 五步（0825 §4-P3）：收口开画（gate，调用方 UI 先安顿当前画）→ 停 watcher（UI 退订）→
//   drain in-flight → 绿灯门 dirty 扫 → 销毁。缓存默认保留；dirty>0 → 拒卸返账，UI 走逃生 sheet
//   （下载备份 / 仍要切换=forceDetach / 取消——verdicts §1.6）。
// forceDetach = 显式逃生：dispose({drain:false})，dirty 账留本机等回来补推（词典序第一条不破——
//   缓存永不驱逐 dirty；警告「浏览器可能清缓存」由 UI 承担，不在此层）。

import type { GalleryEntry, GalleryRegistry } from "./gallery-registry.ts";

export type AttachmentState =
  | { kind: "detached" }
  | { kind: "attached"; entry: GalleryEntry; online: boolean };   // online=false = 离线态（权限/token 掉，不算 logoff）

export type DetachResult =
  | { ok: true }
  | { ok: false; reason: "doc-open" }
  | { ok: false; reason: "dirty"; dirtyCount: number };

/** attach/detach 需要的全 Store 最小面（app-store seam 供真件；测试供假件）。 */
export interface SwappableStore {
  dispose(opts?: { drain?: boolean }): Promise<void>;
  files: { dirty: { count(): Promise<number> } };
}

export interface AttachmentDeps {
  storeAbsent: boolean;
  buildStore: (entry: GalleryEntry) => SwappableStore;          // 建新实例（不换当前）
  swap: (next: SwappableStore | null) => Promise<void>;         // 换当前 + 重灌 collections + 广播（app-store seam）
  registry: Pick<GalleryRegistry, "touch" | "relabel" | "clearLastActive">;
  hasOpenGalleryDoc: () => boolean;                             // 收口开画 gate（session.name gate 同源；host 晚绑，未绑=恒 true 保守拒卸）
  requestPersist: () => void;                                   // persist 三件套③：attach 手势时刻申请（fire-and-forget）
  setActiveGalleryId: (id: string | null) => void;              // 「当前库 id」唯一真相（active-gallery.ts：锁名/回执条/安家铸户口共用）
}

export interface GalleryAttachment {
  state(): AttachmentState;
  /** 挂库（必须 detached）。五步逆序：建实例→换入→锁域→touch/relabel。
   *  opts.online：folder=权限已 granted / onedrive=isSignedIn（调用方查好传入；缺省 true）。
   *  opts.gesture=false：boot 静默重挂——跳过 requestPersist（persist 只在用户手势申请，P3 verdicts）。
   *  （bootAdopt 已退役 2026-08-27：店懒出生后 boot 领养 = 普通 attach，无预建实例可领。） */
  attach(entry: GalleryEntry, opts?: { online?: boolean; gesture?: boolean }): Promise<void>;
  /** 卸库（绿灯门）。拒卸返账（doc-open / dirty），不销毁任何东西。detached 时幂等 ok。 */
  detach(): Promise<DetachResult>;
  /** 显式逃生（用户过了警告 sheet 才走到这）：不 drain、dirty 留缓存。 */
  forceDetach(): Promise<void>;
  onChange(cb: (s: AttachmentState) => void): () => void;
  /** 离线态翻牌（Slice C：权限/token 恢复或掉线时由 host 调；attached 外 no-op）。 */
  setOnline(v: boolean): void;
}

export function createGalleryAttachment(deps: AttachmentDeps): GalleryAttachment {
  let _state: AttachmentState = { kind: "detached" };
  let _current: SwappableStore | null = null;
  const _subs = new Set<(s: AttachmentState) => void>();
  const _notify = () => { for (const cb of _subs) { try { cb(_state); } catch { /* 订阅者的事故不拦器官 */ } } };

  const _teardown = async (drain: boolean): Promise<void> => {
    const old = _current;
    _current = null;
    if (old) await old.dispose({ drain });
    await deps.swap(null);                 // null-store = 无库模式（Editor Only）
    deps.setActiveGalleryId(null);
    await deps.registry.clearLastActive(); // boot 从此进无库模式（lastActive 全清）
    _state = { kind: "detached" };
    _notify();
  };

  return {
    state: () => _state,
    async attach(entry, opts) {
      if (deps.storeAbsent) throw new Error("store-absent mode: attach unavailable");
      if (_state.kind === "attached") throw new Error("attach while attached — detach first (green-gate)");
      if (opts?.gesture !== false) deps.requestPersist();   // 手势入口即调（popup/权限往返会耗尽 activation）；boot 静默不申请
      const next = deps.buildStore(entry);
      _current = next;
      await deps.swap(next);
      deps.setActiveGalleryId(entry.id);
      await deps.registry.touch(entry.id);
      if (entry.kind === "folder" && entry.handle?.name) await deps.registry.relabel(entry.id, entry.handle.name);   // 标签尽力自愈
      _state = { kind: "attached", entry, online: opts?.online ?? true };
      _notify();
    },
    async detach() {
      if (_state.kind === "detached") return { ok: true };      // 幂等
      if (deps.hasOpenGalleryDoc()) return { ok: false, reason: "doc-open" };   // 收口开画 gate
      const dirtyCount = await (_current as SwappableStore).files.dirty.count();  // 绿灯门（count()===0 为准，库契约）
      if (dirtyCount > 0) return { ok: false, reason: "dirty", dirtyCount };
      await _teardown(true);                                    // drain in-flight → 销毁；缓存保留
      return { ok: true };
    },
    async forceDetach() {
      if (_state.kind === "detached") return;
      await _teardown(false);                                   // 快拆：in-flight 响亮失败、dirty 账留缓存下次补推
    },
    onChange(cb) { _subs.add(cb); return () => _subs.delete(cb); },
    setOnline(v) {
      if (_state.kind !== "attached" || _state.online === v) return;
      _state = { kind: "attached", entry: _state.entry, online: v };
      _notify();
    },
  };
}
