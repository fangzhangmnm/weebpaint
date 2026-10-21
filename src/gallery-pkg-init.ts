// @internal/gallery 的宿主注入（2026-09-10 收货）：本机 KV（resume-slate / diag-log 在包里，包永不直碰 localStorage）+ 文案（包内 key 是从本仓 strings.ts 抄的，这里接回 SSoT）。
// app.ts 第一行 import，任何包模块读 KV 之前生效。
import { configureDeviceKv, configureText, configureGalleryRegistry } from "@internal/gallery";
import { deviceKvGet, deviceKvSet } from "./device-kv.ts";
import { t, lang } from "./i18n/index.ts";
import { S } from "./i18n/strings.ts";
configureDeviceKv({ get: (k) => deviceKvGet(k), set: (k, v) => deviceKvSet(k, v) });
// gallery 0.8.7：registry（这台设备的图库名册，device-local、永不同步）的库名归宿主——用本仓既有的 GUID 字面量 = 存量零迁移
//   （周账 F-58 §8-2，user 10-21「可以」；总账 #93）。必须在第一次开库之前配，所以住这里（app.ts 第一个 import）。
configureGalleryRegistry({ dbName: "weebpaint-bd6cece69075d759.gallery-registry" });
const L = lang();
configureText({ lang: L === "en" ? "en" : L === "ja" ? "ja" : "zh", t: (key, params) => (key in S ? t(key as keyof typeof S, params) : undefined) });
