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


export function detectStoreAbsent(): boolean {
  try {
    // node 子进程 boot smoke（test/nostore-boot-child.mjs）经 env 开缺席模式（浏览器不认 env）。
    const env = (globalThis as { process?: { env?: Record<string, string> } }).process?.env;
    if (env?.WEEBPAINT_NOSTORE === "1") return true;
    if (typeof location !== "undefined" && new URLSearchParams(location.search).has("nostore")) return true;
    if (typeof localStorage !== "undefined" && localStorage.getItem("weebpaint.nostore") === "1") return true;
  } catch { /* 环境无 location/localStorage（node）→ 视为在场（测试显式建 null store） */ }
  // P6 无地探针（survey §5.1：Safari file:// 裸存储访问 = SecurityError；旧私隐模式 setItem 必炸）：
  //   平台把持久化器官没收 → 缺席模式（Editor Only 纯内存），**不白屏**（0825 已知失败 §3.5 的降级路径）。
  //   注意方向与上面相反：上面 catch=视为在场（node 无 DOM），这里 probe 真炸=确证器官没收 → 缺席。
  if (typeof localStorage !== "undefined") {
    try {
      const k = "weebpaint.storage-probe";
      localStorage.setItem(k, "1");
      localStorage.removeItem(k);
    } catch { return true; }
  }
  return false;
}
// （createMemoryCollection 已退役 2026-08-28 A2 终案：无库笔架改 device-rack-slot 器官（IDB 单槽，
//   reload 不丢）；「memory collection 当无库容器」与「memory/兜底 store」同案否决——
//   store/collection 是同步引擎的词汇，不做容器。本文件从此只剩平台探针。）
