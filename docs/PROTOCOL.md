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

返回预置头像、投票时长和公开游戏元数据，不含任何房间或会话信息。

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

开局：

```json
{ "type": "start-game", "actionId": "web-uuid", "gameId": "most-likely", "rounds": 3 }
```

游戏动作：

```json
{ "type": "game-action", "actionId": "web-uuid", "action": { "type": "cast-vote", "targetId": "p_…" } }
```

其他游戏动作：

```json
{ "type": "next-round" }
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

## 常见错误码

- `AUTH_REQUIRED` / `AUTH_FAILED` / `AUTH_TIMEOUT`
- `INVALID_MESSAGE` / `INVALID_INPUT` / `PAYLOAD_TOO_LARGE`
- `RATE_LIMITED` / `ACTION_CONFLICT`
- `ROOM_NOT_FOUND` / `ROOM_FULL` / `NICKNAME_TAKEN`
- `OWNER_ONLY` / `NOT_A_PARTICIPANT` / `INVALID_PHASE`
- `SELF_VOTE` / `INVALID_TARGET` / `NOT_ENOUGH_PLAYERS`
