// 手指测试的 GPU 写靶 helper（created 2026-09-18 by Claude Fable 5.1）：SoftGl2Port + GlRoom + LayerPixels + RegionStroke 真管线，
//   对外保持旧 mockLayer 的测试面（docW/docH/buf/fill/px/lockAlpha/bbox），加 open(sel)/close(rs)/stroke(eng, s, pts, sel)。
//   一次 open = 一笔：从当前 buf 装载 W；close = 读回 W 进 buf + dispose。
import { SoftGl2Port } from "../src/backend/soft-gl2-port.ts";
import { GlRoom } from "../src/backend/gl/gl-room.ts";
import { LayerPixels } from "../src/backend/tiles/tile-layer.ts";
import { RegionStroke } from "../src/backend/gl/region-stroke.ts";

export function gpuLayer(docW, docH, opts = {}) {
  const buf = new Uint8ClampedArray(docW * docH * 4);
  const port = opts.port ?? new SoftGl2Port();          // 传真 GL port（gl-smoke harness）→ 同一套驱动跑真 WebGL2
  const room = new GlRoom(port, opts.slices ?? 64);   // 64 tile 够测试 doc；真 GL 下 arena 是预分配的，别开大
  let pixels = null;
  const L = {
    docW, docH, buf, port, room,
    lockAlpha: !!opts.lockAlpha,
    bboxX: 0, bboxY: 0, bboxW: docW, bboxH: docH,
    fill(x, y, w, h, [r, g, b, a]) {
      for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) {
        const i = (yy * docW + xx) * 4; buf[i] = r; buf[i + 1] = g; buf[i + 2] = b; buf[i + 3] = a;
      }
    },
    px(x, y) { const i = (y * docW + x) * 4; return [buf[i], buf[i + 1], buf[i + 2], buf[i + 3]]; },
    /** 起笔：从当前 buf 造 RegionStroke。selection = { materializeMaskRegion } 形（旧测试 mock）或 null。 */
    open(selection = null) {
      pixels?.dispose();
      pixels = new LayerPixels(docW, docH);
      pixels.putRegion(0, 0, docW, docH, buf);
      const sel = selection ? { data: selection.materializeMaskRegion(0, 0, docW, docH), ox: 0, oy: 0, ow: docW, oh: docH } : null;
      return new RegionStroke(room, 1, pixels, docW, docH, sel, { lockAlpha: L.lockAlpha, ...(opts.snapshot ? { snapshot: true } : {}) });
    },
    /** 收口：W → buf，dispose。 */
    close(rs) {
      buf.set(rs.readPixels(0, 0, docW, docH));
      rs.dispose();
      pixels?.dispose(); pixels = null;
    },
    /** 跑一笔（pts[0] 给 beginStroke，其余 extend）；返回 dirty。 */
    stroke(eng, s, pts, selection = null) {
      const rs = L.open(selection);
      eng.beginStroke(rs, s, pts[0].x, pts[0].y, pts[0].p ?? 1);
      for (let i = 1; i < pts.length; i++) eng.extendStroke(pts[i].x, pts[i].y, pts[i].p ?? 1);
      const dirty = eng.flushDirty();
      eng.endStroke();
      L.close(rs);
      return dirty;
    },
    dispose() { pixels?.dispose(); pixels = null; room.dispose(); },
  };
  return L;
}
