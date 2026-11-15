# hk-dev 生产部署

生产地址：<https://party.xiaowenz.com>

## 自动部署

`.github/workflows/deploy-main.yml` 在 `main` 收到 push（包括 release PR 合并）时触发，也支持人工 `workflow_dispatch`。

```text
main push
  → xiaowenz-party-hk（self-hosted / hk-build）
  → checkout 当前 commit
  → Docker 构建
  → ACR：xiaowenz/the-party:<sha> 和 :main
  → /opt/apps/party 执行 Compose 更新
  → 本机 /api/health 冒烟
  → 公网 HTTPS + WSS 冒烟
```

部署串行执行，不会取消正在进行的发布。ACR 登录和镜像拉取带重试；构建关闭个人版 ACR 不支持的 provenance/sbom 附件。

## hk-dev 资源

- Runner：`/home/runner/actions-runner-party`
- systemd：`actions.runner.iamshaynez-xiaowenz-the-party.xiaowenz-party-hk.service`
- 应用：`/opt/apps/party`
- Compose：`/opt/apps/party/docker-compose.yml`
- 数据：`/opt/apps/party/data/party.json`
- 回环检查：`http://127.0.0.1:18093/api/health`
- OpenResty：`/opt/openresty/conf.d/party.conf`

版本化副本位于仓库 `deploy/hk-dev/`。修改部署逻辑时先改仓库并通过 PR，服务器副本同步更新。

## 网络

Cloudflare 负责公网 HTTPS/WSS，源站只监听 HTTP 80。OpenResty 经共享 `apps` 网络转发至 `party:3000`，使用 Docker DNS 动态解析，允许容器首次启动前加载配置。

应用环境固定：

- `PUBLIC_ORIGIN=https://party.xiaowenz.com`
- `TRUST_PROXY=true`
- `PARTY_DATA_FILE=/data/party.json`

## 运维

查看部署状态：

```bash
gh run list -R iamshaynez/xiaowenz-the-party --workflow deploy
```

查看容器：

```bash
ssh hk-dev 'cd /opt/apps/party && docker compose ps && docker logs party --tail 50'
```

手工执行公网检查：

```bash
node scripts/smoke-public.mjs https://party.xiaowenz.com
```

回滚到指定 commit 镜像：

```bash
ssh hk-dev 'cd /opt/apps/party && PARTY_TAG=<commit-sha> docker compose up -d'
```

快照含玩家恢复令牌，不得公开或提交。容器以 node 用户运行，宿主机数据目录归属 UID/GID 1000。

当前为单实例部署。更新会触发短暂重连，客户端自动恢复，快照在正常关闭时落盘。
