import type { CheckpointRecord } from "./checkpoint-policy.ts";
export declare function getThumb(key: string): Promise<unknown>;
export declare function setThumb(key: string, value: unknown): Promise<void>;
export declare function deleteThumb(key: string): Promise<void>;
export declare function clearThumbs(): Promise<number>;
export declare function getImageThumb(key: string): Promise<unknown>;
export declare function setImageThumb(key: string, value: unknown): Promise<void>;
export declare function deleteImageThumb(key: string): Promise<void>;
export declare function clearImageThumbs(): Promise<number>;
export declare function getCheckpoint(key: string): Promise<CheckpointRecord | null>;
export declare function putCheckpoint(key: string, rec: CheckpointRecord): Promise<void>;
export declare function deleteCheckpoint(key: string): Promise<void>;
import type { CheckpointTrigger, RingEntryMeta } from "./checkpoint-policy.ts";
export interface RingRecord extends RingEntryMeta {
    bytes: Blob;
}
export declare function mintRingId(at: number): string;
export declare function ringPut(rec: RingRecord): Promise<void>;
export declare function ringGet(id: string): Promise<RingRecord | null>;
/** 全 ring meta（不含 bytes 字段本身仍在记录里，但 Blob 是惰性引用——遍历 meta 不搬字节）。 */
export declare function ringAll(): Promise<RingRecord[]>;
export declare function ringDelete(ids: string[]): Promise<void>;
/** 按 docKey 清整份 ring（改名/删除作品、file 家正常关闭随行李牌焚）。 */
export declare function ringDeleteByDoc(docKey: string): Promise<void>;
export { type CheckpointTrigger as RingTrigger };
