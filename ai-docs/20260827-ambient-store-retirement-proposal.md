# ambient store 退役提案（无库真 sunset 刀二+刀三）

> created 20260827 · by Claude Fable 5
> as-of v0.11.23。user 拍板（2026-08-27 晚）：「代码随地大小便地引用 take-as-granted 的全局 store，
> 无地的思路就是把依赖整理好」+「null-store 退役这个 session 才算完」+「两个旗帜合并同意」。
> 现状 .h = `api/app-store.d.ts`（v0.11.23 快照，`export let store: AppStorePort` ambient 出口在册）。

## 提案 .h（app-store 接缝，pin 住的目标契约）

```ts
export type AppStorePort = Pick<Store, "file" | "files" | "collection" | "encryption">;   // 四面不变
export type GalleryBackend =
  | { kind: "live"; store: AppStorePort }
  | { kind: "none" };                              // 无库运行态（原 null-store 替身 + storeAbsent 两旗合流）
/** 分叉声明：此路径合法地既可有库也可无库——exhaustive switch（DocHome 同手法），禁 ?. 静默中间态。 */
export function galleryBackend(): GalleryBackend;
/** 需求声明：此路径结构上必有库（gallery UI / gallery 家保存）。无库被调到 = 响亮 throw（= bug surfaced）。 */
export function requireStore(): AppStorePort;
export function hasLiveStore(): boolean;           // 便利布尔；isCloudEnabled 真相源（不变）
export const storeAbsent: boolean;                 // 平台探针「永远不可能有库」= attach 禁用位（保留）
```

**退役**：`export let store`（ambient 出口）、`createNullStore`、`createDormantAuth`、`AppContext.store`。
**保留**：`createMemoryCollection`（无库笔架的合法器官：builtin 种子、session 内可编辑、reload 失——
显式选择而非替身副作用）；`detectStoreAbsent`（平台探针）；`_swapStoreForGallery(Store|null)` 内部 seam。

## 消费点分类（普查 as-of v0.11.23）

- **requireStore**（结构上必有库）：gallery 层 UI（gallery.ts/gallery-model/gallery-shell/cloud-thumbs/
  image-thumbs/cloud-thumb-cache/enc-thumbs/gallery-manage-ui）、export hub「复制到图库」、
  session-state 的 gallery 家 es 路径（saveRoute="store" 分支）、dev-console（响亮死可接受）。
- **galleryBackend 分叉**：nameOccupied 预检（无库=不占用，浏览器自补 (1)）、app.ts drainOfflineQueue、
  import-image 加密嗅探（见缺口）、boot 链。
- **已经做对的（不动）**：collections 注入（app-prefs/app-state/brush-rack cascade + `Collection|undefined`
  字段）；saveRoute 派发表（store 获取挂 gallery 分支，file/transient 结构上摸不到店）。
- **红线**：session-state/es 迁移只改「store 引用怎么拿到」（`_store.x` → `requireStore().x`），
  **不改任何 store 调用的参数/顺序/语义**（v415 红线）。

## 两旗合流

`storeAbsent`（平台没收持久化器官，single html/file://）boot 即 `kind:"none"` 且 attach 永久禁用；
无库（registry 空/detach）= 同一 `kind:"none"`，attach 可用。dormant auth 退役 → `_auth: Auth | null`，
auth 转发口 null-guard（isAuthConfigured=false / signIn=响亮 throw——与 dormant 行为等价但不再靠镜像替身）。

## 缺口登记（不在本轮绕）

`store.encryption` 是纯内容加密（blob 进出，与 backend 无关），但库只经 Store 实例出口 →
**无库导入加密 .ora 探测不了**（现状 = null-store 谎报「不加密」静默错路；本轮改为显式分叉 + 诚实报错）。
正解 = 库出独立 encryption 面 → **store escalation 已登记**（internal-store agenda 议题 5）。

## 护栏（构建层）

build.sh lint：①禁 `import { store }` / `store as` 从 app-store（出口已删，防复活）；
②禁 `createNullStore|createDormantAuth` 引用复活；③AppContext 无 store 字段（tsc 本身守）。

## 验收

1176+ node 测试全绿；headless 无库 smoke（nogallery-smoke 六探针）；single-html 重打 + smoke
（absent=kind:none 合流路径）；nostore-boot-child 子进程 boot smoke；gen-api 重打（发版 ritual）。

## 落地回写（同日，v0.11.24；提案是 pin 住的契约，形状变了回写）

1. **比提案切得更深：店懒出生**。实施中 user 无痕实锤两伤（connect 后「idb cache closed」黄警告 +
   transient 画布被焚），病根都指向 eval 期无条件预建 defaultStore 店。终形：eval 恒 `kind:"none"`，
   店只在 attach 时刻经 `_buildStoreForGalleryEntry` 出生——`bootAdopt`/`_takeBootStore`/预建实例全退役，
   boot 三分支塌缩成「registry 有条目 → 普通 attach（`gesture:false` 不申请 persist）」。
   新不变量：**`_storeFull≠null ⇔ attached`**。
2. **事故修（词典序②）**：`switchFlow` 连接成功后的 Q4 自动导航加 `docHome()==null` 守卫——
   有开着的画（transient/file）留在编辑器，不再无门焚画。
3. **护栏首捕**：single-html smoke 逮到 gallery Vue 组件 setup 期裸订阅（旧靠 null-store 喂空帧装活），
   `subscribe()` 现显式表态 kind:none → 空网格不订阅。
4. 验收全绿：1175 node + 无库 headless 六探针（含 console.error 零噪音）+ single-html file:// smoke +
   nostore-boot-child；build.sh 新增 ambient-store lint（禁 `import {store}` 复活 + 禁替身复活）。
5. 已知缺口照案登记：encryption 独立出口 → internal-store agenda 议题 5（无库加密 .ora 导入/嗅探）。
