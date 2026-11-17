# 怪兽汽车：程序化资产与反应协议

本文记录「怪兽汽车」当前的资产来源、稳定零件 ID、反应数据与 Three.js 生命周期。规则以 `packages/games` 为准，网络/snapshot 契约以 `packages/protocol` 为准；不要把展示文案当成规则来源。

## 资产来源：自包含、按需加载

当前没有独立的汽车模型、贴图、HDR、天空盒或音效素材目录，也没有 GLTF/Texture/Audio Loader 或资产 CDN 请求。所有视觉与声音均由本仓库代码生成：

- 汽车和司机：Three.js 基础几何体、曲线、挤出几何体，以及随 Three.js 依赖打包的 `RoundedBoxGeometry`。
- 车库和森林赛道：几何体、实例化网格与内联 shader；树木、花草、石块和粒子不需要图片。
- UI 图标与零件 emoji：文本/系统 emoji 和已打包的 lucide 图标，不是远程图片。
- 音效：Web Audio oscillator/gain 实时合成，不下载音频文件。默认静音，只有用户打开声音后才尝试创建/恢复 `AudioContext`；浏览器拒绝音频不会影响比赛。

`apps/web/src/components/GamePanel.tsx` 用 `React.lazy` 动态导入 `monster-car/MonsterCarPanel`。Three.js、模型和渲染代码随该面板异步 chunk 加载；「谁最可能」与「存钱罐」不会初始化怪兽汽车世界。Suspense 期间显示“正在打开怪兽车库…”。

主要实现位置：

| 文件 | 职责 |
| --- | --- |
| `packages/protocol/src/monster-car.ts` | 五槽顺序、20 个稳定零件 ID、strict build/action schema |
| `packages/games/src/monster-car/parts.ts` | 展示名、emoji、idle 元数据、刺激响应、优先级与通用回退 |
| `packages/games/src/monster-car/race.ts` | 可序列化 RacePlan、反应 cues、确定性任意时刻采样 |
| `apps/web/src/components/monster-car/rendering/CarAssembly.ts` | 底盘、20 款零件、实际动作与资源释放 |
| `apps/web/src/components/monster-car/rendering/CourseVisual.ts` | 天空、地形、道路、森林、事件、河流与云朵游乐场 |
| `apps/web/src/components/monster-car/rendering/courseMath.ts` | 路面、车辆、障碍和相机共用的纯赛道函数 |
| `apps/web/src/components/monster-car/rendering/Particles.ts` | 环境微粒、反应水花/风/泡泡/爆米花与庆祝彩纸 |
| `apps/web/src/components/monster-car/rendering/MonsterCarScene.ts` | 车库/竞演世界、车辆与相机、共享采样和场景切换 |
| `apps/web/src/components/monster-car/rendering/RenderSurface.ts` | WebGLRenderer、ResizeObserver、RAF、上下文丢失与 dispose |
| `apps/web/src/components/monster-car/rendering/Soundscape.ts` | 自合成提示音与庆祝音 |
| `apps/web/src/components/monster-car/MonsterCarCanvas.tsx` | React 挂载/更新/清理边界 |
| `apps/web/src/components/monster-car/MonsterCarPanel.tsx` | 装车 UI、HUD、DOM 降级和声音开关 |

## 稳定 build 契约

一辆车的 build 恰好包含 `wheels`、`front`、`rear`、`roof`、`driver` 五个槽位，每槽四款零件，共 20 个可选 ID。ID 是网络、RacePlan、房间快照和渲染器之间的稳定契约；label、emoji、材质和动画可以独立迭代。重命名、删除或改变既有 ID 的含义可能破坏网络兼容和版本 1 快照，不能只改显示层。

