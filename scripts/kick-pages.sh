#!/usr/bin/env bash
# created 2026-08-31 by Claude Opus 5 (claude-opus-5[1m])
# kick-pages.sh —— push prod 之后「源站**真的**切换了吗」的验证 + 记录在案的修法。
#
# 坑（2026-07-27 v0.6.17、2026-08-31 v0.12.16 两次踩到；详 ai-docs/20260530-lessons-pages-deploy-race.md「坑二」）：
#   prod 快进到与 main **同一个 sha** 后，两次 workflow run 都 success、artifact 内容对、deployment API 也
#   报 active，但源站持续服**旧** prod 内容；workflow_dispatch 重跑无效。两次都是「空 commit 真 push 出一个
#   新 sha」30 秒切换。本脚本把这套写死——**必须跑，不是必须读**：push-prod.sh 推完 prod 自动调用。
#
# 用法：
#   bash scripts/kick-pages.sh                # 验证；3 分钟未切换 → 自动空 commit + 原子推 main main:prod → 再验
#   bash scripts/kick-pages.sh --check        # 只验证不动 git（exit 0=已切换，1=未切换）
#   bash scripts/kick-pages.sh --after-push   # 同默认，但先等 45s 让 Actions 跑完再探（push-prod.sh 用这个）
#   KICK_SIGNATURE='Co-Authored-By: …' 环境变量：署进空 commit 正文（家规署名制；跑脚本的实体自己签）。
#
# 探法（07-27 教训）：探「只有新部署才有」的 content-hash bundle URL，**不探 index.html**（600s CDN 缓存）。
#   weebpaint.com 与 fangzhangmnm.github.io 是两个缓存 key，轮着探；每次带新 query 串
#   （07-27 记「query 不进 cache key」，08-31 实测 x-cache:MISS 说明会进——两说并存，轮 host 是保险）。
set -euo pipefail
cd "$(dirname "$0")/.."
MODE=${1:-}
HASH=$(grep -oE 'dist/weebpaint-[0-9a-f]+\.mjs' index.html | head -1)
[ -n "$HASH" ] || { echo "[kick-pages] index.html 里找不到 bundle 引用"; exit 2; }
HOSTS=("https://weebpaint.com" "https://fangzhangmnm.github.io/weebpaint")

probe() {  # $1=轮数 $2=间隔秒；源站服新 bundle 即返回 0
  local i code host
  for ((i = 1; i <= $1; i++)); do
    host=${HOSTS[$((i % 2))]}
    code=$(curl -s -o /dev/null -w '%{http_code}' "$host/$HASH?probe=$RANDOM$i" || echo 000)
    if [ "$code" = "200" ]; then echo "[kick-pages] ✓ 源站已服新 bundle（$host/$HASH，第 $i 次探测）"; return 0; fi
    echo "[kick-pages] … 第 $i 次：$host → HTTP $code（等 ${2}s）"; sleep "$2"
  done
  return 1
}

echo "[kick-pages] 目标 bundle = $HASH"
[ "$MODE" = "--after-push" ] && { echo "[kick-pages] 等 45s 让 Actions 跑完…"; sleep 45; }
if probe 12 15; then exit 0; fi                                   # 3 分钟
[ "$MODE" = "--check" ] && { echo "[kick-pages] ✗ 源站未切换（--check 模式，不动 git）"; exit 1; }

echo "[kick-pages] ✗ 3 分钟未切换 → 记录在案的修法：空 commit 给 prod 一个新 sha，main 与 prod **原子**推"
VER=$(grep -o '"v[0-9][^"]*"' src/version.ts | head -1 | tr -d '"')
git commit --allow-empty -q -m "chore: 空 commit 重踹 Pages 部署（$VER 源站未切换；scripts/kick-pages.sh 自动）${KICK_SIGNATURE:+

$KICK_SIGNATURE}"
git push origin main main:prod
echo "[kick-pages] 已推 $(git rev-parse --short HEAD)，等 45s 再验…"; sleep 45
if probe 12 15; then exit 0; fi
echo "[kick-pages] ✗✗ 空 commit 后仍未切换——超出记录在案的手段，**停下来找人**，别再自创花招。"
echo "[kick-pages]    排查起点：gh run list --limit 3 ；gh api 'repos/fangzhangmnm/weebpaint/deployments?environment=github-pages&per_page=3'"
exit 1
