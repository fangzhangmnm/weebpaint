// app-prefs.ts —— **preferences 门面**（P5 Slice B，2026-08-27；设计 = ai-docs/20260827-p5-settings-destore-proposal.md §9）。
// edited by Claude Fable 5.
//
// 六类分类学落地（preferences 半边）：**scope 是每个 key 的属性，门面只有一个**——
//   consumers 一律 `preferences.get/set(key)`，按 registry 的 scope 路由引擎：
//   · device  → device-kv（localStorage 同步读写；无地降级纯内存）——「跟机器走」（硬件/环境耦合）
//   · gallery → collection（现 = synced-user-preference；P3 起 per-gallery）——「跟身份/库走」
//   · session → RAM（不持久化，user 拍板 show-fps 专用档）
//   · ora     → desk（per-doc；Slice C 迁入，不经本门面）
// SSoT 拍板（§4/§7）：gallery 层 collection=持久层权威（LWW/防抖/reconcile 全归库）；device 层
//   device-kv 即真相（同步读 → 「注入前读返 DEFAULTS」的时序枷锁对 device 键消失）。
//
// ⚠ 仍刻意不 import app-store（防成环，同旧版）：gallery collection 由 app-store 惰性注入
//   （wirePreferences）；注入前 gallery 键读返 default（boot 安全）。
import type { Collection } from "./app-store.ts";   // type-only（构建期擦除，无运行时环）
import { deviceKvGetJson, deviceKvSetJson } from "./device-kv.ts";

// ── registry SSoT（唯一处）：def + scope。新键必答两问（换台机器该跟吗？换个人该跟吗？）──
export const PREF_REGISTRY = {
  // device（跟机器走：硬件/环境耦合。兄妹共用电脑模型 §9.1 重判过）
  "color-theme":          { scope: "device", def: "auto" as string },            // 环境耦合（OLED/暗房），一键可切
  "single-finger-draw":   { scope: "device", def: false as boolean },            // 硬件耦合：同人 iPad 开/台式关（VS Code machine-scope 先例）
  "stylus-smooth-params": { scope: "device", def: {} as Record<string, number> },// 数位板/笔硬件调参
  // gallery（跟身份/库走；P3 per-gallery，现 = synced collection）
  "lang":                 { scope: "gallery", def: null as string | null },
  "gen-ai":               { scope: "gallery", def: false as boolean },
  // #13 导出自定义水印（2026-08-28，宣发需要）：**跟身份走**——「我的签名」换台机器也该是同一个，
  //   不是硬件耦合。无库（无地）时经 §9.7 cascade 自动落 device 层，机制现成零改。
  //   (edited by Claude Opus 5)
  // （ora scope 三项 pixel-grid / long-press-pick / menu-tab 不在本表：per-doc 归 desk（Slice C），
  //   老的 collection 偏好按拍板不迁移——工厂默认起。）
  // session（不持久化；「不持久化档不设」的唯一例外 = show-fps，user 明允）
  "show-fps":             { scope: "session", def: false as boolean },
} as const;
export type PrefKey = keyof typeof PREF_REGISTRY;
type PrefValue<K extends PrefKey> = (typeof PREF_REGISTRY)[K]["def"];

// 兼容导出（少数测试/旧注释引用形状）：key → default 的平铺视图。
export const PREF_DEFAULTS = Object.fromEntries(
  Object.entries(PREF_REGISTRY).map(([k, v]) => [k, v.def]),
) as { [K in PrefKey]: PrefValue<K> };

// ── 引擎 ────────────────────────────────────────────────────────────────
let _synced: Collection | undefined;   // gallery 层引擎（P3 起=「当前 gallery 的 collection」——本门面是唯一改点）
const _session = new Map<string, unknown>();
const _dk = (k: string) => `pref:${k}`;

export function wirePreferences(synced: Collection | undefined): void {
  _synced = synced;     // undefined = kind:none（无库：gallery scope 经 cascade 落 device 层）
  _ready = undefined;   // P3 热插拔：换库重灌 → 重置 ready 门（下一次 initPreferences 对新 collection 重跑 init）
}
// P6：gallery 层在不在（P5 §9.7 cascade 的开关）。无库模式（null-store）时 gallery scope 读写全落
//   device 层——「无地用户的 lang 也有家」。app-store 在装配/换库时喂（本模块不 import app-store，防环）。
let _galleryLive = true;
export function setGalleryLayerLive(v: boolean): void { _galleryLive = v; }

let _ready: Promise<void> | undefined;
export function initPreferences(): Promise<void> {
  return (_ready ??= (_synced?.init() ?? Promise.resolve()).then(() => undefined));
}
export function preferencesReady(): Promise<void> { return _ready ?? Promise.resolve(); }
/** 导航前屏障（gallery 层；device 层同步写无需 flush）：写完就 reload/关页的路径必须 await。 */
export function flushPreferences(): Promise<void> {
  return (_synced?.flushLocal() ?? Promise.resolve()).then(() => undefined);
}
/** 前台/online 重拉云端（gallery 层 per-key LWW）。 */
export function refreshPreferences(): Promise<void> {
  return (_synced?.reconcileWithRemote() ?? Promise.resolve()).then(() => undefined);
}

// ── 唯一门面 ─────────────────────────────────────────────────────────────
export const preferences = {
  get<K extends PrefKey>(k: K): PrefValue<K> {
    const { scope, def } = PREF_REGISTRY[k];
    if (scope === "device") return deviceKvGetJson(_dk(k), def) as PrefValue<K>;
    if (scope === "session") return (_session.has(k) ? _session.get(k) : def) as PrefValue<K>;
    // gallery scope = P5 §9.7 cascade：gallery ?? device ?? 工厂默认（P6 真落地——P3 前恒有库没走过下半段）。
    //   gallery 层**有项**才算数（hydrate 前 getEntry=undefined → device 兜底，同旧约的 default 语义超集）；
    //   无库模式（_galleryLive=false）直接 device 层——无库改的设置真落盘，挂库后 gallery 层覆盖。
    if (_galleryLive && _synced) {
      const e = _synced.getEntry(k);          // CollectionEntry{id,uat,value} | undefined（墓碑=undefined）
      if (e !== undefined) return e.value as PrefValue<K>;
    }
    return deviceKvGetJson(_dk(k), def) as PrefValue<K>;
  },
  set<K extends PrefKey>(k: K, v: PrefValue<K>): void {
    const { scope } = PREF_REGISTRY[k];
    if (scope === "device") { deviceKvSetJson(_dk(k), v); return; }
    if (scope === "session") { _session.set(k, v); return; }
    if (_galleryLive && _synced) { _synced.setItem(k, v); return; }
    deviceKvSetJson(_dk(k), v);   // 无库：写落 device 层（P5 §9.7「无地用户的 lang 也有家」）
  },
  /** gallery 层云端变更回灌钩（device/session 层无远端，不经此）。 */
  onChange(cb: (changedIds: string[]) => void): () => void { return _synced?.onChange(cb) ?? (() => undefined); },
};
// （播种纪元退役 2026-08-28 清零轮：legacy collection→device-kv 的一次性播种已随 {local:true} 全灭——
//   user 拍板「宣发前删干净，不留 backward compatibility」。cloud-enabled 键同日死缓执行=物理删除。）