| 槽位 | ID | 展示名 | 程序化外观要点 |
| --- | --- | --- | --- |
| wheels | `classic` | 圆圆轮 ⚙️ | 深色 torus 轮胎与轮毂 |
| wheels | `donut` | 甜甜圈轮 🍩 | 双层 torus、糖霜与七颗糖针 |
| wheels | `spring` | 弹簧轮 🌀 | 五圈金属弹簧与外圈 |
| wheels | `balloon` | 气球轮 🎈 | 半透明球体与气球结 |
| front | `smile` | 微笑车头 😊 | 球形鼻子与 torus 微笑 |
| front | `duck` | 鸭鸭船头 🦆 | 鸭头、扁嘴和双眼 |
| front | `train` | 火车烟囱 🚂 | 圆柱锅炉、烟囱与烟囱口 |
| front | `scoop` | 鼹鼠铲铲 🦫 | 四棱锥铲斗与鼻子 |
| rear | `trunk` | 旅行小箱 🧳 | 圆角箱体与两条束带 |
| rear | `rocket` | 爆米花火箭 🚀 | 圆柱机身、锥形头部、可切换的火焰/爆米花团 |
| rear | `bubble` | 泡泡浴缸 🛁 | 圆角浴缸与七个半透明泡泡 |
| rear | `tail` | 快乐尾巴 🦊 | Catmull-Rom 曲线生成 Tube 尾巴与球形尾尖 |
| roof | `mushroom` | 蘑菇车顶 🍄 | 菌柄、压扁菌盖与三个斑点 |
| roof | `umbrella` | 雨伞车顶 ☂️ | 伞杆、锥形伞面与八个扇贝形边缘 |
| roof | `propeller` | 螺旋桨 🚁 | 桅杆、三片桨叶与中心球 |
| roof | `antenna` | 星星天线 ⭐ | 倾斜天线与 Shape/Extrude 星星 |
| driver | `bear` | 小熊司机 🐻 | 共同司机身体，加耳朵与吻部 |
| driver | `frog` | 青蛙司机 🐸 | 绿色司机与头顶凸起的眼睛 |
| driver | `duck` | 小鸭司机 🐤 | 黄色司机与鸭嘴 |
| driver | `alien` | 外星司机 👽 | 大眼、长头与两根天线 |

所有车辆共用圆角底盘、车门、车灯和方向盘。`paint` 按参与者顺序选择珊瑚红、薄荷绿、紫色、金黄四种车身色；`lane` 决定赛道横向偏移。它们只用于展示，不是玩家提交的数值。

开局为最多四名参与者准备四套完整默认 build；玩家未准备而超时出发时也能得到合法车辆。旁观者没有自己的参与者 build，不能通过 `build-car` 加入本局。

## 刺激、反应数据与选择规则

### 赛道事件到刺激

`RacePlan.events` 固定有六项，progress 分别为 0.15、0.30、0.46、0.62、0.78、0.88。环境类型相邻不重复，variant 为 0、1、2；当前只有 puddle 使用 variant 平移涟漪环，其他事件类型尚未读取它。

| environment | stimulus | 程序化场景 |
| --- | --- | --- |
| `puddle` | `water` | 半透明椭圆水面与三个涟漪环 |
| `log` | `impact` | 横木、两端年轮切面与小蘑菇 |
| `gust` | `wind` | 四条 Catmull-Rom 曲线生成的风线 |
| `hill` | `slope` | 低矮土坡与两侧旗帜 |

每名 racer 的 cue 包含 `eventId`、`environment`、`stimulus`、`startAtMs`、`durationMs`、`intensity`、`primary` 和 `secondary`。`startAtMs` 由该车 pace 穿过事件进度的时间向前预留 120ms，并截断到不小于 0；因此不同配速的车可在不同时间触发同一事件。

每个已解析反应包含：

```ts
interface ResolvedMonsterCarReaction {
  reaction: string;
  durationMs: number;
  intensity: number;
  highlight: string;
  partId: string;
  slot: 'wheels' | 'front' | 'rear' | 'roof' | 'driver' | 'chassis';
}
```

反应 ID 是渲染和粒子选择行为的稳定数据；`highlight` 是结算中展示的中文高光。专属响应默认 `durationMs: 1250`、`intensity: 1`，下表只额外标出覆盖值。

### 20 款零件的专属响应

空白表示该零件没有对应刺激的专属响应，不代表车辆无反应；之后会按优先级继续寻找，最终还有 chassis 通用回退。

