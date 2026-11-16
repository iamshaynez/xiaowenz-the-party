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

开局（`gameId` 取 `most-likely`、`piggy-bank` 或 `can-drive`；轮数在 1–8 间，具体可选值由各游戏决定，如「存钱罐」支持 4/6/8，「这车能开？」固定为 1 次完整展示）：

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

「这车能开？」（`slot` 为 `driver / motion / front / rear / roof` 之一；测试与颁奖由服务端自动推进）：

```json
{ "type": "game-action", "actionId": "web-uuid", "action": { "type": "select-car-part", "slot": "driver", "partId": "cat" } }
{ "type": "game-action", "actionId": "web-uuid", "action": { "type": "submit-car" } }
{ "type": "play-again" }
```

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

「这车能开？」组装阶段只向本人发送 `ownBuild`，其他玩家只能看到准备状态。展示视图只包含当前公开车辆的可恢复 ShowPlan、绝对开始／结束时间和已经揭晓的奖项；完整未来计划、未来奖项与展示统计不进入客户端。ShowPlan 只包含环境、事件和公开参数，不逐帧广播坐标。

## 常见错误码

- `AUTH_REQUIRED` / `AUTH_FAILED` / `AUTH_TIMEOUT`
- `INVALID_MESSAGE` / `INVALID_INPUT` / `PAYLOAD_TOO_LARGE`
- `RATE_LIMITED` / `ACTION_CONFLICT`
- `ROOM_NOT_FOUND` / `ROOM_FULL` / `NICKNAME_TAKEN`
- `OWNER_ONLY` / `NOT_A_PARTICIPANT` / `INVALID_PHASE`
- `SELF_VOTE` / `INVALID_TARGET` / `NOT_ENOUGH_PLAYERS`
- `INVALID_ACTION` / `INVALID_ROUNDS` / `NO_HAMMER` / `INVALID_PART`
