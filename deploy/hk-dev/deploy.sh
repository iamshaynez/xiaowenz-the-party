#!/usr/bin/env bash
# 版本化部署副本：GitHub Actions 从当前 main checkout 调用本脚本。
# 手动回滚：cd /opt/apps/party && PARTY_TAG=<commit-sha> docker compose up -d
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/apps/party}"
cd "$APP_DIR"

ok=0
for i in 1 2 3; do
  if docker compose pull; then ok=1; break; fi
  echo "镜像 pull 失败，第 $i 次重试"; sleep 8
done
if [ "$ok" != 1 ]; then
  echo "镜像 pull 三次均失败"
  exit 1
fi

docker compose up -d

ready=0
for i in $(seq 1 20); do
  if curl --fail --silent http://127.0.0.1:18093/api/health >/dev/null; then
    echo "party 就绪（第 $i 轮）"
    ready=1
    break
  fi
  sleep 3
done

if [ "$ready" != 1 ]; then
  echo "party 未就绪"
  docker logs party --tail 40
  exit 1
fi