| 零件 | 响应（刺激：`reaction`，高光；非默认时长/强度） |
| --- | --- |
| wheels/classic | 无 |
| wheels/donut | water：`donut-splash`，甜甜圈冲浪手；impact：`donut-roll`，糖霜弹跳王 |
| wheels/spring | impact：`spring-bounce`，飞跃木头冠军，1500ms/1.2；slope：`spring-bounce`，山坡弹跳家，1400ms/1.05 |
| wheels/balloon | water：`balloon-float`，轻飘飘水手；wind：`balloon-float`，乘风气球车，1600ms/1.15；impact：`soft-squash`，软乎乎碰撞家 |
| front/smile | 无 |
| front/duck | water：`duck-paddle`，嘎嘎划水冠军，1600ms/1.1 |
| front/train | impact：`train-toot`，森林鸣笛家；slope：`train-toot`，翻山小火车 |
| front/scoop | water：`scoop-splash`，超大水花制造机，1400ms/1.15；impact：`scoop-hop`，铲铲跳跃王 |
| rear/trunk | 无 |
| rear/rocket | slope：`rocket-popcorn`，爆米花推进器，1700ms/1.2；wind：`rocket-wobble`，风里摇摆火箭 |
| rear/bubble | water：`bubble-foam`，泡泡翻倍魔法，1650ms/1.2；slope：`bubble-trail`，一路泡泡尾巴 |
| rear/tail | wind：`tail-wag`，风中摇尾冠军；impact：`tail-wag`，开心摇摇尾 |
| roof/mushroom | water：`mushroom-bloom`，雨中开花蘑菇；impact：`mushroom-boing`，蘑菇蹦蹦车 |
| roof/umbrella | wind：`umbrella-sail`，森林飞行伞，1800ms/1.25；water：`umbrella-open`，最干爽旅行家 |
| roof/propeller | wind：`propeller-flight`，旋风飞行员，1650ms/1.15；slope：`propeller-spin`，山坡螺旋桨 |
| roof/antenna | wind：`antenna-wobble`，接收风声的人；impact：`antenna-boing`，星星摇摇乐 |
| driver/bear | impact：`bear-hold`，抱紧方向盘冠军 |
| driver/frog | water：`frog-croak`，水坑歌唱家；impact：`frog-hop`，青蛙跳跳司机 |
| driver/duck | water：`driver-splash`，玩水小鸭司机 |
| driver/alien | wind：`alien-float`，失重外星司机；slope：`alien-anticipation`，山坡预测大师 |

### primary 优先级与 chassis 回退

`resolveMonsterCarReaction(build, stimulus)` 按下列顺序选择**第一个**声明了专属响应的槽位，不是把五个零件反应全部叠加：

| stimulus | 优先级 |
| --- | --- |
| water | front → wheels → roof → driver → rear |
| impact | wheels → roof → front → driver → rear |
| wind | roof → rear → driver → wheels → front |
| slope | wheels → rear → roof → front → driver |

若整辆车对该刺激都没有专属响应，primary 回退为 `partId: "chassis"`、`slot: "chassis"`：

| stimulus | reaction | highlight |
| --- | --- | --- |
| water | `classic-splash` | 晶亮水花制造机 |
| impact | `classic-bump` | 勇敢越过小障碍 |
| wind | `classic-wind` | 迎风旅行家 |
| slope | `classic-slope` | 稳稳翻山冠军 |

### secondary 与司机回退

当前每次解析还会产生**一项** secondary，默认取司机对该刺激的专属 reaction；没有专属 reaction 时使用 `driver-water`、`driver-impact`、`driver-wind` 或 `driver-slope`，highlight 为“最佳乘客表情”。普通 secondary 的 intensity 为 0.55，时长为 `min(primary.durationMs, 1100ms)`。

如果 primary 本身来自 driver，secondary 不再重复司机，而回退为 `chassis-wiggle`：`partId/slot` 均为 chassis，900ms、intensity 0.45、highlight“快乐车身”。

secondary 是公开、可序列化的反应契约。当前 `CarAssembly.update` 的专属动作分支消费 `cue.primary.reaction`，并统一叠加司机姿态；它没有为每个 `secondary.reaction` 再运行一套独立动画分支。修改这一点需要真实浏览器回归，不能只根据 cue 字段存在就声称对应动画已经显示。

## 计划、采样与“表现不影响成绩”

开局由服务端注入随机源产生 32 位 seed；进入倒计时时，`createMonsterCarRacePlan` 用独立 seeded RNG 生成完整计划。计划和反应 cue 都是普通 JSON 数据，不包含 Three.js 对象、函数、循环引用或系统时钟句柄。

- 先创建事件，再洗牌 `finishOrder`，随后生成每名 racer 的 pace/cues。
- 完赛时刻按名次为 `28_600 + rank * 280`ms；四人最后一名也在 30 秒内。
- 六段 pace 的每段权重在 0.82–1.18 之间，再归一化到 finishAtMs，形成途中领先交换。
- 零件只用于 build 外观和反应解析；生成 finishOrder 与 pace 时不读取零件，因此交换 builds 不改变同种子下的顺序与配速。
- `sampleMonsterCarFrame` 将请求时间限制到 `[0, 30000]`，按 pace 插值，并重算当前 place/leader/activeCue。采样不依赖上一帧，正序、倒序或跳跃采样同一时刻结果一致。
- 到达 finishAtMs 后允许 progress 略大于 1，形成短暂冲线滑行；这不改变计划中的 finishOrder，HUD 路线会把显示位置限制在 100%。

