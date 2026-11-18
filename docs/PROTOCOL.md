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

开局（`gameId` 取 `most-likely`、`piggy-bank`、`monster-car`、`gomoku`、`ludo`、`dou-dizhu` 或 `texas-holdem`；轮数在 1–8 间，具体可选值由各游戏决定，如「存钱罐」支持 4/6/8，「怪兽汽车」「飞行棋」只接受 1）：

```json
{ "type": "start-game", "actionId": "web-uuid", "gameId": "most-likely", "rounds": 3 }
```

结束本局回大厅（仅房主，且房间处于 `finished`；沿用通用 `actionId` 幂等）：

```json
{ "type": "end-game", "actionId": "web-uuid" }
```

成功后房间 `phase` 回到 `lobby`、`game` 清空，对局中加入的旁观者全部转回参与者，房主可换游戏重新 `start-game`。在 `lobby` 或 `playing` 阶段调用返回 `INVALID_PHASE`，非房主返回 `OWNER_ONLY`。与 `play-again` 不同，`end-game` 不保留「怪兽汽车」的 build：回大厅后重开是全新一局。

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

缺件、额外字段、非法零件或错误动作形状在 WebSocket schema 边界返回 `INVALID_MESSAGE`。`build-car` 仅限本局参与者且只能在 `building` 使用；每次成功提交会保存 build 并标记 ready，准备后仍可用**新的** `actionId` 改装。同一动作重发沿用通用幂等规则，同 `actionId` 换 build 返回 `ACTION_CONFLICT`。`play-again` 只允许房主在 `finished` 使用；它保留所有参与者最后提交的 build，清空 readyPlayerIds/plan/standings 和赛事时间边界，并用新的服务端种子回到 `building`。未提交的本地草稿不会被保存或重放。

当前五槽各八款、共 40 个合法 ID。此次扩展保留全部旧 ID 及其数组顺序，只在各槽末尾追加新 ID；`monster-car` 游戏版本和房间快照 `schemaVersion` 都保持 1。旧版本 1 build/plan 快照因此仍可恢复，且不需要新增协议字段；包含新 ID 的快照不能回滚给只认识旧 20 款的实现。四款一页的货架、指针旋转、本地“惊喜一下”、ShowPlan、身份旗、故事/天气/社交/相机和循环合影都不新增动作或消息，也不改变以上版本兼容承诺。

## 棋牌室四款游戏

### 通用牌号编码

斗地主与德州扑克共用一副 54 张牌的稳定数字契约：牌号 `0..51` 为普通牌，花色 `suit = floor(id / 13)`（`0♠ 1♥ 2♣ 3♦`），点数 `rank = id % 13`（`0='2'`, `1='3'`, …, `8='10'`, `9='J'`, `10='Q'`, `11='K'`, `12='A'`，A 大）；`52` 为小王、`53` 为大王。各游戏自行解释牌力顺序（斗地主里 2 与王按民间规则最大），编码本身不预设；`describeCard` 提供展示名。

### 五子棋（gomoku，2 人，rounds 1/3/5 盘）

```json
{ "type": "game-action", "actionId": "web-uuid", "action": { "type": "place-stone", "x": 7, "y": 7 } }
{ "type": "game-action", "actionId": "web-uuid", "action": { "type": "next-board" } }
{ "type": "game-action", "actionId": "web-uuid", "action": { "type": "play-again" } }
```

坐标为 0–14 的整数。每盘黑白轮流执先（第 n 盘由座位 `(n-1) % 2` 执黑），横竖斜连成五子及以上即胜（自由长连规则），满盘判和。落子超时（120 秒）由服务端在靠中心的位置自动落子；盘间展示 8 秒后自动开下一盘，`next-board` 仅房主可提前推进。视图公开整个棋盘、最近落子与连珠坐标，没有私密信息。

### 飞行棋（ludo，2–4 人，rounds 固定 1）

```json
{ "type": "game-action", "actionId": "web-uuid", "action": { "type": "roll-dice" } }
{ "type": "game-action", "actionId": "web-uuid", "action": { "type": "move-plane", "plane": 0 } }
{ "type": "game-action", "actionId": "web-uuid", "action": { "type": "play-again" } }
```

