// app-state struct 门面：冷字段直读写 collection（不落 RAM）+ 默认 + 类型强制 + push/pull。
import { test, eq, assert } from "./runner.mjs";
import { createStore } from "@internal/store";
import { createMockProvider } from "@internal/store/testing";
import { createMockEncryption } from "@internal/store/testing";
import { createMockLocal } from "@internal/store/testing";
import { wireAppState, initAppState, appState } from "../src/app-state.ts";

const dumpKv = () => { const m = new Map(); return { get: (k) => (m.has(k) ? m.get(k) : null), set: (k, v) => m.set(k, String(v)), remove: (k) => m.delete(k), keys: () => [...m.keys()] }; };
const UI = { busy: (_l, fn) => fn(), resolveConflict: async () => ({ choice: "cancel" }), reportError: () => {} };
const mkStore = () => createStore({ encryption: createMockEncryption(), appId: "wp", persistence: "none", provider: createMockProvider(), ui: UI, validateAdopt: () => true, kv: dumpKv(), local: createMockLocal(), fileName: (n) => n, isOnline: () => true, signedIn: () => true, skipMigration: true });

test("[app-state] struct 冷字段直读写 collection（不落 RAM）+ 默认 + 类型强制", async () => {
  const store = mkStore();
  const synced = store.collection("synced-app-state");
  wireAppState(synced);
  await initAppState();

  // 默认（DEFAULTS SSoT）
  eq(appState.currentDirectory, "", "默认 current-directory=空串");
  eq(appState.blenderPanelUrl, "", "默认 blenderPanelUrl=空串");

  // set/get 往返
  appState.currentDirectory = "folder/a";
  eq(appState.currentDirectory, "folder/a", "current-directory 往返");
  appState.blenderPanelUrl = "http://ts.local:9999";
  eq(appState.blenderPanelUrl, "http://ts.local:9999", "blenderPanelUrl（synced）往返");

  // 冷字段直写 collection（不落 app-state RAM）：直读底层 collection 应见同值
  eq(synced.getItem("current-directory", "?"), "folder/a", "直写落 synced collection（无 RAM 缓存）");
  eq(appState.blenderPanelUrl === synced.getItem("blender-panel-url", "?"), true, "blenderPanelUrl 落 synced-app-state");

  // ★ 播种纪元退役（2026-08-28 清零轮）：current-file/restore-attempt 真相 = resume-slate 回执条，
  //   local-app-state 全灭——struct 不再有这两个字段（编译期保证），synced 也永不见它们。
  eq(typeof appState.currentFile, "undefined", "current-file 字段已删（回执条是唯一真相）");
  eq(synced.getItem("current-file", "MISSING"), "MISSING", "★ synced 永不见 current-file");
  eq(typeof appState.lastSessionSignedIn, "undefined", "lastSessionSignedIn 已删");

  // 除字段外仅两方法：pushHot no-op、pullFrom 不抛
  appState.pushHotToPersistent();
  await appState.pullFromPersistent();
  eq(appState.currentDirectory, "folder/a", "pull 后冷字段仍直读 collection 最新值");
});
