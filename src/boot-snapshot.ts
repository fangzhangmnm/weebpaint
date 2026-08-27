// 职责（单一）：boot 期的 **localStorage 快照** —— P5（2026-08-27）起只剩一个键 `weebpaint.boot.lang`。
// （theme 键已退役：color-theme 的 SSoT 迁 device-kv（本身就是 localStorage 同步读）——「collection
//   SSoT + LS 快照」双源塌成一份，index.html guard 与运行时读同一个 device-kv 键。）
//
// 为什么必须存在（v409；别再当成"违反了无 localStorage 镜像"而删掉）：
//   lang 的 SSoT 是 gallery 层 collection（IDB，跟身份走）。但它在 IDB 就绪**之前**就要用：
//   · **lang** —— i18n 的 `t()` 在模块 eval 期就被读，`_lang` 一经解析即锁死（reload 制）。
//     v406-v408 靠 app.ts 的 TLA 门（`await initPreferences()`）保证 eval 期 lang 就绪；
//     有了快照就不需要那道门了（v409 拆掉，见 app.ts）。
//
// 纪律（三条，破一条就退化成双 SSoT）：
//   1. **单向只写**：SSoT 恒为 collection。快照只在 collection 值确定后被覆写，绝不反向喂回 collection。
//   2. **只读一次**：只在 boot 期（guard / eval 期 lang 解析）读。之后一律读 collection。
//   3. **只有这一个键**。别加第二个 —— device 层设置本就同步可读（device-kv）；gallery 层其余
//      设置的消费方 `await prefsReady` 拿真值即可（app.ts 的 fixup 相）。
//      每加一个键就多一份要对账的镜像，那正是 v406 想消灭的东西。
//
// 对账（collection hydrate/reconcile 之后，见 theme.ts / i18n）：先更新快照 → lang 不对就 reload、theme 不对就地换。
//   顺序不能反：先写快照再 reload，否则 reload 后 eval 期又读到旧快照 → 死循环。

// P5 收编（2026-08-27）：存储经 device-kv（cache: 前缀）——本模块曾是全 app 最后一个裸 localStorage
//   用户，按「零散字段只走抽象」家规收编；**缓存 vs 层**的纪律仍归本文件头（device-kv 只管搬运）。
//   legacy 键 weebpaint.boot.lang 只作升级兜底读（一次性；新写全走 cache: 键）。
import { deviceKvGet, deviceKvSet } from "./device-kv.ts";
const CACHE_KEY = "cache:boot-lang";
const LEGACY_LS_KEY = "weebpaint.boot.lang";
export type BootSnapshotKey = "lang";

// 读快照。无值 / localStorage 不可用（隐私模式、禁 cookie）→ null，调用方回落自己的 default。
export function readBootSnapshot(_k: BootSnapshotKey): string | null {
  const v = deviceKvGet(CACHE_KEY);
  if (v != null) return v;
  try { return localStorage.getItem(LEGACY_LS_KEY); } catch { return null; }   // 升级兜底（老快照还没迁）
}

// 写快照。传 null = 清（如 lang 回到"跟系统"）。存储不可用 → device-kv 内存降级（只丢跨刷新优化，不丢数据：SSoT 在 IDB）。
export function writeBootSnapshot(_k: BootSnapshotKey, v: string | null): void {
  deviceKvSet(CACHE_KEY, v == null || v === "" ? null : v);
  try { localStorage.removeItem(LEGACY_LS_KEY); } catch { /* 新键已写，旧键清扫失败无害 */ }
}
