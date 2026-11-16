# AGENTS.md

面向 AI 编程代理和新贡献者的项目操作手册。开始修改前先读本文件，再按改动领域阅读对应文档和测试。本文件提供导航与约束，不替代代码事实；发现规则、命令或结构已经变化时，应在同一改动中更新本文件。

## 1. 项目速览

- **产品**：碰头 · PARTY，轻量、移动端优先的实时聚会游戏平台。
- **当前游戏**：`most-likely`（谁最可能）、`piggy-bank`（存钱罐）、`can-drive`（这车能开？）；房间码或二维码加入，无需注册或下载，不同游戏支持 2–12 人。
- **生产地址**：<https://party.xiaowenz.com>。
- **技术栈**：Node.js 22+、TypeScript、React、Vite、Fastify、WebSocket、Three.js、pnpm monorepo、Vitest、Playwright。
- **核心形态**：浏览器只发送玩家意图，Node 单进程维护按房间隔离的权威状态机，并向每名玩家发送裁剪后的视图。

## 2. 环境与常用命令

要求 Node.js 22+（推荐 24）和 pnpm 10。

```bash
corepack enable
pnpm install
pnpm dev                 # Web: http://localhost:5173，Server: 3000
```

| 命令 | 用途 |
| --- | --- |
| `pnpm test` | 业务规则与真实 HTTP/WebSocket 网络测试 |
| `pnpm test:ui` | React 组件行为测试 |
| `pnpm test:e2e` | 本地生产模式服务 + 多个隔离浏览器的完整对局 |
| `pnpm test:coverage` | 业务/网络测试与覆盖率门禁 |
| `pnpm typecheck` | E2E 与全部工作区的严格 TypeScript 检查 |
| `pnpm build` | 全部工作区构建 |
| `pnpm check` | typecheck、coverage、UI、build |
| `pnpm check:all` | 完整 CI 门禁：`pnpm check` + 本地 E2E |
| `pnpm exec vitest run tests/business/can-drive.test.ts` | 运行车辆组装、展示、颁奖与恢复的规则回归测试 |

首次运行浏览器 E2E 前执行 `pnpm exec playwright install chromium`。

`pnpm test:e2e:online` 会直接访问生产环境并创建真实房间，不是普通本地测试命令；仅在明确需要线上验收时使用。

## 3. 目录与依赖边界

```text
apps/
  web/                 React 页面、组件、样式与浏览器服务适配器
  server/              Fastify HTTP、WebSocket、房间服务、持久化
packages/
  protocol/            客户端/服务端共享 DTO、消息 schema、公开常量
  game-core/           GameDefinition、动作上下文、领域错误
  games/               游戏纯状态机与内置题库
  room/                房间生命周期、身份权限、游戏组合根
tests/
  business/            玩家可见业务规则与领域边界
  network/             真实端口、真实 WebSocket、恢复与安全边界
  ui/                  React 用户行为
  e2e/                 多浏览器完整流程
scripts/               开发、部署与验收脚本
docs/                  架构、协议、测试、分支和部署规范
```

修改时遵守以下边界：

- 游戏规则放在 `packages/games` 的纯状态机中，不访问 DOM、WebSocket、数据库或系统时钟；车辆 ShowPlan 与模拟同样不得引用 Three.js。
- 共享消息和动作类型放在 `packages/protocol`，客户端、服务端不得各自定义一套不兼容结构。
- 房间身份、房主权限、加入/离开和连接状态放在 `packages/room` 或 server 房间服务，不散落到游戏组件。
- Web 组件通过 `PartyServices` 访问后端，不直接创建 WebSocket。
- 测试按业务承诺组织，不围绕私有方法或实现类名堆叠。

## 4. 不可破坏的架构约束

