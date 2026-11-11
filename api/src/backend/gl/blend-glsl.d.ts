import type { BlendMode } from "../../common/blend-modes.ts";
export { BLEND_MODES } from "../../common/blend-modes.ts";
export type { BlendMode } from "../../common/blend-modes.ts";
export declare const COMPOSITE_VERT = "#version 300 es\nlayout(location=0) in vec2 a_pos;\nlayout(location=2) in vec4 a_rect;\nout vec2 v_uv;\nvoid main(){ vec2 p = a_rect.xy + a_pos * a_rect.zw; v_uv = p; gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0); }";
export type SourceKind = "tiled" | "group" | "overlay";
export declare function compositeFragSource(mode: BlendMode, src?: SourceKind, overlayMode?: BlendMode): string;
export declare function compositeProgramKey(mode: BlendMode, src?: SourceKind, overlayMode?: BlendMode): string;
