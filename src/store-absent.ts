// store-absent —— 平台缺席探针 + 内存 collection 器官（2026-08-27 替身大清洗后的残余职责）。
//
// 历史：v0.8.7 起这里住着 createNullStore/createDormantAuth——给「随地引用全局 store」的代码垫的
//   结构镜像替身。2026-08-27 user 拍板 ambient store 退役（「依赖整理好」）：app-store 接缝改出
//   requireStore()/galleryBackend() 两口，消费点逐个表态，替身**物理退役**（每个 benign no-op 都是
//   一个没被迫回答的问题；无库加密探测谎报即其现行犯）。本文件只剩两个诚实职责：
//   - detectStoreAbsent()：平台探针「持久化器官被没收」（file:// Safari / ?nostore / env）→ kind:"none"
//     且 attach 永久禁用（能力位，与运行态「现在没挂库」正交但合流同一 GalleryBackend）。
//   - createMemoryCollection()：无库笔架的**合法器官**（builtin 种子、session 内可编辑、reload 失）——
//     显式选择（app-store._wireCollections kind:none 分支），不再是替身的副作用。
// ⚠ 本文件是接缝级（与 app-store.ts 同级），只准 import store 的**类型**——零 store 运行时代码、零 IDB。
import { APP_NS } from "./config.ts";   // 自家前缀 token（叶子，零依赖）


/** 为什么没有存储：dev-switch = 开发开关（?nostore / 本机开关键 / 测试 env）；storage-blocked = 浏览器不给存（Safari 双击打开等，
 *  一碰就 SecurityError）；null = 在场。2026-11-03 起分开说（家族工单 B2，Claude Opus 5.5）：只有 storage-blocked 才说
 *  「这个浏览器没测过……」那句（src/site-hint.ts），开发开关不该吓人。 */
export type StoreAbsentReason = "dev-switch" | "storage-blocked" | null;

// 开关键 / 探针键带自家前缀（家族规则书 §1 第 3 条；2026-11-03 由裸名 weebpaint.nostore / weebpaint.storage-probe 改来，零迁移——
//   开发开关键要手动重设一次；裸名还撞在 store 自己的 `weebpaint.` 命名空间里）。
export const NOSTORE_KEY = `${APP_NS}.nostore`;
const PROBE_KEY = `${APP_NS}.storage-probe`;

export function detectStoreAbsentReason(): StoreAbsentReason {
  try {
    // node 子进程 boot smoke（test/nostore-boot-child.mjs）经 env 开缺席模式（浏览器不认 env）。
    const env = (globalThis as { process?: { env?: Record<string, string> } }).process?.env;
    if (env?.WEEBPAINT_NOSTORE === "1") return "dev-switch";
    if (typeof location !== "undefined" && new URLSearchParams(location.search).has("nostore")) return "dev-switch";
    if (typeof localStorage !== "undefined" && localStorage.getItem(NOSTORE_KEY) === "1") return "dev-switch";
  } catch { /* 环境无 location/localStorage（node）→ 视为在场（测试显式建 null store） */ }
  // P6 无地探针（survey §5.1：Safari file:// 裸存储访问 = SecurityError；旧私隐模式 setItem 必炸）：
  //   平台把持久化器官没收 → 缺席模式（Editor Only 纯内存），**不白屏**（0825 已知失败 §3.5 的降级路径）。
  //   注意方向与上面相反：上面 catch=视为在场（node 无 DOM），这里 probe 真炸=确证器官没收 → 缺席。
  if (typeof localStorage !== "undefined") {
    try {
      localStorage.setItem(PROBE_KEY, "1");
      localStorage.removeItem(PROBE_KEY);
    } catch { return "storage-blocked"; }
  }
  return null;
}
export function detectStoreAbsent(): boolean { return detectStoreAbsentReason() != null; }
// （createMemoryCollection 已退役 2026-08-28 A2 终案：无库笔架改 device-rack-slot 器官（IDB 单槽，
//   reload 不丢）；「memory collection 当无库容器」与「memory/兜底 store」同案否决——
//   store/collection 是同步引擎的词汇，不做容器。本文件从此只剩平台探针。）
