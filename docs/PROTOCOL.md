# HTTP / WebSocket 协议

所有接口同源。生产环境使用 HTTPS 和 WSS。所有请求与帧均为 JSON；WebSocket 最大 4096 字节，HTTP body 最大 16 KiB。

## HTTP

### `POST /api/rooms`

```json
{ "nickname": "小文", "avatar": "🦊" }
```

返回 `201` 和 `Session`。

### `POST /api/rooms/:code/join`

请求同上，返回 `200` 和 `Session`。房间不存在为 `404 ROOM_NOT_FOUND`，昵称重复为 `409 NICKNAME_TAKEN`。

### `GET /api/config`

返回预置头像与公开游戏元数据（`id`、`version`、`name`、`emoji`、`description`、`tags`、`roundsOptions`、`minPlayers`、`maxPlayers`），不含任何房间或会话信息。

### `GET /api/health`

```json
{ "status": "ok", "activeRooms": 3, "connections": 8, "now": 1760000000000 }
```

不包含房间码或玩家信息。

## Session

```json
{
  "sessionId": "s_…",
  "playerId": "p_…",
  "roomCode": "ABC234",
  "resumeToken": "rt_…",
  "room": { "code": "ABC234", "phase": "lobby", "ownerId": "p_…", "version": 1, "players": [], "game": null }
}
```

`resumeToken` 是敏感凭证，只出现在本人会话中。不能仅凭 `playerId` 或房间码鉴权。

## 客户端 WebSocket 消息

连接 `/ws` 后首先发送：

```json
{ "type": "authenticate", "sessionId": "s_…", "resumeToken": "rt_…" }
```

开局（`gameId` 取 `most-likely`、`piggy-bank` 或 `monster-car`；轮数在 1–8 间，具体可选值由各游戏决定，如「存钱罐」支持 4/6/8，「怪兽汽车」只接受 1）：

```json
{ "type": "start-game", "actionId": "web-uuid", "gameId": "most-likely", "rounds": 3 }
```

游戏动作按当前游戏校验。「谁最可能」：

```json
{ "type": "game-action", "actionId": "web-uuid", "action": { "type": "cast-vote", "targetId": "p_…" } }
{ "type": "next-round" }
{ "type": "play-again" }
```

「存钱罐」（`choice` 为 `guard` 或 `smash`；轮次推进由服务端自动完成，没有 `next-round`）：

```json
{ "type": "game-action", "actionId": "web-uuid", "action": { "type": "choose", "choice": "smash" } }
{ "type": "play-again" }
```

「怪兽汽车」（2–4 人，`start-game` 使用 `rounds: 1`；没有 `next-round`）：

```json
{
  "type": "game-action",
  "actionId": "web-uuid",
  "action": {
    "type": "build-car",
    "build": {
      "wheels": "spring",
      "front": "duck",
      "rear": "rocket",
      "roof": "umbrella",
      "driver": "frog"
    }
  }
}
{ "type": "game-action", "actionId": "web-uuid", "action": { "type": "play-again" } }
```

`build` 是 strict 对象，必须恰好包含五个槽位。可选 ID 为：

| 槽位 | 合法零件 ID |
| --- | --- |
| `wheels` | `classic` / `donut` / `spring` / `balloon` / `banana` / `square` / `bubble-tea` / `duck-float` |
| `front` | `smile` / `duck` / `train` / `scoop` / `shark` / `vacuum` / `ice-cream` / `piano` |
| `rear` | `trunk` / `rocket` / `bubble` / `tail` / `washing-machine` / `campfire` / `jackbox` / `snail` |
| `roof` | `mushroom` / `umbrella` / `propeller` / `antenna` / `teapot` / `birdcage` / `cactus` / `whale` |
| `driver` | `bear` / `frog` / `duck` / `alien` / `robot` / `penguin` / `ghost` / `lion` |

缺件、额外字段、非法零件或错误动作形状在 WebSocket schema 边界返回 `INVALID_MESSAGE`。`build-car` 仅限本局参与者且只能在 `building` 使用；每次成功提交会保存 build 并标记 ready，准备后仍可用**新的** `actionId` 改装。同一动作重发沿用通用幂等规则，同 `actionId` 换 build 返回 `ACTION_CONFLICT`。`play-again` 只允许房主在 `finished` 使用。