1. **服务端权威**：随机题目、投票、倒计时、揭晓、计分和阶段推进均由服务端校验与执行；不得信任客户端提交的分数、身份或阶段。
2. **按玩家裁剪视图**：私密信息必须在服务端视图中剔除，不能先广播再靠前端隐藏。涉及隐私的改动必须检查实际网络载荷。
3. **权限在领域层执行**：自投、旁观者投票、非房主推进、越权改分等必须在服务端拒绝，不能只禁用按钮。
4. **动作可恢复、可幂等**：客户端生成 `actionId`；同一动作重发返回原结果，不同内容复用动作号必须冲突。客户端使用 `room.version` 丢弃过期快照。
5. **房主不是主机**：房主只是权限角色，服务端计时不能依赖房主浏览器在线。
6. **状态可序列化**：游戏状态必须支持 `structuredClone` 和 JSON 快照恢复。不兼容的规则或状态结构变更必须提升游戏 `version`，不得静默误载旧快照。
7. **时间边界可测试**：游戏规则使用注入的时钟和随机数；不要通过真实等待 60 秒验证超时。
8. **单实例边界**：当前房间运行时驻留单个 Node 进程。不得通过简单增加副本做负载均衡；扩容需要房间路由或共享运行时设计。

详细说明见 `docs/ARCHITECTURE.md` 和 `docs/PROTOCOL.md`。

## 5. 编码与改动约定

- 使用严格 TypeScript；配置包含 `noUncheckedIndexedAccess`、`exactOptionalPropertyTypes`、`verbatimModuleSyntax` 等，不使用 `any`、忽略注释或降低配置来逃避错误。
- 保持现有 ESM、`import type`、命名、文件组织和中文用户文案风格；错误码保持稳定，用户可读消息清晰。
- 做满足需求的最小完整改动，不顺手重写无关模块；功能、测试、文档和迁移在同一分支完成。
- 新游戏推荐顺序：先写完整对局与越权测试，再实现 `GameDefinition`，接入 registry/protocol，增加 Web 视图，最后补真实多客户端与浏览器 E2E。
- 修改协议、公开规则、命令、部署方式或分支流程时，同步更新对应文档；不要只在代码里留下隐性约定。
- 不提交 `node_modules/`、`coverage/`、`playwright-report/`、`test-results/`、`artifacts/`、`data/` 或其他生成物。

## 6. 测试要求与完成标准

采用 RED → GREEN → REFACTOR：先写能证明业务行为的失败测试，确认失败原因，再写最小实现并重构。

- **business**：覆盖完整阶段、平票/计分、非法输入、越权和版本边界。
- **network**：使用真实 Fastify 端口与 `ws` 客户端；不得用 mock WebSocket 代替真实连接。鉴权、私密视图、幂等、心跳、限流和恢复应在这一层验证。
- **ui**：从角色、标签、按钮和可见文本验证行为。内存服务和二维码 mock 不能证明真实网络或扫码能力。
- **e2e**：验证多玩家完整旅程、刷新恢复、最终结算和再来一局；异步测试必须可靠清理端口、连接和浏览器。

覆盖率门禁：语句 85%、函数 85%、分支 80%、行 85%。不得降低阈值、删除有效断言或跳过必要测试来让 CI 变绿。

提交前运行与改动匹配的测试；进入 `dev` 前必须通过 `pnpm check:all`。如果未运行或测试失败，必须明确报告，不能声称已经验证。

## 7. 分支、提交与 PR（强制）

`main` 和 `dev` 都是受保护分支，包括管理员在内都不得直接 push、强推或删除，必须通过 PR。必需审批人数为 0，但仍必须等待 CI 通过。

每次开发都从最新 `dev` 创建新分支：

```bash
git switch dev
git pull --ff-only origin dev
git switch -c feat/<short-name>  # 修复使用 fix/<short-name>
```

- 不从 `main`、旧功能分支或其他集成分支创建 `feat/*`、`fix/*`，不复用旧分支。
- 一个分支只承载一项独立工作；提交信息使用 Conventional Commits，如 `feat:`、`fix:`、`docs:`、`test:`、`chore:`。
- 功能与修复 PR 的目标必须是 `dev`，使用 squash merge；发布流程使用 `release/* → main` 和 merge commit，详见 `docs/BRANCHING.md`。
- GitHub 已开启合并后自动删除远端源分支。

PR 合并后必须同步并回到 `dev`：

```bash
git switch dev
git pull --ff-only origin dev
git fetch --prune origin
git branch -D feat/<short-name>  # squash merge 后，确认 PR 已合并再删除
```

任务完成提交、PR 合并和远端同步后，本地当前分支必须停留在 `dev`。

