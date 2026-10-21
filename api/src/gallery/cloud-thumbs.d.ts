export declare const SUFFIX_BYTES = 81920;
export declare const THUMB_PATH = "Thumbnails/thumbnail.png";
/**
 * 拉一个 ora 的 thumbnail 字节：明文 → entry 原始字节 Blob（无 type）；加密 → 密文 peek Blob(type=ENC_PEEK_MIME)。
 * 不带 cache / retry / 限流（caller 负责）。gallery 0.8.5 ThumbCache 契约：**null = 到达了但确定没有**（entry 不存在 / 文件不在云端；
 * 包层进缓存、卡片显占位）；**抛 = 够不着**（provider 网络失败 reject；包层不缓存、云端-only 的卡显示云）。store getPeek 的 null / 抛
 * 正是这两种语义，原样透传（WXHW gallery-host 同形）。
 * @param identifier store 身份（全名 X.ora；gallery 0.6.0 起包递的就是它）
 * @param source 库 getPeek 必填透传（0.3.0 契约，caller 决定看哪一版）：
 *   "local" = 本地字节优先、无本地才落云端（本地态 thumb）；
 *   "cloud" = 只看云端 byte-range，离线/无云 → null（=抛）——**绝不静默落回本地**
 *     （newer-on-cloud 刷新用；落回本地就会重现「新 token 配旧字节」的假新鲜缓存）。
 */
export declare function fetchOraThumbnail(identifier: string, source: "local" | "cloud"): Promise<Blob | null>;