当前五槽各八款、共 40 个合法 ID。此次扩展保留全部旧 ID 及其数组顺序，只在各槽末尾追加新 ID；`monster-car` 游戏版本和房间快照 `schemaVersion` 都保持 1。旧版本 1 build/plan 快照因此仍可恢复，且不需要新增协议字段；包含新 ID 的快照不能回滚给只认识旧 20 款的实现。

离开与 ping：

```json
{ "type": "leave-room", "actionId": "web-uuid" }
{ "type": "ping" }
```

## 服务端消息

- `ready`：鉴权成功，携带本人 Session 与房间视图。
- `room`：裁剪后的最新房间视图。
- `action-ack`：包含 `actionId` 和被接受时的 `version`。
- `error`：包含稳定 `code`、用户可读 `message`，以及可选 `actionId`。
- `pong`：应用层 ping 响应；协议级 ping/pong 另用于心跳。

投票阶段不会向其他玩家发送 `votes` 或 `ownVote`。其他玩家只能看到谁已提交；揭晓后才公开票型。

「存钱罐」的抉择同理：他人的 `ownChoice`、保密的落幕轮 `finalRound` 与暗牌事件（纸糊罐、警报轮）在揭晓前不会出现在任何玩家的视图里；盲罐轮期间 `pot` 为 `null`。

## 怪兽汽车公开赛事视图

`ready`、`room` 中的 `room.game` 在怪兽汽车开局后为以下结构。它与投票/抉择游戏不同：**builds 和赛事计划对所有参与者及旁观者公开**。

```ts
interface MonsterCarView {
  id: 'monster-car';
  phase: 'building' | 'countdown' | 'racing' | 'finished';
  participantIds: string[];
  builds: Record<string, MonsterCarBuild>;
  readyPlayerIds: string[];
  buildingDeadlineAt: number;
  raceStartsAt: number | null;
  raceEndsAt: number | null;
  plan: MonsterCarRacePlan | null;
  standings: Array<{
    playerId: string;
    place: number;
    finishAtMs: number;
    highlight: string;
  }>;
}
```

`buildingDeadlineAt`、`raceStartsAt`、`raceEndsAt` 都是与服务端 `Date.now()` 同时间轴的毫秒时间戳。开局时组装期限为 120 秒；全员提交或期限到达后进入 3.2 秒 `countdown`，同时设置开赛和 30 秒后的完赛时间。`building` 时后两个字段与 plan 为 `null`，从 `countdown` 起 plan 一直存在；`standings` 仅在 `finished` 返回结果。

### `MonsterCarRacePlan`

```ts
interface MonsterCarRacePlan {
  id: string;
  seed: number;
  durationMs: 30_000;
  events: MonsterCarCourseEvent[]; // 六项
  racers: MonsterCarRacerPlan[];   // 每位参与者一项
  finishOrder: string[];
}
```

| 字段 | 内容 |
| --- | --- |
| `events[]` | `id`、`kind`、`stimulus`、`progress`、`variant`。`kind` 为 `puddle` / `log` / `gust` / `hill`，分别映射 `water` / `impact` / `wind` / `slope`；六项进度为 0.15、0.30、0.46、0.62、0.78、0.88，variant 为 0–2。 |
| `racers[]` | `playerId`、公开 `build`、`lane`、`paint`、`finishAtMs`、`pace`、`cues`、`highlight`。lane/paint 是展示属性，不是权限或成绩输入。 |
| `pace[]` | `{ atMs, progress }` 关键帧；从 `{ 0, 0 }` 到 `{ finishAtMs, 1 }`，共六段配速。 |
| `cues[]` | 每个赛道事件对应一项：`eventId`、`environment`、`stimulus`、`startAtMs`、`durationMs`、`intensity`、`primary`、`secondary`。 |
| `primary` / `secondary[]` | 一项主反应与至少一项次要反应；每项均为 `reaction`、`durationMs`、`intensity`、`highlight`、`partId`、`slot`。slot 可为五槽之一或 `chassis`。 |
| `finishOrder` | 服务端用种子洗牌的玩家 ID 顺序；终局 standings 必须按它生成。零件不影响该顺序或 pace。 |

整个 plan 可 JSON 序列化，并保存在游戏版本 1 的房间快照中。比赛中服务重启或玩家重连会恢复同一 plan 和时间边界，不重新生成种子或名次。

**公开性边界**：`standings` 虽在 `finished` 才填充，但 `plan.finishOrder` 从 `countdown` 起已经随完整计划发送；它以及 builds、cues、highlight 都不是秘密。不要根据“结算尚未展示”推断网络载荷隐藏了最终顺序。

