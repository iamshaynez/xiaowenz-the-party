# 碰头 · PARTY

一个轻量、移动端优先的实时聚会游戏基座。手机就是手柄，房间码就是邀请函；无需注册或下载。

当前版本包含完整基座和第一款游戏 **「谁最可能」**。

## 已实现

- 六位房间码、二维码、昵称与预置头像，3–12 人房间。
- 房主开局、轮数选择、私密投票、自动揭晓、平票计分、最终排行、再来一局。
- 服务端权威规则：不能投自己、不能投旁观者、不能越权推进或修改分数。
- 真实 WebSocket 状态同步；每名玩家只收到自己有权看到的游戏视图。
- 刷新与断网自动重连、多标签页处理、30 秒心跳、65 秒假在线清理。
- 操作幂等与冲突检测、消息 schema 校验、HTTP/WebSocket 限流。
- 房间与操作原子快照；正常重启后恢复会话、票型和分数。
- 闲置房间自动过期、安全响应头、Origin 校验、无第三方字体或追踪请求。
- 移动端与桌面端完整界面，深色舞台视觉、动效与减少动效偏好支持。

## 快速开始

要求：Node.js 22+（推荐 24）和 pnpm 10。

```bash
corepack enable
pnpm install
pnpm dev
```

打开 [http://localhost:5173](http://localhost:5173)。Vite 会将 `/api` 和 `/ws` 代理到 3000 端口。

生产模式：

```bash
pnpm --filter @party/web build
pnpm --filter @party/server start
# http://localhost:3000
```

默认快照写入 `./data/party.json`。该文件包含会话恢复令牌，请保护它，不要提交或公开。

## 测试与质量门禁

```bash
pnpm test            # 业务规则 + 真实 HTTP/WebSocket 网络测试
pnpm test:ui         # 从用户视角组织的 React 组件测试
pnpm test:e2e        # 三个独立浏览器完成三轮真实对局
pnpm test:coverage   # 覆盖率阈值：语句/函数/行 85%，分支 80%
pnpm typecheck       # 严格 TypeScript 检查（含测试）
pnpm build           # 全部工作区检查 + Web 生产构建
pnpm check:all       # 完整 CI 门禁
```

测试按业务语言组织：

```text
tests/
├── business/   # 玩家、房主、投票、恢复与规则边界
├── network/    # 真实端口、多个 WebSocket、攻击/异常/心跳/重启
├── ui/         # 创建、加入、大厅、投票、揭晓等可见行为
└── e2e/        # 多浏览器完整聚会流程
```

首次运行 E2E 前执行 `pnpm exec playwright install chromium`。

## 工程结构

```text
apps/
├── web/                # React + Vite，移动端优先
│   └── src/
│       ├── components/ # 大厅、投票、玩家、资料等展示组件
│       ├── hooks/      # 会话、重连、版本与操作状态
│       ├── pages/      # 首页和房间页
│       └── services/   # 可替换的 HTTP/WebSocket 适配器
└── server/             # Fastify + WebSocket
    └── src/
        ├── http/       # HTTP 路由与公开配置
        ├── realtime/   # 鉴权、广播、心跳、限流
        └── rooms/      # 房间服务、幂等、快照恢复
packages/
├── protocol/           # 客户端/服务端共享消息 schema 和 DTO
├── game-core/          # 游戏定义、上下文与领域错误
├── games/              # 内置游戏；当前为「谁最可能」
└── room/               # 房间生命周期与游戏组合根
```

详细设计见 [架构文档](docs/ARCHITECTURE.md)、[协议文档](docs/PROTOCOL.md) 和 [测试规范](docs/TESTING.md)。

## Docker 部署

```bash
docker build -t the-party .
docker run -p 3000:3000 -v party-data:/data \
  -e PUBLIC_ORIGIN=https://party.example.com \
  the-party
```

或直接使用：

```bash
PUBLIC_ORIGIN=https://party.example.com docker compose up -d
```

公网必须由反向代理或托管平台提供 HTTPS/WSS，并将 `PUBLIC_ORIGIN` 设为浏览器实际访问的源（包括协议和端口，如有）。`/data` 必须挂载持久卷。反向代理场景设置 `TRUST_PROXY=true`，直连时不要开启，避免伪造客户端 IP。

**当前版本是单实例架构。** 不要直接启动多个副本做负载均衡；扩容需要按房间路由或引入共享房间运行时，详见架构文档。

## 分支流程

严格采用：

```text
feat/* ── PR ──> dev ── release/* ── PR ──> main
```

禁止直接向 `main` 或 `dev` 推送功能代码。详见 [分支规范](docs/BRANCHING.md)。

## 第一款游戏规则

「谁最可能」每轮展示一道轻松的问题。每名参与者秘密投给一名其他参与者，不能投自己；全员提交或 60 秒超时后揭晓。最高票玩家得 1 分，平票则并列玩家都得 1 分。完成所选轮数后按总分排行，房主可以再开一局。
