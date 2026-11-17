# 架构与扩展指南

## 核心决策

碰头不是“把任意客户端状态转发给其他客户端”的 relay，而是按房间隔离的权威状态机服务：

- 客户端只表达意图，例如投票、下一轮、再来一局。
- 服务端验证身份、阶段、轮次、目标与操作幂等。
- 随机题目、倒计时、揭晓、计分，以及怪兽汽车的赛事计划与随机名次全部由服务端执行。
- 每名玩家收到单独的视图，私密投票不通过“前端隐藏”实现。
- 房主只是权限角色，不是实际游戏主机；房主设备关闭后计时仍继续。

## 一次操作的路径

```text
浏览器动作
  → WebSocket schema 校验
  → 会话与速率校验
  → actionId 幂等检查
  → RoomService
  → PartyRoom
  → GameDefinition.act
  → version + 1
  → 保存 actionId 指纹
  → action-ack
  → 为每个玩家生成裁剪视图并广播
  → 20ms 合并快照（关闭服务时强制落盘）
```

浏览器使用 `room.version` 丢弃过期状态。`actionId` 由客户端生成 UUID；同一玩家重复发送相同动作返回原 ack，不同内容复用动作号会收到 `ACTION_CONFLICT`。

## 游戏边界

每个游戏实现 `GameDefinition<State, View>`：

- `create`：根据参与者、轮数、服务端随机数创建状态。
- `act`：处理受限动作，非法操作抛 `DomainError`。
- `advanceTime`：推进服务端计时，返回是否发生变化。
- `view`：生成某个玩家的视图。
- `isFinished`：通知房间进入总结阶段。

新增一款游戏的推荐顺序：

1. 先在 `tests/business` 写玩家完整对局和越权场景。
2. 在 `packages/games` 实现纯状态机，不在游戏规则中访问 WebSocket、数据库或 DOM。
3. 将游戏加入 `gameRegistry` 和共享动作 schema。
4. 在 Web 增加对应视图组件；复用大厅、连接、恢复和房间能力。
5. 加真实多客户端测试，再增加浏览器 E2E。

游戏状态必须可 `structuredClone`，以便快照恢复。发布不兼容规则时提升 `version`；旧版本快照会明确拒绝，而不是静默加载成错误状态。

## 怪兽汽车：公开计划与本地竞演

### 权威状态机

`monster-car` 当前 `version: 1`，只接受 `rounds: 1` 和 2–4 名参与者。游戏内部阶段与房间外层阶段不同：内部 `finished` 之前，房间保持 `playing`；内部到达 `finished` 后，房间才进入 `finished`。

| 内部阶段 | 进入条件与权威行为 |
| --- | --- |
| `building` | 创建时为每位参与者生成完整默认车辆，组装截止时间为 `now + 120_000ms`。只有参与者能提交 `build-car`；提交会保存五槽完整 build 并标记 ready，截止前可用新动作继续改装。全员 ready 时立即进入倒计时。 |
| `countdown` | 由全员最后一次提交时的 `now`，或组装超时时的 `buildingDeadlineAt` 起算，持续 `3_200ms`。此阶段一次性创建 `RacePlan`，设置 `raceStartsAt` 和 `raceEndsAt = raceStartsAt + 30_000ms`，此后不能再改装。未 ready 玩家保留当前车辆并自动出发。 |
| `racing` | 服务端时间到达 `raceStartsAt` 后进入，持续 30 秒。服务端不接收车辆位置、速度或名次。 |
| `finished` | 到达 `raceEndsAt` 后由服务端从计划的 `finishOrder` 生成公开 `standings`，包含 place、finishAtMs 和 highlight。此后权威阶段保持 `finished`；云朵操场、循环编队合影、烟花和结果卡收起都只是浏览器展示。只有房主能 `play-again`；新局保留每名参与者最后提交的 build，重置 ready/plan/时间边界/standings，并以新种子回到 `building`。 |

`advanceTime` 只根据注入的 `now` 判断边界；一次跨过多个边界的大时间跳跃可以直接完成比赛，不要求逐帧调用，也不依赖房主浏览器在线。

### `RacePlan` 与任意时刻采样

