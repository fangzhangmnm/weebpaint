// device-kv.ts —— device 层唯一 localStorage 入口（P5；拍板 = ai-docs/20260827-p5-settings-destore-proposal.md §9.7）。
// created 2026-08-27 by Claude Fable 5.
//
// 纪律：**全 app 禁裸 localStorage**（user 拍板「零散的小字段不碰裸 localstorage/idb，只走抽象的记录」）
//   ——device 层标量与小记录一律经本器官。例外：boot-snapshot.ts（lang 的 eval 期快照缓存，独立纪律，见该文件头）。
// 无地姿态：localStorage 在 file:// Safari / 隐私模式可抛 SecurityError → try/catch 降级**纯内存**
//   （survey §5.3；本 session 内行为完整，只是不跨刷新——无地拍板接受）。
// key 前缀带 GUID 命名空间（verdicts §2.9 同源：file:// 共桶防撞；纪律：永不碰非自己前缀的键）。

const PREFIX = "weebpaint-bd6cece69075d759:";

// 降级内存层：localStorage 不可用时的 session 级兜底（读写都走它，保证同 session 一致）。
const _mem = new Map<string, string>();
function _ls(): Storage | null {
  try {
    const ls = globalThis.localStorage;            // 访问器本身就可能抛（Safari file:// 等）
    ls.getItem(PREFIX + "__probe");                // 读一次探活
    return ls;
  } catch { return null; }
}

export function deviceKvGet(key: string): string | null {
  const k = PREFIX + key;
  const ls = _ls();
  if (ls) { try { return ls.getItem(k); } catch { /* 降级读内存 */ } }
  return _mem.get(k) ?? null;
}

/** v=null 删键。写失败（配额/隐私模式中途翻脸）→ 落内存层，绝不 throw（device 层是便利不是红线）。 */
export function deviceKvSet(key: string, v: string | null): void {
  const k = PREFIX + key;
  const ls = _ls();
  if (ls) {
    try {
      if (v == null) ls.removeItem(k); else ls.setItem(k, v);
      _mem.delete(k);                              // 真身写成 → 内存影子清掉（防陈旧遮蔽）
      return;
    } catch { /* 落内存层 */ }
  }
  if (v == null) _mem.delete(k); else _mem.set(k, v);
}

export function deviceKvGetJson<T>(key: string, fallback: T): T {
  const raw = deviceKvGet(key);
  if (raw == null) return fallback;
  try { return JSON.parse(raw) as T; } catch { return fallback; }
}
export function deviceKvSetJson(key: string, v: unknown): void {
  deviceKvSet(key, v == null ? null : JSON.stringify(v));
}
