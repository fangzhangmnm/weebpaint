// 持久化立宪（2026-09-29，user「weebpaint升级同意」；机制照 CatsUp 契约 §7）：
//   每个 JSON 子结构独立版本戳；迁移 = 纯函数，全住本文件夹；读取器链式升到当前版，写入器只写当前版；
//   比 app 新 → 拒（不降级不猜），由壳层决定怎么告诉用户。
// created 2026-09-29 by Claude Fable 5.1
//
// 子结构与它们的家：
//   desk       = .weebpaint/editor-state.json（workbench-state.ts 的 freshGroups 形状）     版本键 version
//   references = .weebpaint/references/manifest.json                                       归 @internal/reference-window 库自己迁移
//   timelapse  = .weebpaint/timelapse.json（TimelapseJsonV1）                               版本键 v（历史如此，写入器不改；2026-09-30 纳入，user「旧的数据当然要能救」）
//   布局本身   = stack.xml 的 weebpaint:format（ORA_FORMAT_VERSION），读端用 layout.ts 归一化，不走版本链
// 语料 = test/fixtures/format/（每发过一版冻结一份；只增不改）。

export const SUBSTRUCTURE_VERSIONS = {
  desk: 1,
  timelapse: 1,
} as const;
export type Substructure = keyof typeof SUBSTRUCTURE_VERSIONS;
/** 每个子结构的版本键。desk 用 version；timelapse 出生时就叫 v——改键名 = 现网版本读不了新文件，不值得，照旧。 */
const VERSION_KEY: { [K in Substructure]: string } = { desk: "version", timelapse: "v" };

export type MigrationStep = (json: Record<string, unknown>) => Record<string, unknown>;
/** STEPS[sub][fromVersion] = 升到 fromVersion+1 的纯函数。加迁移 = 在这里登记一条 + 冻结样本。 */
const STEPS: { [K in Substructure]?: Record<number, MigrationStep> } = {};

export class FormatTooNewError extends Error {
  readonly substructure: string;
  readonly fileVersion: number;
  readonly appVersion: number;
  constructor(substructure: string, fileVersion: number, appVersion: number) {
    super(`${substructure} version ${fileVersion} is newer than this app supports (${appVersion}); refusing to downgrade or guess`);
    this.name = "FormatTooNewError";
    this.substructure = substructure; this.fileVersion = fileVersion; this.appVersion = appVersion;
  }
}

/** 读到的子结构 JSON 从文件版本链式升到当前版；缺版本键视为 1（首版）。不是对象 → 原样返回（壳层按缺失处理）。 */
export function migrateSubstructure(sub: Substructure, json: unknown): unknown {
  if (!json || typeof json !== "object" || Array.isArray(json)) return json;
  const target = SUBSTRUCTURE_VERSIONS[sub];
  const key = VERSION_KEY[sub];
  let cur = json as Record<string, unknown>;
  const raw = cur[key];
  let v = typeof raw === "number" && Number.isFinite(raw) ? Math.trunc(raw) : 1;
  if (raw === undefined) cur = { ...cur, [key]: 1 };   // 缺键 = 首版：把戳补上，下游的形状检查不用再各自开例外
  if (v > target) throw new FormatTooNewError(sub, v, target);
  while (v < target) {
    const step = STEPS[sub]?.[v];
    if (!step) throw new Error(`migrate: no step registered for ${sub} v${v} → v${v + 1} (constitution violated)`);
    cur = step(cur);
    v++;
    if (cur[key] !== v) throw new Error(`migrate: step ${sub} v${v - 1}→v${v} did not set ${key}`);
  }
  return cur;
}