`packages/games/src/monster-car/race.ts` 用开局保存的 32 位种子和独立伪随机数生成器创建计划。计划只包含字符串、数字、数组和普通对象，可 `structuredClone`、JSON 序列化并直接放进房间视图。展示层不得向这条 RNG 流追加采样；固定种子的 events、finishOrder、pace 与 finishAtMs 由 golden 业务测试守护。

- `events` 为六个赛道事件，进度固定为 0.15、0.30、0.46、0.62、0.78、0.88；环境从水坑、木头、阵风、山坡中选择，相邻事件不重复，另有 0–2 的外观 variant。
- `finishOrder` 是玩家 ID 的随机洗牌。洗牌和配速生成不读取零件定义，因此同种子下交换或修改 builds 不会改变完赛顺序或 pace；零件只影响模型、反应提示和高光。
- 每名 racer 包含 build、lane、paint、finishAtMs、六段配速的关键帧 `pace`、每个事件的反应 `cues` 和 highlight。名次对应的完赛时刻从 28,600ms 起按 280ms 间隔排列，均落在 30 秒赛事内。
- `id` 由创建时间与种子构成，用于识别同一场比赛；`seed`、`durationMs`、事件、 racers 与 `finishOrder` 全量保留。

`sampleMonsterCarFrame(plan, requestedAtMs)` 是无状态纯函数，不是网络消息。它先把时间截断到 `[0, durationMs]`，再对 pace 线性插值，按当前进度计算 leader/place，并从绝对时间窗口找出 activeCue 及其 `localProgress`。结果不依赖上一帧或调用顺序，所以可以按 0 → 7,777 → 4,321 → 30,000ms 等任意顺序采样；刷新后也不需要补收历史帧。

浏览器在 `requestAnimationFrame` 中用 `raceStartsAt` 与当前绝对时间计算 elapsed，再调用同一个共享纯函数。Three.js 场景每个显示帧采样，React HUD 最多每 125ms 接收一次本地 frame；这些都不产生网络流量。服务端 tick 在没有状态变化时不广播 `room`，只在装车、阶段切换、连接状态变化等实际变更时同步视图。最终 standings 仍由服务端生成，而不是采用某个浏览器上报的结果。

从倒计时开始，所有参与者与旁观者都会收到相同 builds、完整 plan 和时间边界。虽然 `standings` 到 `finished` 才填充，`plan.finishOrder` 已经公开；该游戏不提供“赛前隐藏名次”的隐私保证。

### 零件反应与回退

五槽各有八个合法 ID，共 40 款零件；原有 20 个 ID 及其相对顺序全部保留，新增 ID 是版本 1 的加法扩展。水坑、木头、阵风、山坡分别映射为 `water`、`impact`、`wind`、`slope` 四种刺激。`resolveMonsterCarReaction` 按刺激对应的槽位优先级寻找第一个零件专属反应，生成带 reaction ID、durationMs、intensity 和 highlight 的 primary；找不到时使用 `chassis` 通用反应，不让事件消失。

`secondary` 是数组：除 primary 所在槽位和 driver 外，其他有该刺激专属响应的槽位按同一优先级依次加入；最后再追加司机专属/通用反应。若 primary 已来自司机，最后追加的则是 `chassis-wiggle`，避免重复司机主反应。因此一个 cue 可有多个不同零件的次要反应，而不是只有一项司机反应。

反应在创建计划时解析并序列化进 cues，渲染器只消费结果。`ReactionLibrary` 把持久化 reaction ID 映射为可组合运动通道：primary 驱动整车姿态和主零件，secondary 按各自 `durationMs` 独立计算进度并叠加到对应零件/司机；反应粒子只选择 primary 配置的类型。未知反应在表现层按刺激回退。所有反应均不改变 pace、finishAtMs 或 finishOrder，动画与粒子不是数值加成系统。完整目录、优先级和资产实现见 `docs/CAR_ASSETS.md`。

`ReactionPerformance` 只在浏览器为既有 cue 加一层绝对时间包装：正常模式从 `startAtMs - 320ms` 开始预备，在 primary 与最长 secondary 结束后保留至多 420ms 跟随；减少动效时取消这两段扩展。预备让悬挂下沉、司机回望，跟随只叠加轻微回摆。包装器的 localProgress 供既有运动函数截断，不修改 cue，也不延长 HUD/音效的权威反应窗口。

### 纯本地 `ShowPlan`：身份、故事、社交与相机

