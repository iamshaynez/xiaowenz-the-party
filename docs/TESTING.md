# TDD 与测试规范

## 原则

功能采用 RED → GREEN → REFACTOR：

1. 先从玩家、房主或攻击者的可见行为写失败测试。
2. 运行并确认失败原因是没有实现，而不是测试环境错误。
3. 写最小实现使场景通过。
4. 在测试保护下重构，保持严格类型检查。

测试不依据类名和私有方法堆砌，而依据业务场景命名。例如“全员提交后立即揭晓”“重复操作重发保持幂等”“服务重启后恢复票型”。

## 分层

- **business**：纯领域规则，快速覆盖所有阶段、平票、越权、非法输入和快照兼容；怪兽汽车重点覆盖同种子计划一致性、随机名次与零件无关、任意顺序时间采样和反应解析，修改优先级或通用回退时须补对应领域回归。
- **network**：启动真实 Fastify 端口，通过 HTTP 和 `ws` 客户端验证鉴权、广播、私密视图、心跳、限流、多标签页、超时和重启；怪兽汽车额外验证公开计划一致、racing 中途没有逐帧 `room` 快照、重启不重新随机。
- **ui**：React Testing Library 在 **jsdom** 中从角色、标签、按钮和可见文本验证用户行为；网络适配器可替换，但不 mock 被测组件。该层不证明真实 WebSocket、WebGL、GPU 动画或音频输出。
- **e2e**：Playwright 启动生产服务，以多个隔离浏览器上下文完成完整对局、手机刷新恢复和再来一局；怪兽汽车场景在真实 Chromium 中检查 Three.js canvas、比赛反应、两端一致名次和移动刷新恢复。

## 怪兽汽车：纯函数、jsdom 与真实 Chromium 的边界

怪兽汽车把同一项能力分给不同测试层，不能互相替代：

| 层 | 应证明的内容 | 不能据此声称的内容 |
| --- | --- | --- |
| business（Node） | 2–4 人、120 秒组装、3.2 秒倒计时、30 秒竞演与大时间跳跃；合法 build 与越权；同种子同计划；交换零件不改变 finishOrder/pace；任意顺序采样一致；每个刺激都有 primary 与 secondary 回退；版本 1 JSON 快照恢复。 | 不证明浏览器动画、网络广播或 GPU 画面。 |
| network（真实 Fastify + `ws`） | 两端收到相同公开 builds/plan；非法动作在协议边界失败；幂等与冲突；racing 中途 tick 不发送逐帧 room；真实服务关闭/重启后 plan id、seed、finishOrder 和时间边界不变。 | 不证明 Three.js 能创建 WebGL 上下文或视觉反应正确。 |
| ui（jsdom） | `monster-car.test.tsx` mock `MonsterCarCanvas`，覆盖 lazy/Suspense、装车选择、pending、倒计时、由真实采样函数驱动的 HUD、终局和旁观者；`monster-car-rendering.test.tsx` 直接构造真实 `CarAssembly`，对 20 款零件与四种刺激检查有限变换和 dispose，不创建 WebGLRenderer。当前 setup 还 mock 了 `matchMedia` 与二维码。 | jsdom 没有真实 GPU/WebGL 帧管线，不能证明 canvas 正在渲染、相机/材质正确、30fps 限制、WebGL context loss 或 AudioContext 实际发声。 |
| e2e（真实 Chromium） | `tests/e2e/monster-car.spec.ts` 要求两个隔离 Chromium 上下文中的玩家看到 `data-render-state="running"` 的真实 canvas，经历组装、倒计时和竞演，检查反应卡、手机刷新后的画布与车辆、相同 standings、房主再来一局，并收集浏览器错误。 | 正常 `running` 场景本身不证明 WebGL 不可用时的 DOM 降级。 |

`monster-car.test.tsx` 中的 `data-testid="monster-car-canvas"` 来自 mock `<div>`，其 `onFrame` 直接调用 `sampleMonsterCarFrame`；它能验证 React 数据流，却不能与 E2E 的真实 `<canvas data-render-engine="three.js">` 混为一谈。无 WebGL 的 CarAssembly 测试证明的是几何组装和变换稳定，不是像素、光照或 GPU 资源释放结果。

业务和网络测试必须注入时钟/随机源，不要为了验证 120 秒或 30 秒规则真实等待。集成 E2E 可以真实走完 30 秒赛事，以覆盖绝对时间采样、动画和刷新恢复；两者目的不同。

不要以“jsdom 里出现了 `<canvas>`”替代真实渲染断言，也不要把 jsdom 中 WebGLRenderer 创建失败当作完整的降级测试。修改 WebGL 失败或上下文丢失逻辑时，应在 Chromium 中显式禁用 WebGL 或触发 `WEBGL_lose_context`，再验证 DOM 预览、装车操作和服务端结算仍可用。正常 WebGL 与降级路径需要分别陈述验证结果。

E2E 的怪兽汽车截图写入 `artifacts/monster-car/`；这些文件可能含昵称或房间信息，不提交或公开上传。

## 门禁

`pnpm check:all` 依次执行：

1. 业务/E2E 以及所有工作区的 TypeScript 检查。
2. 业务与网络测试及覆盖率阈值。
3. UI 行为测试。
4. 生产构建。
5. 真实浏览器 E2E。

覆盖率全局最低：语句 85%、函数 85%、分支 80%、行 85%。不得为了让 CI 变绿而降低阈值或删除有意义的断言。

## 线上多人验收

一个人也可以验证生产环境，无需多部手机：

```bash
pnpm test:e2e:online
# 观看多个虚拟玩家的实际操作
pnpm test:e2e:online -- --headed
```

该命令通过 `PARTY_BASE_URL=https://party.xiaowenz.com` 禁用本地 `webServer`，让现有多浏览器场景直接访问生产环境。也可将 `PARTY_BASE_URL` 指向其他已部署环境。

线上测试使用真实房间和真实 WebSocket；测试结束后浏览器断开，房间按闲置 TTL 自动过期。失败时保留 trace 与截图，不得在公开 issue 中上传含私人昵称或会话信息的调试材料。

## 新增测试的要求

- 一个场景只验证一个业务承诺，但允许包含完整用户流程。
- 网络测试不能使用 mock WebSocket 替代真实连接。
- 对私密信息不仅检查 UI，还检查实际网络载荷。
- 每个异步测试必须有超时和可靠清理，避免悬挂端口。
- 不依赖固定房间码、随机题目或真实等待 60/120 秒；通过注入时钟/随机数控制边界。怪兽汽车采样测试直接传入多个绝对赛事毫秒值，不依赖前一帧。
- 涉及 `RacePlan` 的网络测试检查实际公开载荷及 racing 中途无逐帧 room，不把客户端本地 frame 当成协议消息。
- 失败截图、trace 和覆盖率文件不提交 Git。
