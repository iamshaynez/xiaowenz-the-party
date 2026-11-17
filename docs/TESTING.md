# TDD 与测试规范

## 原则

功能采用 RED → GREEN → REFACTOR：

1. 先从玩家、房主或攻击者的可见行为写失败测试。
2. 运行并确认失败原因是没有实现，而不是测试环境错误。
3. 写最小实现使场景通过。
4. 在测试保护下重构，保持严格类型检查。

测试不依据类名和私有方法堆砌，而依据业务场景命名。例如“全员提交后立即揭晓”“重复操作重发保持幂等”“服务重启后恢复票型”。

## 分层

- **business**：纯领域规则，快速覆盖所有阶段、平票、越权、非法输入和快照兼容；怪兽汽车重点覆盖五槽各八款/共 40 款、旧 ID 顺序、同种子计划一致性、固定种子 RNG golden、随机名次与零件无关、任意顺序时间采样、primary/多项 secondary/回退，以及再来一局和快照恢复后保留已提交 build。
- **network**：启动真实 Fastify 端口，通过 HTTP 和 `ws` 客户端验证鉴权、广播、私密视图、心跳、限流、多标签页、超时和重启；怪兽汽车额外验证多位客户端计划一致、新零件进入公开计划、racing 中途没有逐帧 `room` 快照、重启不重新随机，以及重开和再次重启后 build 仍一致。
- **ui**：React Testing Library 在 **jsdom** 中从角色、标签、按钮和可见文本验证用户行为；网络适配器可替换，但不 mock 被测组件。另有车库草稿、无 WebGL 的模型/运动/ShowPlan/相机纯函数与固定资源契约测试。该层不证明真实 WebSocket、GPU 帧、缩略图烘焙或音频输出。
- **e2e**：Playwright 启动生产服务，以多个隔离浏览器上下文完成完整对局、手机刷新恢复和再来一局；怪兽汽车场景在真实 Chromium 中检查 Three.js canvas、当前页四张模型缩略图、翻页选件、结果卡/庆典、两端一致名次，以及重开后仍选中已提交零件。只使用稳定阶段和最终/持久状态，不断言瞬时动画状态。

## 怪兽汽车：纯函数、jsdom 与真实 Chromium 的边界

怪兽汽车把同一项能力分给不同测试层，不能互相替代：

| 层 | 应证明的内容 | 不能据此声称的内容 |
| --- | --- | --- |
| business（Node） | 2–4 人、120 秒组装、3.2 秒倒计时、30 秒竞演与大时间跳跃；合法 build 与越权；协议/目录逐槽八款且保留旧 ID 顺序；同种子同计划；固定种子的 events/finishOrder/pace/finishAtMs golden，证明展示代码未改变赛事 RNG；交换新旧零件不改变 finishOrder/pace；任意顺序采样一致；多项 secondary 与司机/chassis 回退；版本 1 JSON 快照恢复；play-again 保留所有参与者已提交 build，重置其余状态并换新种子。 | 不证明浏览器动画、网络广播或 GPU 画面。 |
| network（真实 Fastify + `ws`） | 两位及四位客户端收到相同公开 builds/plan；新 ID 经真实协议接受并原样进入 racer/cues；非法动作在协议边界失败；幂等与冲突；racing 中途 tick 不发送逐帧 room；真实服务关闭/重启后 plan id、seed、finishOrder 和时间边界不变；再来一局两端保留提交 build，并在再次重启后恢复。 | 不证明 Three.js 能创建 WebGL 上下文、缩略图能烘焙或视觉反应正确；ShowPlan/天气/相机本来就不应出现在网络载荷中。 |
| ui（jsdom，面板行为） | `monster-car.test.tsx` mock `MonsterCarCanvas` 和 `PartThumbnail`，覆盖 lazy/Suspense、四款一页与翻页、装车选择、键盘跨页、pending、倒计时、真实采样函数驱动的 HUD、缩略图 emoji 回退、“惊喜一下”只改完整本地草稿且出发才提交、终局、5 秒结果卡自动收起、手动展开取消旧计时器和旁观者。当前 setup 还 mock 了 `matchMedia` 与二维码。 | 缩略图组件是 mock，不能据此声称生成了 data URL 或只有单个烘焙器；mock canvas 也不能证明 pointer capture、真实旋转或 GPU 换件动效。 |
| ui（jsdom，模型与运动契约） | `monster-car-rendering.test.tsx` 直接构造 40 款真实 `CarAssembly`，检查协议/目录/模型工厂一致、`setPart` 局部换件、所有声明反应在 `REACTION_LIBRARY` 有配置、组合姿态变换有限与 dispose；另检查细节实例化和缩略图排队取消，不创建 WebGLRenderer。 | 不证明像素、材质、头像旗纹理、相机、GPU 资源释放或真实动画观感。 |
| ui（jsdom，ShowPlan 与导演表现） | `monster-car-presentation.test.tsx` 检查 `CarIdentity` 稳定/有界且不依赖 race seed，六个故事与六种天气均可达，ShowPlan 为纯 JSON 且不保留可变输入引用；还覆盖不重叠社交组合/有界姿态、开场/事件/社交/终点相机任意顺序采样与平滑边界、竖屏/减少动效构图，以及 `WeatherField` 固定属性、只写 uniforms、减少动效和幂等 dispose。 | 不创建 GPU 上下文，不证明天气 shader 编译、实际像素、真实相机画面或浏览器事件时序。 |
| ui（jsdom，赛后庆典契约） | `monster-car-celebration.test.tsx` 检查 `samplePlaygroundMotion` 从终点平滑接入圆环、持续行驶/错相跳跃、任意顺序及极端时间采样；构造真实 `FireworksField` 检查固定种子与容量、shader/加法混合、绝对时间 uniforms、减少动效冻结和幂等 dispose。 | 不创建 GPU 上下文，不证明 shader 编译、烟花实际像素、暮色过渡观感或 RAF 连续播放。 |
| ui（jsdom，循环编队与合影相机） | `monster-car-finale.test.tsx` 对 2/3/4 辆车检查既有入场/圆环兼容、全部人数对应队形、20 秒循环、6.4–9.4 秒位置与车轮里程完全停稳、编队/返场边界连续、任意顺序与极端时间采样；并检查 `samplePlaygroundCamera` 在 results/photo、横竖屏下的安全边距及合影期间稳定。 | 不证明某一真实浏览器时刻正在合影，不检查截图像素，也不把纯函数中的 photo 布尔值当作网络阶段。 |
| e2e（真实 Chromium） | `tests/e2e/monster-car.spec.ts` 将车库矩阵与完整竞演拆成两个独立场景。车库场景验证当前页四张缩略图 loaded、翻页、精细模型、惊喜和旋转；竞演场景验证两名隔离玩家进入倒计时/竞演、两端故事一致、手机刷新恢复、最终 standings、结果卡/庆典条及重开后保留已提交司机。每条场景独立创建并关闭上下文，分别受 300 秒上限与浏览器错误收集约束。 | 不通过累计多个场景掩盖单场景超时；截图不等于天气/烟花/队形的自动像素断言，也不断言瞬时倒计时数字、反应、社交、镜头或合影画面。 |