Three.js 每个显示帧在本地采样，React HUD 的本地回调最多每 125ms 一次。连接恢复后，Web 复用现有 ping/pong，以服务器时间和往返中点估算时钟偏移；车辆与倒计时使用校正后的服务端时间轴，避免设备系统时钟偏差改变所见赛事。浏览器不发送 frame，服务端也不逐帧广播坐标。游戏状态、seed、plan、时间边界和 standings 以 `version: 1` 放入房间快照，比赛中重启不会重掷。完整网络字段见 `docs/PROTOCOL.md`。

## 场景、性能与减少动效

`MonsterCarWorld` 在车库和竞演模式之间切换：

- 车库有圆形地台、展台、树木和粒子，展示当前 draft build；改装时替换汽车 assembly。
- 竞演按 plan 创建 CourseVisual、每名 racer 的 CarAssembly 和独立阴影。相机跟随车队中心，并按车辆间距调整 orthographic 视野。
- `sampleCourse` 是道路 ribbon、车辆位置、障碍和相机共同使用的纯函数，避免模型漂浮在不同的道路定义上。
- 山体、森林、花草等装饰使用固定本地种子；计划事件使用赛事 seed。天空和水面使用内联 shader，石块、标线、树木、花草和粒子使用 InstancedMesh 控制 draw call。
- 窄屏降低森林/花草/粒子数量；RenderSurface 在 max-width 720px 下限制到约 30fps，并降低 pixel ratio 与关闭阴影，桌面 pixel ratio 也有上限；结果页降至最多 20fps，减少动效偏好下进一步降帧。
- `document.hidden` 时跳过更新和绘制。减少动效偏好会冻结/削弱环境、idle、反应和粒子表现，但不会暂停权威计时或改变名次。

音效按自己车辆的 `plan.id + eventId` 去重触发，终局庆祝按 plan.id 去重。其他车辆是否发声、声音是否可用都不参与规则。

## Renderer 生命周期与 DOM 回退

1. `MonsterCarCanvas` 挂载后创建 `MonsterCarWorld`，再创建 `RenderSurface`。
2. RenderSurface 创建 WebGLRenderer，附加 `data-testid="monster-car-canvas"`、`data-render-engine="three.js"` 和初始 `data-render-state="starting"` 的 canvas；成功绘制后状态为 `running`。
3. ResizeObserver 同步容器尺寸、renderer 尺寸和 orthographic camera。RAF 使用经 ping/pong 偏移校正的绝对时间更新世界，不累计位置状态；shader 的秒数另限制在适合 32 位浮点精度的范围内。
4. WebGLRenderer 构造失败会释放场景并通知面板；运行中 `webglcontextlost` 会阻止默认处理、标记 `lost` 并通知面板。
5. 面板随后以 DOM 汽车预览或 DOM 森林道路替代 canvas；竞演中仍按 125ms 调用同一个纯采样函数更新路线、计时和反应。装车、阶段文案与服务端 standings 仍由 React 数据驱动；DOM 回退不是完整 3D 竞演的等效实现，也不会自行推进规则。
6. 卸载时取消 RAF、断开 observer、移除 context-lost 监听，释放 assembly/course/particle 的几何体和材质、阴影、renderer 与 DOM canvas；Soundscape 关闭 AudioContext。重复 dispose 有 disposed 标记保护 RenderSurface。

真实 WebGL 是否成功必须由 Chromium E2E 验证。jsdom 不提供真实 GPU 帧管线：`monster-car.test.tsx` 的 mock canvas 只能证明 React 数据流，`monster-car-rendering.test.tsx` 对真实 CarAssembly 的有限变换/dispose 检查也只能证明无 WebGL 的几何协议，不能证明 `running`、真实 GPU 资源释放或完整 DOM 回退路径。正常与降级测试边界见 `docs/TESTING.md`。

## 修改零件或资产的检查清单

1. 在 `packages/protocol/src/monster-car.ts` 保持五槽结构和合法 ID 一致；评估对既有版本 1 网络数据和快照的兼容性，不兼容时提升游戏 version。
2. 在 `parts.ts` 补 label、emoji、slot、idle 元数据与响应；确认每种刺激都有可解析的 primary/secondary，通用回退仍可用。
3. 在 `CarAssembly.ts` 实现对应几何体与 dispose；新增 reaction ID 时同步实际动作和必要粒子，不要只添加目录文字。
4. 保持 finishOrder、finishAtMs 与 pace 不受零件影响；任何速度/名次加成都是另一项规则变更，不能夹在资产修改中。
5. 更新 business/network 回归；真实模型、动画、resize、刷新恢复、context loss 和 DOM 回退分别用 Chromium 验证，jsdom 只覆盖适合的可见交互。
6. 同步 `docs/PROTOCOL.md`、本文及必要的架构/测试说明，不引入未说明的外部素材请求。
