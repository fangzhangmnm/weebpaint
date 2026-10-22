// Timelapse 文档级录制态（纯数据+编排，node 可测）。
// 持久化 = ora 内两个 entry（spec §5，consent 2026-08-19）：
//   timelapse.mp4            全部样本 mux 成的直接可播 mp4（中部大块区，thumbnail 保持最后）
//   .weebpaint/timelapse.json 录制状态（开关 sticky / pin 的取景框 / n / motionSamples）
// 自愈原则（spec §3）：任何回读失败 = 止损——录像作废、画照画、ora 照存，绝不 throw 出保存/加载路径。
import { migrate, splitExtra, stampFields, FormatTooNewError, FORMAT, type Verdict, type Stamp } from "../format/migrate.ts";
import type { TimelapseSettings } from "./timelapse-core.ts";
import { TIMELAPSE_LONG_EDGES, TIMELAPSE_ASPECTS, TimelapseSampler } from "./timelapse-core.ts";
import type { TimelapseSample } from "./timelapse-mux.ts";
import { muxTimelapse, demuxTimelapse } from "./timelapse-mux.ts";

export interface TimelapseJsonV1 {
  v: 1;                     // major（拍子 = v / minor / patch，backend/format/migrate.ts FORMAT.timelapse；写入器在 toJson 盖本版拍）
  on: boolean;              // sticky：跨 session 续录开关
  aspect: [number, number]; // pin 的比例（开录烤死）
  longEdge: number;         // pin 的最长边
  n: number;                // 累计 commit 计数（衰减 park 中仍持久化，复议时无缝续）
  motionSamples: number;    // mp4 里前多少个样本是运动帧（其余=尾帧，回读时截掉）
}

/** 本版认识的 timelapse.json 顶层键（拍子三键之外）。其余 = 更新的 minor 加的 → 直通袋原样带回。 */
export const KNOWN_TIMELAPSE_FIELDS: readonly string[] = ["on", "aspect", "longEdge", "n", "motionSamples"];

/** too-new = 清单是更新的 WeebPaint 写的（持久化立宪：不猜不降级，字节进检疫区原样带回；壳层说「新版本写的」而不是「损坏」）。 */
export type TimelapseRestoreIssue = "corrupt-json" | "corrupt-mp4" | "mp4-missing" | "sample-count-mismatch" | "too-new";

/**
 * 一份文档的录制态。生命周期：
 *   无录像 → startRecording(settings) → (pause/resume)* → clear() 回到无录像
 * 保存：serializeForSave()——冻结（off）时原字节 passthrough，活跃时由调用方先喂 tail 再 mux。
 */
export class TimelapseDocState {
  /** 录像存在与否 = settings 非 null（开过录才有 pin 的取景框）。 */
  settings: TimelapseSettings | null = null;
  on = false;
  sampler: TimelapseSampler | null = null;
  motion: TimelapseSample[] = [];
  avcC: Uint8Array | null = null;
  /** 上次落盘的完整 mp4（冻结 passthrough 用；活跃 re-mux 后刷新）。 */
  lastMp4: Uint8Array | null = null;
  /** 回读出过什么问题（报 warning 级 badge 用；null=健康）。 */
  restoreIssue: TimelapseRestoreIssue | null = null;
  /** 检疫区（护栏 E，2026-08-25 user 拍板「作废不删证据」）：回读失败时原字节收容于此，
   *  保存时原样 passthrough 回 ora——绝不因为读不懂就把 entry 从文件里抹掉。
   *  出所：startRecording（用户明确开新录）或 clear（用户明确清除）。 */
  quarantineJson: string | null = null;
  quarantineMp4: Uint8Array | null = null;
  /** motion 里已经进过 lastMp4 的前缀长度（「待保存帧数」= motion.length - 这个；冻结保存不动它）。 */
  savedMotionCount = 0;
  /** 直通袋：timelapse.json 里本版不认识的顶层键（更新的 minor 加的），toJson 先铺它再铺已知键。新开录 / 清除时清空。 */
  extra: Record<string, unknown> = {};
  /** 回读出的文件拍子判决（壳层：newer-minor → 告诉用户一次）。null = 没读过 / 读不懂。 */
  formatVerdict: Verdict | null = null;
  formatStamp: Stamp | null = null;

