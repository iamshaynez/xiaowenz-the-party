# 碰头 · PARTY

一个轻量、移动端优先的实时聚会游戏基座。手机就是手柄，房间码就是邀请函；无需注册或下载。

当前版本包含完整基座和三款游戏：**「谁最可能」**、**「存钱罐」** 与 **「怪兽汽车」**。

## 已实现

- 六位房间码、二维码、昵称与预置头像；「谁最可能」「存钱罐」支持 3–12 人，「怪兽汽车」支持 2–4 人。
- 首页游戏货架（带标签分类）选好开局游戏，进房即预选；「谁最可能」私密投票、平票计分；「存钱罐」守护/砸罐、有限锤子、天降事件与随机落幕。
- 「怪兽汽车」提供轮子、车头、车尾、车顶、司机五个槽位，每槽四款零件；装车、倒计时、30 秒森林竞演与结算完整串联，随机名次不受零件影响。
- 服务端权威规则：不能投自己、不能投旁观者、不能越权推进或修改分数；怪兽汽车只接受合法装车动作，最终名次由服务端计划生成。
- 真实 WebSocket 状态同步；每名玩家只收到自己有权看到的游戏视图。
- 怪兽汽车使用公开、可 JSON 序列化的 `RacePlan` 和任意时刻确定性采样；竞演画面在各浏览器本地生成，不逐帧广播位置。
- 怪兽汽车的 Three.js 面板按需加载，模型、森林、粒子与音效均为程序化自包含资产；WebGL 不可用或上下文丢失时切换为 DOM 降级视图。
- 刷新与断网自动重连、多标签页处理、30 秒心跳、65 秒假在线清理。
- 操作幂等与冲突检测、消息 schema 校验、HTTP/WebSocket 限流。
- 房间与操作原子快照；正常重启后恢复会话、票型和分数，怪兽汽车恢复同一赛事计划而不重新随机。
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
pnpm test:ui         # jsdom 中从用户视角组织的 React 组件测试
pnpm test:e2e        # 本地：多浏览器完整对局 + 怪兽汽车真实 WebGL 验收
pnpm test:e2e:online # 线上：直接验收 party.xiaowenz.com，无需多部手机
pnpm test:coverage   # 覆盖率阈值：语句/函数/行 85%，分支 80%
pnpm typecheck       # 严格 TypeScript 检查（含测试）
pnpm build           # 全部工作区检查 + Web 生产构建
pnpm check:all       # 完整 CI 门禁
```

测试按业务语言组织：

```text
tests/
├── business/   # 玩家、房主、投票、恢复、确定性赛事与规则边界
├── network/    # 真实端口、多个 WebSocket、攻击/异常/心跳/重启、无逐帧广播
├── ui/         # jsdom 中的创建、加入、大厅、投票、揭晓等可见行为
└── e2e/        # Chromium 多浏览器完整聚会流程与真实 Canvas 渲染
```

首次运行 E2E 前执行 `pnpm exec playwright install chromium`。线上验收复用本地多浏览器场景，不启动本地服务；可用 `pnpm test:e2e:online -- --headed` 观看自动操作。测试会创建真实房间，断开后由服务端按闲置规则自动过期。jsdom 组件测试不能证明真实 WebGL 渲染；怪兽汽车的 Three.js 画布由真实 Chromium E2E 检查，详见 [测试规范](docs/TESTING.md)。

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
├── games/              # 内置游戏；当前为「谁最可能」「存钱罐」与「怪兽汽车」
└── room/               # 房间生命周期与游戏组合根
```

详细设计见 [架构文档](docs/ARCHITECTURE.md)、[协议文档](docs/PROTOCOL.md)、[测试规范](docs/TESTING.md)、[怪兽汽车资产与反应协议](docs/CAR_ASSETS.md) 和 [生产部署](docs/DEPLOYMENT.md)。

## 生产自动部署

生产环境为 <https://party.xiaowenz.com>。release PR 合并到 `main` 后，`deploy-main.yml` 会通过 hk-dev 上的 `hk-build` runner 构建并推送 ACR 镜像，然后更新容器并执行 HTTPS/WSS 冒烟。详见 [hk-dev 生产部署](docs/DEPLOYMENT.md)。

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
fix/*  ── PR ──> dev
```

`main` 和 `dev` 均为受保护分支，必须通过 PR 合入，必需审批人数为 0。每次开发都从最新 `dev` 创建 `feat/*` 或 `fix/*`；PR 合并后远端自动删除源分支，本地同步后切回 `dev`。详见 [分支规范](docs/BRANCHING.md)。

## 第一款游戏规则

「谁最可能」每轮展示一道轻松的问题。每名参与者秘密投给一名其他参与者，不能投自己；全员提交或 60 秒超时后揭晓。最高票玩家得 1 分，平票则并列玩家都得 1 分。完成所选轮数后按总分排行，房主可以再开一局。

## 第二款游戏规则

「存钱罐」支持 3–12 人，每轮秘密选择守护或砸罐，砸罐者平分罐中金币，守护者获得安慰币。锤子数量有限，金币雨、烫手罐、盲罐、纸糊罐和警报轮会改变结果；实际落幕轮保密，罐中余币终局平分。

## 第三款游戏规则

「怪兽汽车」支持 2–4 人，每次进行一场森林旅行（`rounds: 1`）。每位参与者从五个槽位各选一款零件，每个槽位有四款选择，也可以使用开局生成的完整默认车辆。提交 `build-car` 即准备完成，准备后仍可改装；全员提交或 120 秒组装期限到达后进入 3.2 秒倒计时，未准备玩家使用当前车辆自动出发。随后进行 30 秒竞演并进入结算，房主可以再开一场。

赛道包含水坑、木头、阵风和山坡事件，零件按公开反应协议产生动作与高光；没有专属反应时使用通用车身反应，司机另有次要反应。零件只改变外观和表现，不提供速度或名次优势。赛事种子决定随机完赛顺序、配速和反应提示，更换零件不会改变同种子下的完赛顺序与配速。

倒计时开始时，服务端把可序列化的 `RacePlan` 与时间边界发给所有玩家和旁观者。各浏览器用同一个纯函数按绝对赛事时间采样位置、名次与反应，刷新或服务重启后继续同一计划；服务端只在阶段变化等状态变更时广播，不逐帧发送车辆位置。`standings` 到 `finished` 才填充，但 `plan.finishOrder` 从倒计时起就是公开数据，不属于保密结果。
