// encryption 器官 —— app 的内容加密单例（@internal/encryption 实例；2026-08-28 立户收货）。
// created 2026-08-28 by Claude Fable 5.
//
// **无库也活着**（无地全功能：加密 .ora 的探测/解密不依赖任何 backend——旧 store.encryption 面时代
//   null-store 谎报「不加密」的静默错路就此根治）。store 经 config.encryption 收的是**同一实例**
//   （EncryptionPort 依赖倒置；codec = vendored zip.js + 7z-wasm，惰性加载不拖 boot）。
import { createEncryption } from "@internal/encryption";
import { zipPack, zipUnpack } from "./backend/zip.ts";
import { pack7z, unpack7z } from "./sevenzip.ts";
import { reportError } from "./error-badge.ts";

export const appEncryption = createEncryption({
  codec: { zipPack, zipUnpack, pack7z, unpack7z },
  reportError: (e) => reportError(e instanceof Error ? e : new Error(String(e)), "log"),   // 探测容错路径=良性
});