  /** 开录：pin 取景框。已有录像时不准换设置（要换=先 clear，UI 负责引导）。
   *  用户明确开新录 = 检疫字节出所（旧的读不懂的 entry 被新录像取代）。 */
  startRecording(s: TimelapseSettings): void {
    if (this.settings) throw new Error("timelapse already recording; clear() first");
    // 格式版本纪律（2026-10-21 审计）：检疫区里是更新版本写的录像 → 不许靠「开新录」把它顶掉（那是静默丢），得先显式 clear()（UI 有确认）。
    //   读不懂的损坏 json 照旧：开新录 = 出所（2026-08-25 护栏 E 的既定语义）。
    if (this.restoreIssue === "too-new") throw new Error("timelapse: the quarantined recording was written by a newer version; clear() it explicitly before starting a new one");
    if (!TIMELAPSE_LONG_EDGES.includes(s.longEdge)) throw new Error(`bad longEdge ${s.longEdge}`);
    if (!TIMELAPSE_ASPECTS.some(([w, h]) => w === s.aspectW && h === s.aspectH)) throw new Error("bad aspect");
    this.settings = { ...s };
    this.sampler = new TimelapseSampler(0);
    this.on = true;
    this.quarantineJson = null; this.quarantineMp4 = null; this.restoreIssue = null;
    this.extra = {};
  }

  pause(): void { this.on = false; }
  /** 重开（跨断片续录；调用方负责让 M 编码器下一帧出 IDR）。 */
  resume(): void { if (this.settings) this.on = true; }

  /** 清除录像（UI 已做 inline 二次确认；不可 undo）。 */
  clear(): void {
    this.settings = null; this.on = false; this.sampler = null;
    this.motion = []; this.avcC = null; this.lastMp4 = null; this.restoreIssue = null;
    this.savedMotionCount = 0;
    this.quarantineJson = null; this.quarantineMp4 = null;
    this.extra = {};
  }

  /** 录制中收到一个有可见变化的 commit：返回要不要采这帧。 */
  noteCommit(nowMs: number): boolean {
    if (!this.on || !this.sampler) return false;
    return this.sampler.noteCommit(nowMs);
  }

  pushMotionSample(s: TimelapseSample, avcC?: Uint8Array | null): void {
    if (avcC && !this.avcC) this.avcC = avcC;
    this.motion.push(s);
  }

  /** 自上次 mux 后有没有新东西（活跃期恒真——尾帧每次保存都要刷新）。 */
  get active(): boolean { return this.on && this.settings !== null; }

  /**
   * 保存路径拿 ora entry 字节：
   *   冻结（off / 尾帧无法生成）→ 原字节 passthrough（spec §3：暂停=录像整体冻结，不刷尾帧）；
   *   活跃 → 调用方现编 tail 传进来，整体 re-mux。
   * 返回 null = 本文档无录像（不写 entry）。
   */
  serializeForSave(tail: TimelapseSample | null, frameW: number, frameH: number):
      { json: string; mp4: Uint8Array } | null {
    if (!this.settings) {
      // 无录像。检疫区有货（回读失败的原字节）→ 原样 passthrough（护栏 E：作废不删证据）。
      if (this.quarantineJson != null) return { json: this.quarantineJson, mp4: this.quarantineMp4 ?? new Uint8Array(0) };
      return null;
    }
    let mp4 = this.lastMp4;
    if (this.on && tail && this.avcC) {
      mp4 = muxTimelapse(this.motion, tail, this.avcC, frameW, frameH);
      this.lastMp4 = mp4;
      this.savedMotionCount = this.motion.length;
    }
    if (!mp4) {
      // 开了录但一帧都没编出来（如编码器还没吐出首帧就保存）：只落 json 记住开关与设置。
      return { json: this.toJson(0), mp4: new Uint8Array(0) };
    }
    // 冻结 passthrough 时 motionSamples 必须与 lastMp4 里的实际样本数一致（= savedMotionCount）。
    // 曾经写 motion.length：drain 出新帧但尾帧编不出（GL lost/编码器死）→ json 数字领先 mp4 →
    // 下次打开 sample-count-mismatch 整段作废（timelapse 静默关闭案 §3 雷，2026-08-25 拆）。
    return { json: this.toJson(this.savedMotionCount), mp4 };
  }

