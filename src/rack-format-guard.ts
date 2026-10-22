// 笔架 collection 的格式咽喉（家族格式版本纪律 F-69，家族根 ai-docs/20261021-format-version-discipline.md；形状抄 JRB
//   `src/format/migrate/` 的「collection 逐条目带拍」）。created 2026-10-21 by Claude Opus 5.5
//
// 笔架 = 一个 collection（挂库 = store 的 "brush-rack"，跨设备同步；无库 = device-rack-slot）：每支笔一条 + 一条 `.meta`。
//   两种条目各是一个子结构（backend/format/migrate.ts 的 brush / rackMeta），拍子 = 条目 JSON 顶层的 version / minor / patch。
// 本模块包在 RackPersistence 外面，app-store 建 collection 时套上——笔架控制器、图库种子拷贝看到的都是包过的面：
//   · 读（entries / getItem）：major 比本版新的条目**不出现**（不显示、不能选、不参与排序）；更老的 major 走 STEPS 升到本版（今天空表）。
//     minor / patch 比本版新的照常出现——笔向来整支浅拷贝着改（`{ ...b, folder }`），未知字段天然活着；`.meta` 的纯函数 `...meta` 保住未知键。
//   · 写（setItem）：盖本版拍（写入器只写当前拍）。目标 id 在库里是 major 更新的条目 → **不写**（只记黑匣子）：
//     能撞上的只有「还原出厂笔」重写 default-* 这一条路，宁可那支不还原，也不拿旧形状盖掉更新版本写的笔。
//   · 删（deleteItem）：同上，major 更新的条目不删（用户看不到它，本来也点不到）。
//   · 告诉用户：笔架里第一次见到 major 更新 / minor 更新的条目，各说一次（本次运行内；通知条由 app 注入）。
// 出厂笔的种子（brushes.ts builtinBrushInitData）走 collection 自己的 getInitData、不经过这里——它在那边自己盖拍。
import { migrate, readStamp, judge, stampFields, FormatTooNewError, type JsonComponent } from "./backend/format/migrate.ts";
import type { RackPersistence, RackEntry } from "./brush-rack-controller.ts";
import { RACK_META_ID } from "./brushes.ts";
import { reportError } from "./error-badge.ts";

export type RackFormatNews = "too-new" | "newer-minor";

const componentOf = (id: string): JsonComponent => (id === RACK_META_ID ? "rackMeta" : "brush");
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

// ── 告诉用户（本次运行每类一次；sink 晚到就先攒着）──
let _sink: ((kind: RackFormatNews) => void) | null = null;
const _said = new Set<RackFormatNews>();
const _pending = new Set<RackFormatNews>();
export function configureRackFormatNotice(sink: (kind: RackFormatNews) => void): void {
  _sink = sink;
  for (const k of _pending) sink(k);
  _pending.clear();
}
function news(kind: RackFormatNews): void {
  if (_said.has(kind)) return;
  _said.add(kind);
  if (_sink) _sink(kind); else _pending.add(kind);
}

/** 一条条目的读法：null = major 比本版新（藏起来、不碰）；否则 = 升到本版 major 的值（非对象 / 损坏的原样给，控制器自己容错）。 */
function readEntry(id: string, value: unknown): { value: unknown } | null {
  if (!isObj(value)) return { value };
  const c = componentOf(id);
  try {
    const r = migrate(c, value);
    if (r.verdict === "newer-minor") news("newer-minor");
    return { value: r.json };
  } catch (e) {
    if (e instanceof FormatTooNewError) { news("too-new"); return null; }
    throw e;
  }
}
function isTooNewInStore(inner: RackPersistence, id: string): boolean {
  const cur = inner.getItem<unknown>(id);
  return isObj(cur) && judge(componentOf(id), readStamp(componentOf(id), cur)) === "too-new";
}

export function guardRackFormat(inner: RackPersistence): RackPersistence {
  const guarded: RackPersistence = {
    init: () => inner.init(),
    entries(): RackEntry[] {
      const out: RackEntry[] = [];
      for (const e of inner.entries()) {
        const r = readEntry(e.id, e.value);
        if (r) out.push(r.value === e.value ? e : { ...e, value: r.value });
      }
      return out;
    },
    getItem<V>(id: string, def?: V | (() => V)): V | undefined {
      const raw = inner.getItem<V>(id);
      const r = raw === undefined ? null : readEntry(id, raw);
      if (r) return r.value as V;
      return typeof def === "function" ? (def as () => V)() : def;
    },
    setItem(id: string, value: unknown): void {
      // 值本身是更新 major（只可能来自导入；brushFromJSON 已先拒）→ 不写：盖本版拍写进去 = 把更新格式伪装成本版。
      if (isObj(value) && judge(componentOf(id), readStamp(componentOf(id), value)) === "too-new") {
        reportError(new Error(`[rack-format] not writing ${id}: the value is a newer major than this app (stamping it down would be a disguised downgrade)`), "log");
        return;
      }
      if (isTooNewInStore(inner, id)) {
        reportError(new Error(`[rack-format] not overwriting ${id}: stored entry is a newer major than this app`), "log");
        return;
      }
      inner.setItem(id, isObj(value) ? { ...value, ...stampFields(componentOf(id)) } : value);
    },
    deleteItem(id: string): void {
      if (isTooNewInStore(inner, id)) {
        reportError(new Error(`[rack-format] not deleting ${id}: stored entry is a newer major than this app`), "log");
        return;
      }
      inner.deleteItem(id);
    },
    onChange: (cb) => inner.onChange(cb),
    flushLocal: () => inner.flushLocal(),
  };
  // reconcileWithRemote 可缺席（无库器官没有远端）——缺的能力就是接口上的缺席，包一层也不能装出来。
  if (inner.reconcileWithRemote) guarded.reconcileWithRemote = () => inner.reconcileWithRemote!();
  return guarded;
}
