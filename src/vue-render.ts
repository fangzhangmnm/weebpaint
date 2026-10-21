// Vue 组件的 render 入口（#89，2026-10-21 by Claude Fable 5.1）：把 vendor 的 Vue 递给构建时编好的 render 工厂（src/vue-templates.compiled.ts，
//   生成物；SSoT = src/vue-templates.ts）。组件写 `render: VUE_RENDER.xxx` 而不是 `template:` → 运行时零 eval，页面 CSP 不放行 'unsafe-eval'。
//   版本守卫：编译器版本（钉在生成物里）必须等于页面跑的 Vue 版本——对不上 = 响亮抛（render 的 helper 签名跨版本不保证）。
import * as Vue from "../vendor/vue/vue.esm-browser.prod.js";
import { renders, COMPILED_WITH_VUE, HELPERS } from "./vue-templates.compiled.ts";

const V = Vue as unknown as { version?: string } & Record<string, unknown>;
if (V.version !== COMPILED_WITH_VUE) throw new Error(`[vue-render] templates compiled with Vue ${COMPILED_WITH_VUE} but the page runs Vue ${String(V.version)} — run npm run build`);
for (const h of HELPERS) if (V[h] == null) throw new Error(`[vue-render] Vue runtime lacks helper ${h} needed by the precompiled templates`);
export const VUE_RENDER = renders(Vue);
