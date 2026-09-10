// @internal/gallery 的宿主注入（2026-09-10 收货）：本机 KV（resume-slate / diag-log 在包里，包永不直碰 localStorage）+ 文案（包内 key 是从本仓 strings.ts 抄的，这里接回 SSoT）。
// app.ts 第一行 import，任何包模块读 KV 之前生效。
import { configureDeviceKv, configureText } from "@internal/gallery";
import { deviceKvGet, deviceKvSet } from "./device-kv.ts";
import { t, lang } from "./i18n/index.ts";
import { S } from "./i18n/strings.ts";
configureDeviceKv({ get: (k) => deviceKvGet(k), set: (k, v) => deviceKvSet(k, v) });
const L = lang();
configureText({ lang: L === "en" ? "en" : L === "ja" ? "ja" : "zh", t: (key, params) => (key in S ? t(key as keyof typeof S, params) : undefined) });