### 本地采样，不是逐帧协议

共享纯函数 `sampleMonsterCarFrame(plan, requestedAtMs)` 将时间限制在 0–30,000ms，对 pace 插值并计算当前 leader、每辆车 place 和 activeCue。返回的 `activeCue.localProgress` 是 0–1 的本地反应进度。函数不保存前一帧，因此同一计划、同一时刻以任意调用顺序采样都会得到相同结果；完赛后的短暂视觉滑行可让 progress 略大于 1，但不改变 finishOrder。

浏览器在 ready/重连后发送现有 `ping`，用 `pong.now` 与往返中点估算服务端时钟偏移，再根据 `raceStartsAt` 计算 elapsed 并在本地 `requestAnimationFrame` 中采样。该偏移只校正显示，不成为权威输入。`MonsterCarRaceFrame`、车辆坐标与 HUD 更新**不是 WebSocket 消息类型**，客户端不能通过它们提交位置或名次。服务端在 racing 中途没有业务变化时不发送周期性 `room` 帧，只在进入 `racing`、进入 `finished` 等其他状态变化时同步。WebGL 降级路径也调用同一纯采样函数，不依赖 canvas 提供 HUD 帧。

进入 `finished` 后，权威视图、时间边界和 standings 均保持既有结构。`PlaygroundMotion` 只根据同一 plan 与本地赛后绝对时间持续计算绕行/跳跃，`FireworksField` 和结果卡自动收起也都发生在浏览器；没有 `celebrating` 阶段、赛后位置消息、结果卡计时消息或新增快照字段。

### 反应协议与通用回退

`resolveMonsterCarReaction(build, stimulus)` 在创建计划时解析反应。对每种刺激，按以下顺序找第一个声明了专属响应的槽位：

| 刺激 | 槽位优先级 |
| --- | --- |
| `water` | front → wheels → roof → driver → rear |
| `impact` | wheels → roof → front → driver → rear |
| `wind` | roof → rear → driver → wheels → front |
| `slope` | wheels → rear → roof → front → driver |

没有专属响应时，primary 使用 `partId: "chassis"`、`slot: "chassis"` 的通用反应：`classic-splash`、`classic-bump`、`classic-wind` 或 `classic-slope`。

`secondary` 数组先按同一槽位优先级收集所有满足以下条件的专属响应：槽位不是 driver，且不是 primary 所在槽位。随后追加一项司机反应：司机有专属响应时复用其 reaction/highlight，否则使用 `driver-water` / `driver-impact` / `driver-wind` / `driver-slope` 和“最佳乘客表情”；普通司机项的 intensity 为 0.55，时长为 `min(primary.durationMs, 1100ms)`。若 primary 来自 driver，则不再追加司机项，而追加 `partId/slot: "chassis"` 的 `chassis-wiggle`（900ms、intensity 0.45、highlight“快乐车身”）。因此每个 cue 至少有一项 secondary，也可能同时包含多个非主零件的专属响应。

这些反应在创建计划时解析并持久化到既有 cue 字段中。渲染端 primary 驱动整车和主零件，secondary 按各自时长独立采样并叠加局部动作；反应粒子只采用 primary 的粒子类型。反应只驱动外观、粒子和高光，不影响配速或名次。40 款零件的响应以 `packages/games/src/monster-car/parts.ts` 为目录真源，运动配置以 `ReactionLibrary.ts` 为真源；资产边界和维护规则见 [怪兽汽车资产与反应协议](CAR_ASSETS.md)，文档不另复制一张容易失配的完整反应表。

## 常见错误码

- `AUTH_REQUIRED` / `AUTH_FAILED` / `AUTH_TIMEOUT`
- `INVALID_MESSAGE` / `INVALID_INPUT` / `PAYLOAD_TOO_LARGE`
- `RATE_LIMITED` / `ACTION_CONFLICT`
- `ROOM_NOT_FOUND` / `ROOM_FULL` / `NICKNAME_TAKEN`
- `OWNER_ONLY` / `NOT_A_PARTICIPANT` / `INVALID_PHASE`
- `SELF_VOTE` / `INVALID_TARGET` / `NOT_ENOUGH_PLAYERS`
- `INVALID_ACTION` / `INVALID_ROUNDS` / `NO_HAMMER` / `INVALID_BUILD`
