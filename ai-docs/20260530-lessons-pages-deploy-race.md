# 教训：GitHub Pages deploy race（main+prod 同 push）

## 现象（v130 踩到的）

我 push main 之后立刻 merge → push prod。两个 workflow 几乎同时触发。GitHub Actions 两边都 success，但 prod 的根目录 (`https://fangzhangmnm.github.io/webpaint/`) 仍然 serve **旧 prod tree 的内容**（旧 hash bundle），而新 hash bundle 在 prod 分支里明明存在，URL 取也 404。

## 根因：concurrency 队列 + checkout 时机 + Pages 单 deploy 槽

我们的 deploy.yml 有：

```yaml
on:
  push:
    branches: [main, prod]
concurrency:
  group: pages
  cancel-in-progress: false   # ← 元凶
```

`cancel-in-progress: false` = 新触发的 workflow 排队等前一个跑完。

实际时间线：

```
T+0    push main         → workflow A 触发，runner 起来
T+1s   workflow A: checkout prod
       ← 这一刻 prod 还是旧 tip（我还没 push prod）
T+10s  push prod         → workflow B 触发，被 A 占着 group 排队
T+15s  workflow A 拼装 site/：
         site/index.html、site/dist/* 都来自旧 prod tree
       upload-pages-artifact + deploy-pages
       → Pages 切到 A 的 artifact，根路径 = 旧 prod ✓
T+30s  workflow A 完成，workflow B 解锁
T+35s  workflow B: checkout prod
       ← 这次拿到新 prod tip
       拼装 site/，正确内容
       upload + deploy
       → 但 Pages **静默 collapse** 掉了 B 的 deploy
          （GH Pages 对同 environment 的连续 deploy 有自己的 dedup / 不告诉你）
```

A 的 success 是真 deploy；B 的 success 是 Action 步骤层面 success，但 Pages 实际并没切到 B 的 artifact。结果：根路径卡在 A 部署的旧内容。

dev (/dev/) 没事，因为 main-tree 在 A workflow 里 checkout 时已经是新的。

## 关键认知

1. **`actions/checkout@v4 ref: prod` 是在 step 执行时拉 prod 当前 tip**，不是 workflow 触发时的 snapshot。若 step 跑在 push 之前，拿到的就是旧 tip。
2. **GH Pages 同 environment 不接受并发 deploy**。多个 deploy-pages 同一 env 队列里，可能只第一个生效。official 文档说"only one deployment can be active per environment"，但什么时候 collapse、collapse 哪个，没明确。
3. `concurrency.cancel-in-progress: false` 意图是「保护正在 deploy 的工作不被打断」，但跟 #2 一组就变成「锁死第一个赢家」。

## 修法：cancel-in-progress: true

```yaml
concurrency:
  group: pages
  cancel-in-progress: true   # 改这里
```

新语义：B 触发时若 A 还在跑就**取消 A**。B 重新跑，此时 prod 早已 push 上去，checkout 拿到对的 tip，部署对的内容。

副作用：连续 push（调代码 1 分钟 push 3 次）只最后一次 deploy 生效。对 dev/ 这无所谓——中间状态本来就没人看。

这种 race 不会再咬人。

## 坑二：prod 快进到与 main 同 sha → 二次部署「success」但源站不切换

> added 2026-08-31 by Claude Opus 5 (claude-opus-5[1m])；as-of v0.12.16。与上面的 race **不是一回事**，
> `cancel-in-progress: true` 挡不住它。已踩两次：2026-07-27（v0.6.17，记在 memory
> project_webpaint_v0614_smallfixes）、2026-08-31（v0.12.16，本节）。

### 现象（两次完全一致）