  toJson(sampleCount: number): string {
    const s = this.settings!;
    const j: TimelapseJsonV1 = {
      v: 1, on: this.on, aspect: [s.aspectW, s.aspectH], longEdge: s.longEdge,
      n: this.sampler?.n ?? 0, motionSamples: sampleCount,
    };
    return JSON.stringify({ ...this.extra, ...j, ...stampFields("timelapse") });   // 直通袋 → 已知键 → 本版拍（已知键与拍子永远赢）
  }

  /**
   * 从 ora 回读。失败自愈原则（2026-08-25 护栏批改版，user 拍板「作废不删证据+雷也修」）：
   *   - corrupt-json / corrupt-mp4：读不懂 → 原字节进检疫区（保存时 passthrough，不销毁），录像停。
   *   - mp4-missing：json 健康只是素材没了 → **设置与开关保命**，从零继续录（不再连坐作废）。
   *   - sample-count-mismatch：json 数字领先 mp4 → 按 mp4 实际样本数截断继续用（不再整段作废）。
   * 绝不 throw。mp4Bytes=null 表示 entry 缺席。
   */
  static restore(json: string | null, mp4Bytes: Uint8Array | null): TimelapseDocState {
    const st = new TimelapseDocState();
    if (json == null) return st;   // 从没开过录：健康空态
    let j: TimelapseJsonV1;
    let verdict: Verdict, stamp: Stamp;
    try {
      // 格式版本纪律：先按拍子升到本版 major（v 键；缺 = 1），major 比本版新 → FormatTooNewError（下面单独定性）。
      const r = migrate("timelapse", JSON.parse(json));
      j = r.json as TimelapseJsonV1; verdict = r.verdict; stamp = r.stamp;
      if (j.v !== FORMAT.timelapse.major || !Array.isArray(j.aspect) || typeof j.longEdge !== "number"
          || typeof j.n !== "number" || typeof j.motionSamples !== "number") throw new Error("shape");
    } catch (e) {
      st.restoreIssue = e instanceof FormatTooNewError ? "too-new" : "corrupt-json";
      st.quarantineJson = json; st.quarantineMp4 = mp4Bytes;   // 两种都进检疫区：字节原样带回，不删证据（护栏 E）
      return st;
    }
    st.settings = { aspectW: j.aspect[0], aspectH: j.aspect[1], longEdge: j.longEdge };
    st.sampler = new TimelapseSampler(j.n);
    st.on = !!j.on;
    st.extra = splitExtra("timelapse", j, KNOWN_TIMELAPSE_FIELDS);
    st.formatVerdict = verdict; st.formatStamp = stamp;
    if (mp4Bytes == null || mp4Bytes.length === 0) {
      if (j.motionSamples > 0) st.restoreIssue = "mp4-missing";   // 素材丢了：报警但录制身份保命，从零续录
      return st;
    }
    try {
      const d = demuxTimelapse(mp4Bytes);
      if (j.motionSamples > d.samples.length) {
        // json 领先 mp4（旧版冻结保存的雷埋出来的档）：按 mp4 实际内容截断（末样本按尾帧丢弃），素材保住。
        st.restoreIssue = "sample-count-mismatch";
        st.motion = d.samples.slice(0, Math.max(0, d.samples.length - 1));
      } else {
        st.motion = d.samples.slice(0, j.motionSamples);   // 截掉尾帧（每次保存重新现编）
      }
      st.avcC = d.avcC;
      st.lastMp4 = mp4Bytes;
      st.savedMotionCount = st.motion.length;   // 回读来的都已在盘上
    } catch {
      const fresh = new TimelapseDocState();
      fresh.restoreIssue = "corrupt-mp4";
      fresh.quarantineJson = json; fresh.quarantineMp4 = mp4Bytes;
      return fresh;
    }
    return st;
  }

  /** 当前录像字节数（UX 显示；数据层裸字节，显示层才 KiB/MiB）。 */
  get byteSize(): number { return this.lastMp4?.length ?? 0; }
}
