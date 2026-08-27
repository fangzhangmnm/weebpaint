// boot.ts —— 应用启动编排（startup sequencing）。
//
// 从组合根 app.js 下沉的两段「业务式」异步启动流程（survey rec #3「让根只剩 import + new + initAll」）。
// 都是 fire-and-forget（不阻塞 UI 首帧），从冻结的 ctx 取依赖；纯 helper 自己 import。
//
// 红线：store 调用（_store.flow.load）verbatim 搬迁、一字未改——只 relocate，不碰同步机制。

import { t } from "./i18n/index.ts";
import { reportError } from "./error-badge.ts";
import { session } from "./session-state.ts";
import { readSlate, setRestoreAttempt, seedSlateFromLegacy } from "./resume-slate.ts";
import { restoreLastSession } from "./boot-restore.ts";
import { isDocLockedElsewhere } from "./instance-locks.ts";
import { isCloudEnabled } from "./cloud-capability.ts";
import { appState } from "./app-state.ts";   // P5：只读（回执条播种源）
import type { AppContext } from "./app-context.ts";

// 笔架 boot：collection.init（本地缓存 hydrate → 后台 reconcile 云端 + 新库 seed）→
//   toolStates 缺失字段从 rack 补齐 → 应用当前 tool 的 state。云端 pull 由 collection.onChange
//   自动刷（controller 内订阅）；不再有 IDB 迁移 / defaults retro-merge / 云图标态机。
export function initRackBoot(ctx: AppContext) {
  const { rack, state, editMode, setStatus } = ctx;
  const backfillToolStates = () => {
    for (const tk of Object.keys(state.toolStates)) {
      if (state.toolStates[tk].activeBrushId == null) Object.assign(state.toolStates[tk], rack.defaultToolStateFor(tk));
    }
  };
  rack.load().then(() => {
    backfillToolStates();
    rack.applyToolState(editMode.current());
  }).catch((e: unknown) => {
    reportError(new Error("[brush-rack] init failed: " + String(e)), "log");
    setStatus(t("mi.rackPersistFailed"), true);
  });
}

// 三态启动恢复（P1.5 拍板；P5 起持久层 = resume-slate 回执条）：
//   首次→新画布 / 上次图库→图库 / 上次的画→自动恢复（失败保留 opened 不清，下次冷启动能 retry）。
// ⚠ 调用方仍先 `await prefsReady`（app.ts）：**只为播种**（legacy collection 键 → 回执条，幂等一次）；
//   播种期过后（存量设备都升上来）可拆此时序依赖——回执条本身是同步读。
export async function bootRestoreSession(ctx: AppContext) {
  const { setGalleryOpen, updateSaveStatus, setStatus } = ctx;
  // P5 播种（幂等）：legacy 的 appState.currentFile（三态字符串）+ restoreAttempt → 回执条。
  //   此后 slate 是唯一真相；legacy 键停写只读（collection 里的值从此只出不进）。
  try { seedSlateFromLegacy({ currentFile: appState.currentFile, restoreAttempt: appState.restoreAttempt }); }
  catch (e) { reportError(new Error("[boot] slate seeding failed (fresh-boot fallback): " + String(e)), "log"); }
  // 编排本身在 boot-restore.ts（零 app 依赖 → 可测）。这里只接线。
  await restoreLastSession({
    getResume: () => readSlate().opened,
    restore: (name) => session.restore(name),
    setNameMemoryOnly: (name) => session.setName(name, { persist: false }),   // 幽灵路径纪律：不动持久的 currentFile
    openGallery: async () => { await setGalleryOpen(true); },
    updateSaveStatus,
    onOpened: (name) => setStatus(t("ss.opened", { name })),
    onNotFound: (name) => setStatus(t("mi.lastNotFound", { name })),
    // 崩溃环断路器（纪律③）：P5 起标记住回执条（同步单键写=天然落盘，flushMarker 舞蹈退役）。
    getRestoreAttempt: () => readSlate().restoreAttempt,
    setRestoreAttempt: (name) => setRestoreAttempt(name),
    onCrashLoopSkipped: (name) => setStatus(t("mi.restoreCrashLoop", { name }), true),
    // 双实例互认（2026-08-21）：boot 期少打扰——status 提示，不弹 sheet（openItem 入口才弹确认）。
    isDocLockedElsewhere: (name) => isDocLockedElsewhere(name),
    onLockedElsewhere: (name) => setStatus(t("mi.restoreLockedElsewhere", { name }), true),
    // 云端功能开关（2026-08-21，cloud-capability 接缝）：关 = 不自动恢复 + 不开图库，
    //   停在 boot 的空白画布（app.ts 出生即 backend.blank 2048²；gallery overlay 默认 hidden，
    //   这里只补一句 status 说明为什么没开上次的画）。currentFile/标记零变更（关→开自愈）。
    isCloudEnabled: () => isCloudEnabled(),
    // P2（2026-08-26）：云关落点 = transient 家新画布（此前 home:null 裸奔：Ctrl+S 死路、崩溃全丢）。
    //   settle 安家仪式 / T-crash 盲快照 / 三键挽留 随 transient 家生效（user 拍板「关gallery进
    //   local first则要么双击打开进文件要么新画布」）。
    openBlankCanvas: async () => { session.beginTransientBlank(); },
    onCloudOff: () => setStatus(t("mi.bootCloudOff")),
    // P1.5：云开态画布落点 = lazyblank 可画新画布（session 自管日期身份，首笔自动安家）。
    openFreshCanvas: async () => { session.beginLazyBlank(); },
  });
}