骰子只能由服务端掷。`plane` 是**相对本机**的编号（0–3，即「我的第 N 架飞机」），服务端换算为全局编号；视图 `movablePlanes` 同样给出当前行动者的相对编号。规则：掷 6 可起飞并追加一掷；连续第三个 6 本轮作废；己色格（进度 ≡2 (mod 4)）跳跃 +4；18 格飞行 +12 并可连跳；落点撞机全部退回停机坪；终点需整数点，越界反弹。四架全部到家即整场结束并按进度排名。掷骰/移动各 45 秒超时自动托管。视图公开全部飞机位置与骰子，没有私密信息。

视图 `seats` 给出按座位顺序的开局玩家表，玩家中途退出房间也不会改变；前端一律用它（而不是房间玩家列表的索引）对齐自己的座位、当前行动者与飞机归属，否则玩家退出后座位错位会让所有人无法行动。

### 斗地主（dou-dizhu，3 人，rounds 1/3/5 手）

```json
{ "type": "game-action", "actionId": "web-uuid", "action": { "type": "bid", "points": 3 } }
{ "type": "game-action", "actionId": "web-uuid", "action": { "type": "pass" } }
{ "type": "game-action", "actionId": "web-uuid", "action": { "type": "play-cards", "cards": [1, 14, 27] } }
{ "type": "game-action", "actionId": "web-uuid", "action": { "type": "next-hand" } }
{ "type": "game-action", "actionId": "web-uuid", "action": { "type": "play-again" } }
```

`pass` 在叫分阶段表示不叫、在出牌阶段表示不要。每人一次叫分机会（1/2/3 或不叫），叫 3 立即坐庄；两轮流局后首叫玩家按 1 分强制坐庄。地主收 3 张底牌并向所有人公开。牌型含单张、对子、三张、三带一/对、顺子（≥5）、连对（≥3 对）、飞机（±单/对翅膀）、四带二（单/对）、炸弹与王炸；炸弹和王炸每次打出使倍数翻倍，春天/反春再翻倍。结算：地主赢则每农民 −base、地主 +2×base，反之亦然；多手累计积分定胜负。与飞行棋相同，视图 `seats` 给出按座位顺序的开局玩家表，前端据此对齐座位，玩家退出房间后也不受房间列表前移影响。

**私密性**：`ownHand` 只包含本人手牌；他人只有 `handCounts` 计数。底牌（`bottom`）在定庄前为 `null`。手牌结果阶段公开 `revealedHands` 与最终牌型。

### 德州扑克（texas-holdem，2–6 人，rounds 1/3/5/8 手）

```json
{ "type": "game-action", "actionId": "web-uuid", "action": { "type": "fold" } }
{ "type": "game-action", "actionId": "web-uuid", "action": { "type": "check" } }
{ "type": "game-action", "actionId": "web-uuid", "action": { "type": "call" } }
{ "type": "game-action", "actionId": "web-uuid", "action": { "type": "bet", "amount": 60 } }
{ "type": "game-action", "actionId": "web-uuid", "action": { "type": "raise-to", "amount": 120 } }
{ "type": "game-action", "actionId": "web-uuid", "action": { "type": "next-hand" } }
{ "type": "game-action", "actionId": "web-uuid", "action": { "type": "play-again" } }
```

`bet` / `raise-to` 的 `amount` 均为**本街投入总额**（国际惯例）。规则：起始 2000 筹码 vs 10/20 盲注（100 大盲），每 6 手盲注翻倍；最小加注为上一次加注增量，短全下不重开已行动玩家的加注权；未被跟注的差额退还原玩家；边池按贡献分层结算，平分底池的零头筹码从按钮位后顺时针发放；全部全下时逐街发牌（`runout` 阶段）后摊牌。行动超时 60 秒自动托管：能过则过、面对下注弃牌。只剩一人有筹码或到达手数上限时整场结束，按名次与筹码排名。

**私密性**：`ownCards` 只包含本人底牌；座位数据不含任何牌面字段；`revealed` 只在摊牌出现且仅覆盖未弃牌者，弃牌收池不亮牌。

四款游戏的 `next-hand` / `next-board` 都是房主提前推进的快捷动作（等待期会自动推进），`play-again` 仅房主在整场 `finished` 可用并全新开局。

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

整个 plan 可 JSON 序列化，并保存在游戏版本 1 的房间快照中。比赛中服务重启或玩家重连会恢复同一 plan 和时间边界，不重新生成种子或名次。本次展示升级不改变 `createMonsterCarRacePlan` 的 RNG 消耗顺序；固定种子的 events、finishOrder、pace 与 finishAtMs golden 回归用于防止身份、天气、社交或相机代码意外挤占赛事随机流。