## 8. 安全、数据与生产边界

- 仓库已公开，绝不能提交 `.env`、密钥、会话、恢复令牌或含私人信息的调试材料。
- `resumeToken` 是敏感凭证，不能仅凭 `playerId` 或房间码鉴权，也不能写入日志、公开 issue、截图或测试附件。
- `data/party.json` 等快照包含恢复令牌，等同敏感数据；不得提交或公开，生产持久卷必须受保护。
- 保持 Origin 校验、消息 schema 校验、请求体/帧大小限制和速率限制；放宽这些边界需要明确安全理由和测试。
- 当前产品无第三方字体或追踪请求；新增外部请求必须说明必要性，避免泄露房间或玩家数据。
- 线上 E2E 会操作真实生产房间；失败 trace 和截图可能包含昵称或会话信息，不得公开上传。
- release PR 合入 `main` 会触发生产部署，不要把普通功能 PR 直接指向 `main`。

## 9. 当前游戏与内容维护

当前游戏：

- `most-likely`：每轮秘密投给一名其他参与者，可改票，不能投自己；全员提交或 60 秒后揭晓，最高票得 1 分，平票共同得分，最后按累计分数排行。UI 提供 3、5、8 轮，房主负责开局、推进和再来一局。
- `piggy-bank`：3–12 人，秘密守护或砸罐、有限锤子、随机事件和保密落幕轮，服务端自动推进。
- `can-drive`：2–6 人，五类各 8 个零件，共 40 个；全员准备或组装截止后逐车进行 40 秒多环境展示，再逐车颁奖。没有分数和名次，最终全队合影，房主可保留车辆重开。

`most-likely` 题库位于 `packages/games/src/prompts.ts`，当前为 **100 道静态题、10 个类别**；每类编辑结构为 **6 道喜剧向 + 4 道轻松向**。修改题库时：

- 保持题目唯一、格式为“谁最可能……？”，避免仅换几个词的近重复。
- 优先使用具体动作、反差和轻微出糗制造笑点，避免敏感议题、身份攻击和针对玩家现实弱点的恶意评价。
- 保留 100 题及 60/40 编辑结构，除非需求明确要求改变；洗牌和同局不重复逻辑位于游戏状态机。
- 修改后校验总数、唯一性和规则测试。

不要只凭 UI 文案推断实际规则，以状态机和测试为准。车辆零件、环境、动画和镜头的新增内容必须遵守 `docs/CAR_ASSETS.md`，不得让 Three.js 对象进入领域状态或逐帧进入房间网络消息。旁观者下一局加入、房主离线后的推进、断线时未确认动作的 pending 状态等仍是薄弱边界；触及这些区域时先补回归测试。

## 10. 交付前检查清单

- [ ] 改动来自最新 `dev` 上的新 `feat/*` 或 `fix/*`，且没有修改无关内容。
- [ ] 服务端权限、私密视图、幂等和快照兼容未被绕过。
- [ ] 已添加或更新能证明业务行为的测试，而非只验证实现细节。
- [ ] 相关测试通过；进入 `dev` 前 `pnpm check:all` 和 CI 均通过。
- [ ] 未降低类型、覆盖率或安全要求，未提交生成物和敏感数据。
- [ ] 协议、架构、规则、命令或流程变化已同步到文档，必要时更新本文件。
- [ ] PR 目标正确；合并后远端源分支已删除，本地已同步并停留在 `dev`。
- [ ] 最终说明实际修改、验证结果和仍未解决的问题，不夸大完成度。

## 11. 详细文档索引

- `README.md`：项目概览、快速开始、部署入口与当前规则
- `docs/ARCHITECTURE.md`：权威状态机、操作路径、快照、恢复与扩容边界
- `docs/PROTOCOL.md`：HTTP/WebSocket 消息、Session、隐私与错误码
- `docs/TESTING.md`：TDD、测试分层、覆盖率与线上验收
- `docs/CAR_ASSETS.md`：车辆坐标、挂点、运动、动画、环境与奖项内容标准
- `docs/BRANCHING.md`：分支、PR、合并、发布和本地清理流程
- `docs/DEPLOYMENT.md`：生产部署、环境变量、更新与冒烟验证