- push main（dev 上线）→ 之后 `git push origin main:prod`（prod 快进到**与 main 同一个 commit**）。
- 两个 workflow run 都 success；**没有重叠**（08-31：main run 02:02:02–02:02:29，prod run 02:02:43–02:03:02）。
- 部署产物下下来核过：`./index.html` 与 prod 分支字节一致（sha256 同）、新文件在根与 `/dev/` 都在。
- Pages deployment API：第二个 deployment `success`，并把第一个标 `inactive`——账面上新版已生效。
- 但源站服的是**第一个 run 的产物** = 旧 prod-tree + 新 main-tree：`/dev/` 是新的、`/` 是旧的。
  不是 CDN：og 图 404 的响应头 `x-cache: MISS, age: 0`；根 HTML `last-modified` = 第一个 run 的时刻。
- `workflow_dispatch` 重跑：**无效**（两次都试过）。10+ 分钟不自愈（07-27 记 >1h）。

### 「sha 撞」是什么（假说，未证实——别当定论引用）

`actions/deploy-pages` 的日志：`Created deployment for <sha>, ID: <sha>`——**Pages 侧的 deployment ID 就是 commit sha**
（`pages_build_version`）。prod 快进到 main 的同一个 commit 后，main 触发的 run 与 prod 触发的 run 打的是**同一个 ID**：
第一个 run（旧 prod-tree）先占了这个 ID；第二个 run 内容对，但同 ID → Pages 后端疑似当「已构建过」处理，
状态记录更新了、内容层没换。反证：v0.12.15（同 sha、间隔 16 分钟）正常切换——所以可能还叠着时间窗
（同 sha 的构建缓存有 TTL 之类）。**只有症状与修法是实证，机制是推测**。

### 记录在案的修法（07-27 验证，30 秒切换）

给 prod 一个**没部署过的新 sha**：`git commit --allow-empty` 后 **`git push origin main main:prod` 一次原子推**
（两个 ref 同一次 push 更新——无论哪个 run 赢，checkout prod 拿到的都已是新 tip；main/prod 也不错位）。
不是改历史、不动任何文件、prod 内容与之前完全一样。

### 规程（2026-08-31 立，user「建立安全规程」）

- **验证走 content-hash URL，不走 index.html**：探 `https://weebpaint.com/dist/weebpaint-<hash>.mjs`——只有新部署才有这个文件。
  index.html 有 600s CDN 缓存，探它会被缓存骗。每次带新 query 串。（fangzhangmnm.github.io 不能当第二缓存 key：
  配了自定义域名后它一律 301 跳 weebpaint.com，08-31 首跑实证。）
- **必须跑，不是必须读**：`scripts/kick-pages.sh` = 验证 → 3 分钟未切换自动空 commit 原子重推 → 再验 → 仍不行非零退出
  「停下来找人」。`scripts/push-prod.sh` 推完 prod **自动调用**；手动排查也先跑它（`--check` 只探不动 git）。
- **超出记录在案手段就停**：空 commit 后仍不切 = 新情况，找人，别再自创花招（08-31 教训：修法早在 memory 索引里，
  却从零排查了 20 分钟、还把已验证的空 commit 误判成「动历史的高危操作」）。

## 救活已经搞砸的 deploy

如果已经踩进去（live 还显示旧内容）：

```bash
# 2026-08-31 起：直接跑 scripts/kick-pages.sh（验证 + 空 commit 原子重推，见「坑二」）。下面是它做的事：
git commit --allow-empty -m "force redeploy"
git push origin main main:prod      # 原子推两个 ref；别只推 prod（会与 main 错位、下次快进被拒）
```

新 workflow 跑一遍，prod tree 已稳定到正确状态，deploy 一次就好。

## 相关阅读

- [ai-docs/20260529-dev-prod-split.md] dev/prod 分支策略论证（如果有的话；workflow 注释提到了）
- GitHub docs: <https://docs.github.com/en/actions/using-jobs/using-concurrency>
- actions/deploy-pages 行为：<https://github.com/actions/deploy-pages>

## 适用范围

任何用 **action 部署到 GH Pages 的多分支 repo** 都该用 `cancel-in-progress: true`，除非你确实需要"上一个 deploy 跑完再排下一个"且能接受静默 collapse 风险。sibling family 的其他 PWA 用同 deploy 模板的也都需要改。
