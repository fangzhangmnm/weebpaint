# cloudless 播种退役评估（`{local:true}` 清零工单）

> created 20260827 · by Claude Fable 5
> as-of v0.11.21 / 2026-08-27。工单出处 = store 仓 `ai-docs/20260827-store-round-2-agenda.md` 议题 3
> （store 删 cloudless 的前置 = WeebPaint 先清零 `{local:true}` 消费）+ 同仓 `20260827-deprecation-cloudless-collection.md`。

## 结论：播种期未到关点，本轮不动码

清零 = 退役两条 legacy 播种读腿。播种代码 v0.11.10（回执条）/ v0.11.11（device prefs）才进 dev，
**今天关会烧掉「从未 boot 过 0.11.11+ 的设备」的播种窗口**——其中包括全部 prod 渠道设备（prod = v0.10.33，
从未包含播种代码）。等待成本≈零（store 侧已标 deprecated 不再有新消费，死代码躺着无害），
按「持久化改动需同意」家规与数据安全词典序，关点留人类拍板。

## 现状消费图（grep 实测 as-of v0.11.21）

`{local:true}` 调用点全仓仅 `app-store.ts:121-122` 两处，喂两条播种读腿；**写面已全部迁离**
（device-kv / resume-slate，P5 落地）：

**链 A `local-user-preference`** → `seedDevicePrefsFromLegacy`（app-prefs.ts:104，幂等：device-kv 已有值不覆盖）
- `color-theme`、`cloud-enabled` 两键 → device-kv `pref:*`。
- 二级链：`pref:cloud-enabled` 又是 registry 播种源（cloud-capability.`cloudPrefEnabled` →
  registry.`seedLegacyOneDrive`，false → lastActive=null =「没挂库」）。
- 同函数另两键 `single-finger-draw` / `stylus-smooth-params` 的播种源是 **synced**-user-preference，
  与 `{local:true}` 无关，不受本工单影响（**手感调参安全**）。

**链 B `local-app-state`** → 两个 LEGACY 只读键
- `current-file` / `restore-attempt` → boot.ts:45 `seedSlateFromLegacy` → resume-slate 回执条（幂等：已有条不覆盖）。
- 上游还挂着 v438 老播种：`initAppState` 内 `_seedCurrentFileFromLegacy`（synced `"current-file"` →
  local collection）。链 = v438 synced → local → slate，退役时一起走。

## 关播种丢什么（只影响「从未 boot 过 0.11.11+ 的设备」；已播种设备的 device-kv 值不受任何影响）

- `color-theme` → 回落 "auto"，用户一次点击恢复。
- 曾设 `cloud-enabled=false` 的设备 → registry 播成「挂着库」，关云偏好复活（数据无损：同步全程 If-Match 红线）。
- 上次开着的画 / 崩溃环标记 → boot 落图库/新画布一次；断路器护跨升级崩溃环的窗口丢失（极窄）。
- **画作数据零影响**（云端/本地文件不经这两个 collection）。

## 两个门（都过了才算关点）

1. **自家设备门**：P5 播种 2026-08-27 才进 dev，真机批（`20260827-device-test-batch.md` 五场景）未跑——
   跑完真机批即达成（每台设备 boot 一次 ≥0.11.11 就播完了）。
2. **prod 门**：prod = v0.10.33 无播种代码。关点 = prod 升上 0.11.x（minor push prod 本身要 user 拍板）
   **且**存量 prod 设备（夏音等）升级后 boot 过一次。

## 关点到达后的执行清单（届时另开工单照做）

1. app-prefs.ts：`_LEGACY_HOME` 删 `color-theme`/`cloud-enabled` 两行、`_local` 全灭、`wirePreferences` 单参
   （synced 侧两键播种是否同退届时一并判——它不挡 store，可留）。
2. app-state.ts：删 `_local` collection、`current-file`/`restore-attempt` 两字段、`_seedCurrentFileFromLegacy`；`wireAppState` 单参。
3. boot.ts:45 播种调用 + resume-slate.ts `seedSlateFromLegacy` 一并删。
4. app-store.ts:121-122 → 只建 synced 两 collection。
5. 测试同步（test/app-prefs.test.mjs / test/app-state.test.mjs 的 local 变体用例）。
6. `grep -rn "local: true" src/` 归零 → **给 store 仓发清零信号**（store 侧照 deprecation 清单删 cloudless，
   exports 变更预计 minor + 审版门），WeebPaint 随后收货。
7. 顺手另拍：v438 synced 死键 `"current-file"`（synced-app-state 里躺着只写不读）删不删——跨设备数据，
   届时单独拍板（app-state.ts:57 原注）。

## 快通道（不推荐，列明供拍板）

user 若拍板「上列损失可弃」，可即刻清零不等两门——损失面已全部枚举，无隐藏项。不推荐：等待零成本，
烧掉的是真用户态（虽小）。