`createMonsterCarShowPlan(plan, players)` 是浏览器展示层的纯函数。它只读取公开 RacePlan 与 `room.players` 的 id/avatar，返回可 JSON 序列化且与输入脱离引用的 `{ identities, avatars, story, socialMoments, finaleSeed }`；不保留或修改输入对象，不写入游戏状态、网络消息或房间快照。所有随机选择使用 `presentation/deterministic.ts` 中按用途隔离的哈希/局部流，与 `createMonsterCarRacePlan` 的 RNG 完全分离。

#### 每车身份与旗帜

`CarIdentity` 以 playerId、公开 avatar 和参与者索引稳定生成，不依赖赛事 seed。baseColor、accentColor、dots/stripes/stars/checker 花纹、车身长宽高的轻微缩放和悬挂相位均按具名 purpose 派生；旗帜编号为 `participantIndex % 99 + 1`。`CarAssembly` 将身份比例应用到车身与轮距，用相位错开悬挂起伏，并增加围巾、车身花纹和 CanvasTexture 头像旗；本人车辆另有本地光环。旗帜 2D canvas 不可用时会退回纯色材质，纹理由模型 dispose 一并释放。身份改变的是外观，不是碰撞、速度或名次。

#### 六个故事与固定天气池

ShowPlan 根据 plan id/seed 选择六个故事之一：**萤火虫森林、雨滴交响曲、花瓣野餐会、鲜花巡游、橡果沙沙谷、灯笼星光夜**，分别绑定 `fireflies`、`rain`、`petals`、`flowers`、`acorns`、`lanterns`。每个故事还携带日间/暮色三色天空、雾色、背景色、阳光色和装饰 variant；`CourseVisual` 消费这些普通数据，`WeatherField` 用单个固定容量 `THREE.Points` 和 shader 表现天气。天气更新只写时间、焦点与减少动效 uniforms，不读取赛事 RNG。

#### 不重叠的社交时刻与导演相机

`createSocialMoments` 将 racers 确定性轮转后分成互不重复的两人组合：2/3 辆车安排 1 段，4 辆车安排 2 段。通用挥手之外，鸭子组合、雨伞、泡泡浴缸、幽灵、狮子和香蕉轮可触发专属互动；actor、target、开始时间、2.1–2.5 秒时长和文案都是 ShowPlan 数据。`sampleSocialMoment` 按绝对时间选择唯一活动区间，`sampleSocialPose` 用有界包络计算欢呼、对视与倾斜，不积累上一帧状态。

`sampleRaceCamera` 同样只依赖 ShowPlan、绝对时间、当前共享赛事帧与 aspect：开场镜头平滑接入车队全景，事件期间聚焦反应车辆，社交期间框住 actor/target，27 秒或头车接近终点时转向终点；各镜头按边界 cross-fade，事件镜头优先于社交。竖屏与减少动效模式扩大构图并调整距离。相机采样不修改 ShowPlan/frame，丢帧、倒序采样或刷新不会累计漂移，也不会发送镜头消息。

### Three.js 加载、生命周期与 DOM 降级

`GamePanel` 通过 `React.lazy(() => import(...))` 仅在 `room.game.id === 'monster-car'` 时加载怪兽汽车面板；Three.js 和渲染实现随这个异步面板 chunk 加载，其他两款游戏不直接初始化它，加载期间显示车库 Suspense 文案。

所有车辆、头像旗、缩略图、车库、赛道、树木、河流、事件、终点、天气、反应粒子与烟花都由 Three.js 几何体、实例化网格、点缓冲、2D canvas 纹理和内联 shader 程序化生成；音效由 Web Audio oscillator 合成。当前没有 GLTF/外部贴图/HDR/音频文件请求，也不需要外部资产 CDN。缩略图是本地生成的 WebP data URL，不是远程图片。

`MonsterCarCanvas` 挂载时创建一个 `MonsterCarWorld` 和一个 `RenderSurface`，卸载时取消动画帧、断开 `ResizeObserver`、移除 context-lost 监听，并释放车辆/赛道几何体、材质、头像纹理、阴影、固定粒子池、renderer 和 canvas；`Soundscape` 同时关闭 AudioContext。RenderSurface 在桌面与移动端都限制到约 30fps；赛后庆典在减少动效偏好下降至约 5fps。移动端另降低模型/场景细节、pixel ratio 并关闭阴影，隐藏标签页跳过绘制。