**公开性边界**：`standings` 虽在 `finished` 才填充，但 `plan.finishOrder` 从 `countdown` 起已经随完整计划发送；它以及 builds、cues、highlight 都不是秘密。不要根据“结算尚未展示”推断网络载荷隐藏了最终顺序。

### 本地采样，不是逐帧协议

共享纯函数 `sampleMonsterCarFrame(plan, requestedAtMs)` 将时间限制在 0–30,000ms，对 pace 插值并计算当前 leader、每辆车 place 和 activeCue。返回的 `activeCue.localProgress` 是 0–1 的本地反应进度。函数不保存前一帧，因此同一计划、同一时刻以任意调用顺序采样都会得到相同结果；完赛后的短暂视觉滑行可让 progress 略大于 1，但不改变 finishOrder。

浏览器在 ready/重连后发送现有 `ping`，用 `pong.now` 与往返中点估算服务端时钟偏移，再根据 `raceStartsAt` 计算 elapsed 并在本地 `requestAnimationFrame` 中采样。该偏移只校正显示，不成为权威输入。`MonsterCarRaceFrame`、车辆坐标与 HUD 更新**不是 WebSocket 消息类型**，客户端不能通过它们提交位置或名次。服务端在 racing 中途没有业务变化时不发送周期性 `room` 帧，只在进入 `racing`、进入 `finished` 等其他状态变化时同步。WebGL 降级路径也调用同一纯采样函数，不依赖 canvas 提供 HUD 帧。

进入 `finished` 后，权威视图、时间边界和 standings 均保持既有结构。`PlaygroundMotion` 与 `FinaleMotion` 只根据同一 plan 和本地赛后绝对时间计算入场、绕行、编队合影与返场，`FireworksField`、操场相机和结果卡自动收起也都发生在浏览器；没有 `celebrating`/`photo` 服务端阶段、赛后位置消息、结果卡计时消息或新增快照字段。

### 本地展示计划不属于网络协议

`MonsterCarShowPlan` 由浏览器通过 `createMonsterCarShowPlan(plan, players)` 从已有公开数据生成，结构为 `identities`、`avatars`、`story`、`socialMoments`、`finaleSeed`。它是可 JSON 序列化的纯本地数据，**不是** `MonsterCarView`、`MonsterCarRacePlan` 或 WebSocket 消息的成员，也不进入房间快照。玩家头像继续使用 `room.players` 中已有公开字段，不为此新增会话资料或隐私例外。

- `CarIdentity` 按 playerId/avatar/参与者索引派生配色、accent、dots/stripes/stars/checker 花纹、有限车身比例、悬挂相位和旗帜编号；头像旗使用已有公开 avatar。身份与赛事 seed/RNG 无关。
- 六个 story 分别选择 fireflies/rain/petals/flowers/acorns/lanterns 天气及天空、暮色、雾、背景、阳光和装饰参数；天气与镜头焦点只在本地渲染。
- socialMoments 为不重叠的两人互动，包含 actor、target、绝对 start、duration 与 caption；2/3 辆车一段，4 辆车两段。`sampleSocialPose` 与 `sampleRaceCamera` 都是绝对时间纯函数，不上传互动、镜头或姿态。
- `samplePerformanceCue` 给已有 cue 增加本地 320ms 预备与至多 420ms 跟随，减少动效时取消扩展。它不修改 plan.cues，也不扩展网络采样器用于 HUD/音效的 `activeCue` 窗口。
- 车库拖动/键盘旋转、0.45 秒换件弹跳、开赛最初 900ms 的视觉前冲和“惊喜一下”都是本地行为。“惊喜一下”只生成完整 draft；仍须发送既有 `build-car`，不消耗服务端 RNG。

赛后 `FinaleMotion` 每 20 秒循环：5.0–6.4 秒进入队形，6.4–9.4 秒停稳合影，9.4–11.4 秒返回圆环；2/3/4 辆车分别轮换两组、两组、三组队形。`PlaygroundCamera` 按车辆数、落地边界、横竖屏及 results/photo 模式调整构图。所有这些值均可由 plan 与绝对赛后时间重建，**不改变 `RacePlan`、standings、版本 1 快照或网络广播频率**。

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
