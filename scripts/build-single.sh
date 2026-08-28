#!/usr/bin/env bash
# build-single.sh —— 常规 build + 单文件打包（P6）。产物 = dist/weebpaint-single.html（gitignored）。
# created 2026-08-27 by Claude Fable 5.
set -e
cd "$(dirname "$0")/.."
bash scripts/build.sh
node scripts/pack-single.mjs