资源有明确上限：每个世界的 `ParticleField` 固定 420（详细）/220（紧凑）实例，`WeatherField` 固定 360/180 点；首次进入赛后只建一个 `FireworksField`，固定 576/288 点。天气和烟花更新只改 uniforms，反应/彩纸每帧在既有实例池内重建，均不随运行时长扩张。故事装饰、森林与花草使用实例化网格；减少动效偏好会削弱装饰运动、冻结天气/烟花时间并降低强度，但不改变权威时间与名次。

WebGLRenderer 创建失败，或运行中触发 `webglcontextlost` 时，面板切换到 DOM 汽车预览/森林场景。装车控件、阶段文本和服务端结算仍可使用，但 DOM 视图不是完整 Three.js 动画的等效替代，也不负责推进比赛。真实 WebGL 路径只能由浏览器 E2E 证明，不能由 jsdom 中 canvas 是否存在来证明。

### 共享模型、局部换件与缩略图

`rendering/models/` 按槽位维护与协议 ID 精确对应的工厂注册表，`createPartModel(slot, partId)` 同时服务整车 `CarAssembly` 和 `PartThumbnailBaker`，避免主场景和货架各维护一套外观。车库中 draft 改变时，`MonsterCarWorld` 对变化槽位调用 `CarAssembly.setPart`：移除并 dispose 旧槽位模型，保留整车根节点、身份、底盘和未变化零件；相同槽位/零件不重复构建，只有进入新车库或身份/车身 paint 改变等情形才重建整车。新零件安装后有 0.45 秒本地弹跳/放大，减少动效时直接清除换件动画。

车库预览的横向 pointer drag 通过 pointer capture 调整本地 `garageYaw`，左右方向键提供同等旋转；拖出、取消和丢失 capture 都结束手势，不发送动作。每槽货架只挂载当前页四款，前后翻页与零件方向键会自动跨页并恢复焦点。“惊喜一下”调用本地 `surpriseCarBuild`，为每槽从七个不同备选 ID 中选一项；默认随机源是浏览器 `Math.random`，不是服务端 RNG。它只更新 draft，必须再点击出发才通过既有 `build-car` 提交，旁观者没有这些编辑控件。竞演最初 900ms 的 sine 前冲同样只是视觉偏移，不写回 progress。

全局只有一个 `partThumbnailBaker`。它按需创建一个 240×180 的临时 WebGLRenderer，按队列每次烘焙一个共享工厂模型，将结果以 `slot:partId` 为键缓存为静态 WebP data URL，并合并同键 pending 请求。React 选项只渲染缓存的 `<img>`、加载占位或 emoji 回退，不持有自己的 canvas/WebGL 上下文。每个任务释放临时模型和地面，空闲 2 秒后释放 renderer；缓存的 data URL 保留以便后续槽位切换复用。缩略图失败或 WebGL 降级不会禁用零件名称、选择和提交。

### `finished` 后的本地持续庆典

服务端到 `raceEndsAt` 后仍只进入 `finished`，浏览器用 `max(0, rawElapsed - plan.durationMs)` 得到赛后时间。`sampleFinaleMotion(plan, celebrationMs)` 在既有 `samplePlaygroundMotion` 之上按绝对时间编排，不保存模拟游标：最初 1.5 秒仍从最终路面平滑进入环形车道；此后持续绕行，同时把停稳合影占用的里程从车轮动画中扣除。

赛后每 20 秒重复一次完整编舞：0–5 秒绕行，5.0–6.4 秒平滑驶入队形，6.4–9.4 秒所有车辆完全静止合影，9.4–11.4 秒平滑返场，其余时间继续绕行。队形按当前 racers 数量选择并随 cycle 轮换：2 辆为并排/面对面，3 辆为三角/弧线，4 辆为横列/菱形/2×2。合影期间位置、朝向、跳跃和 travelDistance 均保持不变；循环边界仍由同一纯函数直接计算，任意顺序与长时间采样一致。