`monster-car.test.tsx` 中的 `data-testid="monster-car-canvas"` 来自 mock `<div>`，其 `onFrame` 直接调用 `sampleMonsterCarFrame`；它能验证 React 数据流，却不能与 E2E 的真实 `<canvas data-render-engine="three.js">` 混为一谈。该文件的缩略图同样是可控 mock；真实 `PartThumbnailBaker` 的 WebP data URL 生成由 Chromium 的当前页 loaded 状态验收。无 WebGL 的 CarAssembly/ReactionLibrary 测试证明几何组装和运动通道稳定，ShowPlan/FinaleMotion 测试证明纯数据与任意时刻采样，WeatherField/FireworksField 测试证明固定 BufferGeometry/ShaderMaterial 契约；它们都不是 GPU 像素或完整真实资源释放证明。

**E2E 只断言可持续、可恢复的状态。** 出发后允许 `.mc-shell` 处于 `countdown|racing`，随后允许 `racing|finished`，避免软件 WebGL 和真实 30 秒计时造成时序脆弱；最终再等待确定的 `finished`、完整 standings、结果卡/庆典条和重开后的选中零件。不要用 E2E 固定等待并断言“握紧方向盘”、某个剩余秒数、途中名次、activeCue、社交文案、天气粒子、队形或相机坐标。320ms 预备、420ms 跟随、900ms 起步、0.45 秒换件和 20 秒合影 cycle 等精确视觉时序应在可控纯函数/组件层验证；浏览器截图只是证据附件，不是瞬时像素断言。

固定种子的赛事 golden 与 ShowPlan 测试承担不同职责：前者锁定 events、finishOrder、pace、finishAtMs，防止新增表现采样改变 RacePlan；后者证明身份/故事/社交/相机确定性和资源池不扩张。网络层再证明没有新增逐帧消息，三层不能互相替代。

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
- 修改 40 款零件目录时同时核对 protocol、catalog 与模型工厂键集合；新增反应必须有 `REACTION_LIBRARY` 配置，多项 secondary 必须验证独立时长与有限组合姿态。分页后网络/业务仍验证全部八款，UI/E2E 只挂载并等待当前页四款。
- 修改展示层时保持 RacePlan golden 不变；为 CarIdentity/ShowPlan/社交/相机补充确定性、纯 JSON、边界与任意顺序采样。天气 360/180、反应/彩纸 420/220、烟花 576/288 的池容量必须固定，更新只写既有 attributes/uniforms 并验证 dispose；不能用截图代替这些资源契约。
- 修改赛后庆典时分别覆盖 PlaygroundMotion、FinaleMotion 的 2/3/4 人队形与 20 秒循环、6.4–9.4 秒静止合影、PlaygroundCamera 安全构图、FireworksField 固定容量/降强度/dispose、结果卡计时器取消；真实缩略图、WebGL 画布与持久 UI 状态再由 Chromium 验收。
- 修改 play-again 时，在 business 验证 build 保留与赛事状态重置，在 network 验证多客户端一致及快照重启后仍保留，在 E2E 验证重开后可见选择；不要把本地未提交惊喜草稿当成应恢复状态。
- E2E 使用稳定阶段、最终名次与持久控件状态，不新增对瞬时倒计时、反应、天气、社交、队形或相机位置的定时断言。
- 失败截图、trace 和覆盖率文件不提交 Git。
