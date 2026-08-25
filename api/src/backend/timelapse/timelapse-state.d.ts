import type { TimelapseSettings } from "./timelapse-core.ts";
import { TimelapseSampler } from "./timelapse-core.ts";
import type { TimelapseSample } from "./timelapse-mux.ts";
export interface TimelapseJsonV1 {
    v: 1;
    on: boolean;
    aspect: [number, number];
    longEdge: number;
    n: number;
    motionSamples: number;
}
export type TimelapseRestoreIssue = "corrupt-json" | "corrupt-mp4" | "mp4-missing" | "sample-count-mismatch";
/**
 * 一份文档的录制态。生命周期：
 *   无录像 → startRecording(settings) → (pause/resume)* → clear() 回到无录像
 * 保存：serializeForSave()——冻结（off）时原字节 passthrough，活跃时由调用方先喂 tail 再 mux。
 */
export declare class TimelapseDocState {
    /** 录像存在与否 = settings 非 null（开过录才有 pin 的取景框）。 */
    settings: TimelapseSettings | null;
    on: boolean;
    sampler: TimelapseSampler | null;
    motion: TimelapseSample[];
    avcC: Uint8Array | null;
    /** 上次落盘的完整 mp4（冻结 passthrough 用；活跃 re-mux 后刷新）。 */
    lastMp4: Uint8Array | null;
    /** 回读出过什么问题（报 warning 级 badge 用；null=健康）。 */
    restoreIssue: TimelapseRestoreIssue | null;
    /** 检疫区（护栏 E，2026-08-25 user 拍板「作废不删证据」）：回读失败时原字节收容于此，
     *  保存时原样 passthrough 回 ora——绝不因为读不懂就把 entry 从文件里抹掉。
     *  出所：startRecording（用户明确开新录）或 clear（用户明确清除）。 */
    quarantineJson: string | null;
    quarantineMp4: Uint8Array | null;
    /** motion 里已经进过 lastMp4 的前缀长度（「待保存帧数」= motion.length - 这个；冻结保存不动它）。 */
    savedMotionCount: number;
    /** 开录：pin 取景框。已有录像时不准换设置（要换=先 clear，UI 负责引导）。
     *  用户明确开新录 = 检疫字节出所（旧的读不懂的 entry 被新录像取代）。 */
    startRecording(s: TimelapseSettings): void;
    pause(): void;
    /** 重开（跨断片续录；调用方负责让 M 编码器下一帧出 IDR）。 */
    resume(): void;
    /** 清除录像（UI 已做 inline 二次确认；不可 undo）。 */
    clear(): void;
    /** 录制中收到一个有可见变化的 commit：返回要不要采这帧。 */
    noteCommit(nowMs: number): boolean;
    pushMotionSample(s: TimelapseSample, avcC?: Uint8Array | null): void;
    /** 自上次 mux 后有没有新东西（活跃期恒真——尾帧每次保存都要刷新）。 */
    get active(): boolean;
    /**
     * 保存路径拿 ora entry 字节：
     *   冻结（off / 尾帧无法生成）→ 原字节 passthrough（spec §3：暂停=录像整体冻结，不刷尾帧）；
     *   活跃 → 调用方现编 tail 传进来，整体 re-mux。
     * 返回 null = 本文档无录像（不写 entry）。
     */
    serializeForSave(tail: TimelapseSample | null, frameW: number, frameH: number): {
        json: string;
        mp4: Uint8Array;
    } | null;
    toJson(sampleCount: number): string;
    /**
     * 从 ora 回读。失败自愈原则（2026-08-25 护栏批改版，user 拍板「作废不删证据+雷也修」）：
     *   - corrupt-json / corrupt-mp4：读不懂 → 原字节进检疫区（保存时 passthrough，不销毁），录像停。
     *   - mp4-missing：json 健康只是素材没了 → **设置与开关保命**，从零继续录（不再连坐作废）。
     *   - sample-count-mismatch：json 数字领先 mp4 → 按 mp4 实际样本数截断继续用（不再整段作废）。
     * 绝不 throw。mp4Bytes=null 表示 entry 缺席。
     */
    static restore(json: string | null, mp4Bytes: Uint8Array | null): TimelapseDocState;
    /** 当前录像字节数（UX 显示；数据层裸字节，显示层才 KiB/MiB）。 */
    get byteSize(): number;
}