`samplePlaygroundCamera` 根据去掉跳跃高度后的整车边界和 aspect 构图，用旋转不变的包围半径容纳圆环运动。结果卡模式在桌面右侧、竖屏底部预留空间；收起结果卡后使用更集中的 photo 模式，并在真实合影窗进一步收紧且保持相机稳定。空车队和非法 aspect 有有限回退。合影时烟花 intensity 降为 0.55，但不改变赛后时间或 standings。

首次进入赛后庆典时创建一次 `FireworksField`，以固定种子的 TypedArray 属性和单个 `THREE.Points`/ShaderMaterial 在 GPU 上循环计算烟花；更新只修改时间/减少动效/强度 uniforms，不扩张或替换粒子池。`CourseVisual` 将当前故事的日间三色在两秒内平滑过渡到对应暮色。赛后本地 HUD 仍采样被截断到 30 秒的最终赛事帧；车辆、阴影、司机庆祝、彩纸、天气和烟花均不发送网络消息。

结果卡在进入每一场 `finished` 时展开，5 秒后自动收起为庆典条。点击“看车车和礼花”会提前收起，点击“查看名次”会重新展开；两种手动操作都清除旧的自动收起计时器，因此重新展开不会被旧计时器再次关闭。阶段/赛事切换和卸载会清理计时器，房主在卡片或庆典条上发起的仍是既有 `play-again`。

## 连接与在线状态

- REST 创建或加入后返回 `sessionId + playerId + resumeToken`。
- WebSocket 首条消息必须鉴权，5 秒超时。
- 同一玩家可有多个连接；最后一个连接关闭才标记离线。
- 服务端 30 秒发送协议 ping；65 秒无消息/pong 且最后 ping 已超时，则终止假在线连接。
- 浏览器指数退避重连，并使用本地恢复令牌找回座位。
- 恢复服务端快照时，所有玩家先标记离线，真正鉴权后才恢复在线。

## 快照

`RoomPersistence` 将房间、游戏状态、会话与幂等记录序列化为 JSON：

- 变更后 20ms 合并写入，避免每个网络包都刷盘。
- 临时文件写入后原子 rename。
- 文件权限 `0600`，目录默认 `0700`。
- 正常关闭时等待最后快照落盘。
- 启动时跳过已过期房间，并校验游戏版本。

房间快照外壳当前为 `schemaVersion: 1`，怪兽汽车游戏快照也为 `version: 1`。其 state 保存参与者、种子、builds、ready 状态、组装/开赛/完赛时间边界、完整 plan 与 standings；竞演中重启后仍使用同一 plan id、seed、finishOrder 和绝对时间，不根据新随机源重掷。五槽扩展只追加了 20 个合法 ID，原有 20 个 ID、build/plan 字段与 `secondary` 数组形状未变，因而旧版本 1 快照仍可加载，无需版本提升或迁移；恢复含新 ID 的快照则需要包含这些 ID 的当前实现。游戏版本不匹配时以 `SNAPSHOT_INCOMPATIBLE` 拒绝恢复。

客户端重连后拿到同一计划，再按当前绝对时间采样即可；赛后操场与循环合影时间同样由既有时间边界推导。`CarIdentity`、ShowPlan、故事/天气、社交、相机和合影 cycle 都可从公开 plan/玩家资料重建，不增加快照字段。已结束版本 1 快照恢复后再来一局，仍保留快照中每名参与者最后提交的 build；未提交的本地“惊喜”草稿不是权威状态，不会跨重开保留。

快照含恢复令牌，等同于敏感数据。生产环境必须保护持久卷，定期备份是否必要由产品决定；房间默认闲置两小时后过期。

## 单实例边界与扩容

当前权威房间驻留单个 Node 进程，这也是保持系统轻量和一致性的关键。水平扩容不能简单地增加副本。

后续可选路线：

1. 按房间码一致性哈希路由到实例，并使用共享会话索引。
2. 将房间 actor 迁移到支持 WebSocket 的 Durable Objects 类运行时。
3. 以 Redis/数据库保存快照与路由，配合跨实例 pub/sub。

只有当真实连接数、CPU 或地域延迟证明有必要时才做。第一版不引入分布式锁和复杂消息队列。

## 前端可测试性

`PartyServices` 是浏览器适配器边界。UI 测试使用内存服务验证用户行为，生产服务则使用同源 `/api` 与 `/ws`。游戏组件不直接创建 WebSocket，方便独立测试与后续增加游戏。
