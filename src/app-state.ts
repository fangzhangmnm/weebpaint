// 职责（单一）：app-state = **跨文件持久态**（非 per-document、非 user-preference）——当前目录 /
//   Blender 端点 / 密码 sentinel。synced-app-state collection 的**注入点 + DEFAULTS SSoT + struct 门面**。
//   （local-app-state 已全灭 2026-08-28 清零轮：current-file/restore-attempt 真相=resume-slate 回执条，
//   播种读腿随 {local:true} 退役——user 拍板宣发前删干净。）
//
// 用起来像 struct：`appState.currentDirectory = "x"`; `const d = appState.currentDirectory`。
//   **冷字段（当前全部）**：getter 直读 collection、setter 直写 collection——**不落 app-state RAM**
//     （与 app-prefs「直读」一致；collection 自带内存镜像 + 防抖持久化 + init 后台对齐云端）。
//   **热字段（本轮无）**：才持内存，`pushHotToPersistent()` 显式写 collection、`pullFromPersistent()` 云对齐后覆盖。
//   除各字段外，struct 只有 `pushHotToPersistent()` / `pullFromPersistent()` 两个方法（序列化持久化用），无任何应用逻辑。
//
// ⚠**刻意不 import app-store**（防成环，同 app-prefs）：collection 由 app-store 建好后惰性注入（wireAppState）；
//   注入前读返 DEFAULTS（boot 安全）。boot 门 `await initAppState()`（内部 hydrate 快、离线 OK）。
import type { Collection } from "./app-store.ts";   // B2：类型经接缝转口（type-only 擦除，无运行时环）

// ── DEFAULTS SSoT（唯一处；getItem 缺省从这里取，别处不 inline）───────────────────────────
export const APP_STATE_DEFAULTS = {
  // 跨设备（synced-app-state）：跟人/identity 走的跨文件持久态
  "current-directory": "" as string,          // 上次所在图库文件夹（Cold）
  "blender-panel-url": "" as string,          // Blender 同步远端 URL（2026-07-14 决策：全账号同步，tailscale 稳定端点）（Cold）
  // 图库密码验证器 sentinel（v0.4.11，真机 2.3）：{v,salt,iv,ct} | null。**跟账号走**（synced）——
  //   重装/换设备后仍知道「图库已有密码」，创建流程变输入校验。语义见 password-verifier.ts。
  "gallery-password-verifier": null as { v: 1; salt: string; iv: string; ct: string } | null,
} as const;
export type AppStateKey = keyof typeof APP_STATE_DEFAULTS;

// ── collection 注入 + boot 门 ────────────────────────────────────────────────────────────
let _synced: Collection | undefined;

// app-store 唯一调：接入 synced-app-state。undefined = kind:none（无库）。
export function wireAppState(synced: Collection | undefined): void { _synced = synced; }
// boot 门：hydrate collection（init 内部先 hydrate 本地再后台对齐云端）。快、离线 OK。
export function initAppState(): Promise<void> {
  return _synced?.init() ?? Promise.resolve();
}

// 导航前屏障（v417）：冷字段 setter 只改内存 + 排 400ms 防抖写（collection.ts:169-172）。
//   页面被关/reload 时定时器随页面死 → currentFile 等于没写 → 下次冷启动开不回上次那张画。
//   app.ts 在 pagehide / visibilitychange:hidden 调（那两个是移动端唯一可靠的"要走了"信号）。
export function flushAppState(): Promise<void> {
  return (_synced?.flushLocal() ?? Promise.resolve()).then(() => undefined);
}

// 冷字段直读写助手：未注入前（boot 极早 / 测试）安全返 default / no-op。
const getC = <V>(c: Collection | undefined, k: AppStateKey): V =>
  (c ? c.getItem(k, APP_STATE_DEFAULTS[k]) : APP_STATE_DEFAULTS[k]) as V;
const setC = (c: Collection | undefined, k: AppStateKey, v: unknown): void => { c?.setItem(k, v); };

// ── struct 门面：各字段 + pushHotToPersistent() + pullFromPersistent()（除此无它）──────────────
export const appState = {
  // ── 跨设备（synced-app-state）冷字段 ──
  get currentDirectory(): string { return getC<string>(_synced, "current-directory"); },
  set currentDirectory(v: string) { setC(_synced, "current-directory", v); },
  get blenderPanelUrl(): string { return getC<string>(_synced, "blender-panel-url"); },
  set blenderPanelUrl(v: string) { setC(_synced, "blender-panel-url", v); },
  get galleryPasswordVerifier(): { v: 1; salt: string; iv: string; ct: string } | null { return getC(_synced, "gallery-password-verifier"); },
  set galleryPasswordVerifier(v: { v: 1; salt: string; iv: string; ct: string } | null) { setC(_synced, "gallery-password-verifier", v); },
  // ── 序列化持久化相关（除字段外仅此二法，无应用逻辑）──
  // 热变量写 collection。本轮无热字段：冷字段 setter 已直写 collection → no-op。
  pushHotToPersistent(): void { /* 无热字段 */ },
  // await 云端对齐后，热变量用云值覆盖。冷字段 getter 本就直读最新 collection，无需覆盖——只 await 对齐。
  async pullFromPersistent(): Promise<void> {
    await (_synced?.reconcileWithRemote() ?? Promise.resolve());
  },
};
