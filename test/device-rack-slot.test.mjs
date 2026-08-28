// device-rack-slot（A2 终案）契约：无库笔架器官——IDB 单槽 write-through，「reload 不丢」= user 唯一拍板。
// created 2026-08-28 by Claude Fable 5. kv 注入假件（node 无 IDB）；降级路径 = kv 全抛。
import { describe, it, assert, eq } from "./runner.mjs";
import { createDeviceRackSlot } from "../src/device-rack-slot.ts";

const fakeKv = () => {
  let slot = null;
  return {
    puts: 0,
    async get() { return slot; },
    async put(v) { this.puts++; slot = JSON.parse(JSON.stringify(v)); },
    _peek: () => slot,
  };
};

describe("device-rack-slot · seed 与读写", () => {
  it("空槽 → getInitData seed（内置笔即刻可用）；有槽 → 不重播", async () => {
    const kv = fakeKv();
    const s = createDeviceRackSlot({ kv, getInitData: () => [{ id: "b1", value: { name: "出厂笔" } }], writeDelayMs: 1 });
    await s.init();
    eq(s.getItem("b1").name, "出厂笔", "seed 可读");
    await s.flushLocal();
    const s2 = createDeviceRackSlot({ kv, getInitData: () => [{ id: "bX", value: { name: "不该出现" } }] });
    await s2.init();
    eq(s2.getItem("bX"), undefined, "已有槽绝不重播 seed");
    eq(s2.getItem("b1").name, "出厂笔");
  });
  it("setItem 同步 fire onChange（controller 镜像依赖此约）；deleteItem 真删", async () => {
    const s = createDeviceRackSlot({ kv: fakeKv(), writeDelayMs: 1 });
    await s.init();
    const seen = [];
    s.onChange((ids) => seen.push(ids.join(",")));
    s.setItem("a", { v: 1 });
    eq(seen.length, 1, "同步 fire");
    eq(s.entries().length, 1);
    s.deleteItem("a");
    eq(s.entries().length, 0, "真删（无跨设备墓碑需求）");
    eq(seen.length, 2);
  });
});

describe("device-rack-slot · ★reload 不丢（A2 唯一拍板）", () => {
  it("编辑 → flushLocal → 新实例同 kv hydrate → 逐条一致", async () => {
    const kv = fakeKv();
    const s = createDeviceRackSlot({ kv, getInitData: () => [{ id: "b1", value: { name: "出厂笔" } }], writeDelayMs: 1 });
    await s.init();
    s.setItem("b1", { name: "我调过的笔", size: 42 });
    s.setItem("b2", { name: "自建笔" });
    eq((await s.flushLocal()).ok, true);
    const reloaded = createDeviceRackSlot({ kv, getInitData: () => [{ id: "b1", value: { name: "出厂笔" } }] });
    await reloaded.init();
    eq(reloaded.getItem("b1").size, 42, "★reload 后调参还在");
    eq(reloaded.getItem("b2").name, "自建笔", "★reload 后自建笔还在");
    assert(reloaded.persistent(), "IDB 可用 = persistent 真");
  });
  it("防抖落盘：连写只落一次（flushLocal 前 puts 不爆）", async () => {
    const kv = fakeKv();
    const s = createDeviceRackSlot({ kv, writeDelayMs: 5 });
    await s.init();
    for (let i = 0; i < 20; i++) s.setItem("k", { i });
    await new Promise((r) => setTimeout(r, 30));
    assert(kv.puts <= 2, `防抖生效（puts=${kv.puts}）`);
    eq(kv._peek().items[0].value.i, 19, "落的是最终值");
  });
});

describe("device-rack-slot · 降级诚实（无地平台 IDB 被没收）", () => {
  it("kv 全抛 → 纯内存照常工作 + persistent()=false + flushLocal ok:false（永不谎报）", async () => {
    const s = createDeviceRackSlot({ kv: { get: async () => { throw new Error("no idb"); }, put: async () => { throw new Error("no idb"); } }, getInitData: () => [{ id: "b1", value: { name: "出厂笔" } }] });
    await s.init();
    eq(s.getItem("b1").name, "出厂笔", "降级后内置笔照常");
    s.setItem("b1", { name: "改了" });
    eq(s.getItem("b1").name, "改了", "session 内可编辑");
    eq(s.persistent(), false, "★诚实上报不持久");
    eq((await s.flushLocal()).ok, false, "flush 不谎报成功");
  });
});
