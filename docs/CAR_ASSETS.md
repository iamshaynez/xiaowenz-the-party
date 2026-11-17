# 怪兽汽车：程序化资产与反应协议

本文记录「怪兽汽车」当前的资产来源、40 个稳定零件 ID、反应数据、缩略图与 Three.js 庆典生命周期。规则以 `packages/games` 为准，网络/snapshot 契约以 `packages/protocol` 为准；不要把展示文案当成规则来源。

## 资产来源：自包含、按需加载

当前没有独立的汽车模型、贴图、HDR、天空盒或音效素材目录，也没有 GLTF/Texture/Audio Loader 或资产 CDN 请求。所有视觉与声音均由本仓库代码生成：

- 汽车、司机、花纹、围巾和头像编号旗：Three.js 基础几何体、曲线、挤出几何体、本地 2D canvas 生成的 CanvasTexture，以及随 Three.js 依赖打包的 `RoundedBoxGeometry`。
- 零件缩略图：调用与整车相同的模型工厂，在本地临时烘焙为 WebP data URL；不下载图片，也不在 40 个选项中常驻 canvas。
- 车库、六种森林故事和云朵操场：几何体、实例化网格与内联 shader；树木、花草、石块、天气、反应粒子和烟花不需要图片。
- UI 图标与零件 emoji：文本/系统 emoji 和已打包的 lucide 图标，不是远程图片。
- 音效：Web Audio oscillator/gain 实时合成，不下载音频文件。默认静音，只有用户打开声音后才尝试创建/恢复 `AudioContext`；浏览器拒绝音频不会影响比赛。

`apps/web/src/components/GamePanel.tsx` 用 `React.lazy` 动态导入 `monster-car/MonsterCarPanel`。Three.js、模型和渲染代码随该面板异步 chunk 加载；「谁最可能」与「存钱罐」不会初始化怪兽汽车世界。Suspense 期间显示“正在打开怪兽车库…”。

主要实现位置：

| 文件 | 职责 |
| --- | --- |
| `packages/protocol/src/monster-car.ts` | 五槽顺序、40 个稳定零件 ID、strict build/action schema |
| `packages/games/src/monster-car.ts` | 版本 1 权威阶段、build 校验、再来一局保留已提交 build |
| `packages/games/src/monster-car/parts.ts` | 40 款展示名、emoji、idle 元数据、刺激响应、优先级与通用回退 |
| `packages/games/src/monster-car/race.ts` | 可序列化 RacePlan、primary/secondary cues、确定性任意时刻采样 |
| `apps/web/src/components/monster-car/garage.ts` | “惊喜一下”的完整本地 draft 生成；不提交网络动作 |
| `apps/web/src/components/monster-car/rendering/models/` | 五槽共享模型工厂、命名 rig 节点、通用几何/材质与模型 dispose |
| `apps/web/src/components/monster-car/rendering/CarAssembly.ts` | 共用底盘、身份花纹/比例/悬挂、局部换件与弹跳、primary/secondary/社交姿态合成 |
| `apps/web/src/components/monster-car/rendering/AvatarFlag.ts` | 128×80 本地 canvas 头像编号旗、2D 失败纯色回退与纹理释放 |
| `apps/web/src/components/monster-car/rendering/presentation/deterministic.ts` | 与赛事 RNG 隔离的具名哈希和局部确定性随机流 |
| `apps/web/src/components/monster-car/rendering/presentation/CarIdentity.ts` | 每车配色、accent、花纹、比例、悬挂相位与旗帜编号 |
| `apps/web/src/components/monster-car/rendering/presentation/ShowPlan.ts` | 可 JSON 序列化的纯本地身份/头像/六故事/社交/finaleSeed 计划 |
| `apps/web/src/components/monster-car/rendering/presentation/SocialMoments.ts` | 不重叠双人互动规划与绝对时间有界姿态 |
| `apps/web/src/components/monster-car/rendering/presentation/ReactionPerformance.ts` | 既有 cue 的 320ms 预备与至多 420ms 本地跟随 |
| `apps/web/src/components/monster-car/rendering/presentation/RaceCamera.ts` | 开场/车队/事件/社交/终点导演相机的绝对时间混合 |
| `apps/web/src/components/monster-car/rendering/ReactionLibrary.ts` | reaction ID 到运动通道/粒子语义的映射、主/次反应进度采样 |
| `apps/web/src/components/monster-car/PartThumbnail.tsx` | 静态缩略图 `<img>`、加载状态和 emoji 回退 |
| `apps/web/src/components/monster-car/thumbnails/PartThumbnailBaker.ts` | 单个临时 renderer、订阅取消、串行烘焙、pending 去重、异常清理与静态缓存 |
| `apps/web/src/components/monster-car/rendering/CourseVisual.ts` | 故事天空/暮色、地形、道路、森林、事件、河流与云朵游乐场 |
| `apps/web/src/components/monster-car/rendering/courseMath.ts` | 路面、车辆、障碍和相机共用的纯赛道函数 |
| `apps/web/src/components/monster-car/rendering/Particles.ts` | 固定容量环境微粒、primary 反应粒子与庆祝彩纸 |
| `apps/web/src/components/monster-car/rendering/WeatherField.ts` | 六故事固定容量 GPU 天气、焦点跟随、减少动效与幂等 dispose |
| `apps/web/src/components/monster-car/rendering/PlaygroundMotion.ts` | 赛后入场、圆环、车轮里程与错相跳跃的基础纯采样器 |
| `apps/web/src/components/monster-car/rendering/presentation/FinaleMotion.ts` | 每 20 秒按车辆数轮换编队、静止合影、返场的纯采样器 |
| `apps/web/src/components/monster-car/rendering/PlaygroundCamera.ts` | 结果卡/合影模式、横竖屏与落地车辆边界的安全构图 |
| `apps/web/src/components/monster-car/rendering/FireworksField.ts` | 固定池 GPU 烟花、循环 volley、合影降强度、减少动效与幂等 dispose |
| `apps/web/src/components/monster-car/rendering/MonsterCarScene.ts` | 车库/竞演/赛后世界、车辆与相机、共享采样和场景切换 |
| `apps/web/src/components/monster-car/rendering/RenderSurface.ts` | WebGLRenderer、ResizeObserver、RAF、上下文丢失与 dispose |
| `apps/web/src/components/monster-car/rendering/Soundscape.ts` | 自合成提示音与庆祝音 |
| `apps/web/src/components/monster-car/MonsterCarCanvas.tsx` | React 挂载/更新/清理、pointer capture 旋转与键盘等价操作 |
| `apps/web/src/components/monster-car/MonsterCarPanel.tsx` | 四款一页货架、本地惊喜草稿、装车 UI、HUD、DOM 降级、结果卡和声音开关 |

## 稳定 build 契约

一辆车的 build 恰好包含 `wheels`、`front`、`rear`、`roof`、`driver` 五个槽位，每槽八款零件，共 40 个可选 ID。ID 是网络、RacePlan、房间快照和渲染器之间的稳定契约；label、emoji、材质和动画可以独立迭代。此次在每槽原有四款之后追加四款，20 个旧 ID 及其顺序不变，游戏与快照版本继续保持 1，旧版本 1 数据无需迁移。重命名、删除或改变既有 ID 的含义不是加法扩展，可能破坏网络兼容和快照恢复，不能只改显示层。

| 槽位 | ID | 展示名 | 程序化外观要点 |
| --- | --- | --- | --- |
| wheels | `classic` | 圆圆轮 ⚙️ | 深色 torus 轮胎、轮毂与实例化辐条/螺栓/胎纹 |
| wheels | `donut` | 甜甜圈轮 🍩 | 双层 torus、实例化糖霜滴与多色糖针 |
| wheels | `spring` | 弹簧轮 🌀 | 五圈金属弹簧与外圈 |
| wheels | `balloon` | 气球轮 🎈 | 半透明球体与气球结 |
| wheels | `banana` | 香蕉轮 🍌 | 弧形香蕉管、果皮筋线、果柄与斑点 |
| wheels | `square` | 方方轮 🟨 | 圆角方形轮胎、四面胎纹与双面轮毂 |
| wheels | `bubble-tea` | 珍珠奶茶轮 🧋 | 透明杯身、珍珠、杯盖与条纹吸管 |
| wheels | `duck-float` | 鸭鸭泳圈轮 🛟 | 黄色泳圈、鸭头、鸭嘴、翅膀与气嘴 |
| front | `smile` | 微笑车头 😊 | 球形鼻子与 torus 微笑 |
| front | `duck` | 鸭鸭船头 🦆 | 鸭头、扁嘴和双眼 |
| front | `train` | 火车烟囱 🚂 | 圆柱锅炉、烟囱与烟囱口 |
| front | `scoop` | 鼹鼠铲铲 🦫 | 四棱锥铲斗与鼻子 |
| front | `shark` | 鲨鱼车头 🦈 | 可动下颌、牙齿、背鳍与侧鳍 |
| front | `vacuum` | 吸尘器车头 🧹 | 透明集尘仓、滚刷与波纹软管 |
| front | `ice-cream` | 冰淇淋车头 🍦 | 格纹甜筒、三色球、糖针与樱桃 |
| front | `piano` | 钢琴车头 🎹 | 黑白琴键、谱架与琴身 |
| rear | `trunk` | 旅行小箱 🧳 | 圆角箱体与两条束带 |
| rear | `rocket` | 爆米花火箭 🚀 | 圆柱机身、锥形头部、可切换的火焰/爆米花团 |
| rear | `bubble` | 泡泡浴缸 🛁 | 圆角浴缸与七个半透明泡泡 |
| rear | `tail` | 快乐尾巴 🦊 | Catmull-Rom 曲线生成 Tube 尾巴与球形尾尖 |
| rear | `washing-machine` | 滚筒洗衣机 🧺 | 可转滚筒、玻璃门、旋钮与显示屏 |
| rear | `campfire` | 篝火小车尾 🔥 | 石圈、交叉木柴、发光火焰与棉花糖签 |
| rear | `jackbox` | 惊喜弹簧盒 🎁 | 可动盒盖、弹簧与小丑 |
| rear | `snail` | 蜗牛小车尾 🐌 | 螺旋蜗壳、眼柄与软体车身 |
| roof | `mushroom` | 蘑菇车顶 🍄 | 菌柄、压扁菌盖与三个斑点 |
| roof | `umbrella` | 雨伞车顶 ☂️ | 伞杆、锥形伞面与八个扇贝形边缘 |
| roof | `propeller` | 螺旋桨 🚁 | 桅杆、三片桨叶与中心球 |
| roof | `antenna` | 星星天线 ⭐ | 倾斜天线与 Shape/Extrude 星星 |
| roof | `teapot` | 茶壶车顶 🫖 | 壶嘴、把手、可动壶盖与蒸汽曲线 |
| roof | `birdcage` | 鸟笼车顶 🪶 | 金属笼条、笼门、栖木与小鸟 |
| roof | `cactus` | 仙人掌车顶 🌵 | 花盆、分枝、尖刺与三朵花 |
| roof | `whale` | 鲸鱼车顶 🐳 | 鲸身、可动鲸尾与三股喷水曲线 |
| driver | `bear` | 小熊司机 🐻 | 共同司机身体，加耳朵与吻部 |
| driver | `frog` | 青蛙司机 🐸 | 绿色司机与头顶凸起的眼睛 |
| driver | `duck` | 小鸭司机 🐤 | 黄色司机与鸭嘴 |
| driver | `alien` | 外星司机 👽 | 大眼、长头与两根天线 |
| driver | `robot` | 机器人司机 🤖 | 金属方头、发光屏幕、天线与关节手臂 |
| driver | `penguin` | 企鹅司机 🐧 | 白肚皮、尖嘴、鳍状手臂与脚蹼 |
| driver | `ghost` | 幽灵司机 👻 | 半透明波浪床单、扇贝下摆与长眼 |
| driver | `lion` | 狮子司机 🦁 | 双色鬃毛、耳朵、吻部与手臂 |

五个模型注册表分别以 `Record<MonsterCarBuild[slot], () => PartRig>` 约束键完整性；`createPartModel` 是 `CarAssembly` 和缩略图烘焙器的共同入口。每个 rig 通过 `makeRig` 写入稳定的 `slot:partId` 根名称，并只把需要动作的节点放入 `nodes`；公共几何与材质辅助函数位于 `models/primitives.ts`，模型统一由 `disposeModel` 去重释放。

所有车辆共用圆角底盘、车门、车灯和方向盘。RacePlan 仍保存既有 `paint`/`lane` 字段：lane 决定赛道横向偏移，paint 继续用于无 identity 的兼容构造及粒子配色；正常车库/竞演的车身底色由 `CarIdentity.baseColor` 提供。它们都不是玩家提交的数值，也不参与完赛顺序。

开局为最多四名参与者准备四套完整默认 build；玩家未准备而超时出发时也能得到合法车辆。旁观者没有自己的参与者 build，不能通过 `build-car` 加入本局。`play-again` 先复制每名参与者当前权威 build，再创建新局并覆盖默认 builds；ready、plan、时间边界和 standings 仍重置，种子由服务端新随机源生成。版本 1 已结束快照恢复后执行同样逻辑；本地未提交草稿不在此契约内。

## 每车身份、头像旗与纯本地 ShowPlan

### `CarIdentity` 与赛事 RNG 隔离

`createCarIdentity(playerId, participantIndex, avatar)` 为每名参与者生成稳定身份；除旗帜编号与 accent 的索引变化外，身份由 playerId/avatar 决定，不依赖 race seed。`presentation/deterministic.ts` 对字符串/数字做带类型和长度的具名 purpose 哈希，`unitFromPurpose` 返回 `[0, 1)`；需要局部流时使用 `randomFromPurpose`。它与 `createMonsterCarRacePlan` 内部的 seeded RNG 没有任何共享游标，新增身份、天气、社交或镜头采样不会改变赛事事件、配速或名次。

| 字段 | 表现契约 |
| --- | --- |
| `baseColor` / `accentColor` | 从内置 12 色底色与 10 色 accent 中稳定选择；正常展示车辆用 baseColor 覆盖旧的四色 paint 外观 |
| `pattern` | `dots`、`stripes`、`stars`、`checker` 四种车身装饰 |
| `lengthScale` / `widthScale` / `heightScale` | 分别在约 0.94–1.06、0.93–1.05、0.94–1.06 内轻微变化；车身整体缩放，轮子的 X/Z 安装点同步调整 |
| `suspensionPhase` | `[0, 2π)` 相位，错开每辆车悬挂的轻微上下/侧倾；不是车辆物理或速度参数 |
| `flagNumber` | `participantIndex % 99 + 1` 的可见编号 |

`CarAssembly` 另加 accent 围巾和车身花纹；当前浏览器自己的车有 `own-car-halo`，因此光环是 viewer-specific 本地表现。`AvatarFlag` 用 128×80 的 2D canvas 绘制 accent 旗面、已有公开 avatar 和编号，再生成一张 CanvasTexture；2D context 不可用时退回纯色双面材质。该 canvas 不进入 DOM 或网络，texture 会随 `disposeModel` 释放。

### ShowPlan 的纯数据边界

`createMonsterCarShowPlan(plan, players)` 输入既有 RacePlan 和公开 `{ id, avatar }[]`，输出：

```ts
interface MonsterCarShowPlan {
  identities: Record<string, CarIdentity>;
  avatars: Record<string, string>;
  story: MonsterCarStory;
  socialMoments: SocialMoment[];
  finaleSeed: number;
}
```

返回值可 JSON 序列化，故事颜色数组和社交文案均不保留可变输入引用，函数不修改 plan/players。ShowPlan 只在浏览器内存中存在，不是 RacePlan 的扩展字段，不进入 WebSocket 或版本 1 快照；刷新后可由相同公开输入重建。`finaleSeed` 也是按 plan id/seed 独立哈希的展示数据，不是权威赛事种子；它传给 `FireworksField` 构造器，因此不同比赛拥有不同但可复现的礼花。

### 六个故事与天气

| story id | 标题 | weather | 主要表现 |
| --- | --- | --- | --- |
| `firefly-grove` | 萤火虫森林 | `fireflies` | 局部盘旋、呼吸明暗的加法混合光点 |
| `rainbow-rain` | 雨滴交响曲 | `rain` | 快速下落、横向微移的雨丝 |
| `petal-picnic` | 花瓣野餐会 | `petals` | 下落、横漂和摇摆的花瓣 |
| `flower-parade` | 鲜花巡游 | `flowers` | 缓慢上浮的花形点 |
| `acorn-woods` | 橡果沙沙谷 | `acorns` | 较重下落并纵向循环的橡果形点 |
| `lantern-festival` | 灯笼星光夜 | `lanterns` | 上浮、悬浮和发光灯笼 |

每个 story 同时固定 `dayColors`/`twilightColors` 三色、`fogColor`、`backgroundColor`、`sunColor` 和 `propVariant`。`CourseVisual` 用它们配置天空、两秒暮色和 24 个实例化故事装饰；`MonsterCarWorld` 配置雾、背景与方向光。`WeatherField` 根据 story id 的独立局部流预分配详细 360/紧凑 180 个点，以单个 `THREE.Points` 和 shader 绘制，更新只写 time/focusX/reducedMotion uniforms。减少动效冻结时间并降低 alpha，焦点仍跟随当前镜头。

### 双人社交与导演相机

`createSocialMoments` 将 racers 按 plan id/seed 确定性轮转，再组成互不重复的组合：2 或 3 辆车一段，4 辆车两段。单段基准开始于 10.8 秒，两段为 7.2/17.6 秒，各有最多 ±600ms 确定性偏移并限制在赛事内；每段持续 2.1–2.5 秒。没有专属零件时通用挥手，有零件时可选择 `duck-duet`、`umbrella-cover`、`bubble-pass`、`ghost-boo`、`lion-hop` 或 `banana-cheer`， actor/target 方向也确定生成。每辆 racer 至多参与一段。

`sampleSocialMoment` 使用左闭右开绝对时间区间，`sampleSocialPose` 以 sin 包络输出有界 cheer/look/lean；CarAssembly 将其叠加为车身倾斜、司机对视与举手，事件反应仍可并存。HUD 只在自己的 activeCue 不存在时展示社交文案，避免遮住主反应。

`sampleRaceCamera(show, atMs, frame, aspect, reducedMotion)` 不读取上一相机帧：开场平滑接车队全景，activeCue 期间聚焦反应车辆，社交时框住两人，27 秒起或头车 progress 超过约 0.965 后转向终点。镜头在各自边界 cross-fade，事件权重优先于社交，终点镜头最后叠加。竖屏增加宽度/距离，减少动效扩大构图并使用更慢混合；非法时间/aspect 与空帧都有有限回退。相机不修改 ShowPlan/frame，不产生网络消息。

## 车库交互、局部换件与缩略图

`CarAssembly` 构造时建立共用底盘和五槽 rig；轮子槽位创建四个同 ID 实例，其余槽位各一个。车库中 `MonsterCarWorld.setGarage` 只比较并更新变化的槽位，`CarAssembly.setPart(slot, partId)` 移除并释放该槽旧 rig、安装新工厂模型、更新 build，同时保留 root、visual、身份、底盘和其他槽位。同 ID 重设直接返回；paint/身份变化或世界模式切换才重建整车。新 rig 安装后以绝对本地时间播放 0.45 秒 sine 弹跳和最多 18% 放大；减少动效时清理 pending swap，不播放该动效。

预览 host 在 building 阶段可聚焦。pointer down 后捕获 pointer，横向位移以 `deltaX * 0.012` 调整本地 garageYaw；up/cancel/lost capture 都结束手势。左右方向键分别旋转 -0.18/+0.18 rad，提供非拖动等价路径。旋转不修改 draft 或服务器状态。竞演开始后的前 900ms 另有最大 0.28 世界单位的 sine 视觉前冲，它只加到根节点 X，不写回共享采样 progress、finishAtMs 或 standings。

零件货架每页四款，八款共分两页；当前选中零件所在页会自动对齐，前后按钮在边界禁用，零件方向键/Home/End 可跨页并恢复焦点。若选中零件在另一页，当前页第一款保留 `tabIndex=0`，键盘不会跳过整个 radiogroup。五个槽位 tab 仍展示各自当前零件缩略图，但主选项区只有当前页四个，减少同时挂载与烘焙的工作量。“惊喜一下”为每个槽位从当前 ID 之外的七个候选中本地随机选一个，生成完整五槽 draft；默认使用 `Math.random`，可注入 RNG 测试。它不消费赛事/服务端随机流、不立即发网络动作，只有点击出发才发送既有 `build-car`，旁观者无此按钮。

`partThumbnailBaker` 是模块级单例，但 renderer 不是永久常驻资源：

1. `PartThumbnail` 先读 `slot:partId` 静态缓存；未命中才请求烘焙，同键 pending Promise 会合并。
2. 单个队列按槽位排序并串行执行，每项等待一次 RAF；需要时创建一个 240×180、pixel ratio 1、低功耗的 WebGLRenderer。
3. 烘焙器调用共享 `createPartModel`，按包围盒设置正交相机与灯光，渲染后调用 `toDataURL('image/webp', 0.9)`。模型、地面、灯光阴影与 render lists 在 `finally` 中清理，渲染或捕获失败也不会漏释放；最后一个订阅者卸载时，取消尚未开始的排队/等待任务并结算其 Promise。
4. 队列清空 2 秒后 dispose 临时 renderer；静态 data URL Map 不清空，后续切换直接复用。
5. 选项只挂载 `<img>`，加载中显示 skeleton，失败、未启用或 WebGL 已降级时显示 emoji；不存在“每个选项一个 canvas/WebGLRenderer”的结构。缓存不进入 RacePlan、网络消息或房间快照。

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

反应 ID 是渲染和粒子选择行为的稳定数据；`highlight` 是结算中展示的中文高光。

### 40 款零件的专属响应：以目录为真源

空白响应表示该零件没有对应刺激的专属响应，不代表车辆无反应；之后会按优先级继续寻找，最终还有 chassis 通用回退。专属响应默认 `durationMs: 1250`、`intensity: 1`，目录可逐条覆盖。

完整逐零件 stimulus → reaction/highlight/duration/intensity 数据只维护在 `MONSTER_CAR_PART_CATALOG`（`packages/games/src/monster-car/parts.ts`），本文不复制 40 款响应大表。新增 20 款均至少声明一项响应；业务测试遍历协议 ID 和目录，检查元数据、合法 reaction ID、时长/强度及每项响应都能进入 primary 或 secondary。渲染动作配置集中在 `REACTION_LIBRARY`（`rendering/ReactionLibrary.ts`），UI 渲染测试要求目录中每个声明的反应都有显式运动配置。修改响应时同时更新这两处与测试，不要在文档里另建第三份反应目录。

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

### 多项 secondary、司机回退与独立运动

每次解析先选一项 primary，再构造 secondary 数组：

1. 按该刺激的同一槽位优先级遍历，跳过 driver 和 primary 所在槽位；其他槽位若有专属响应，就按遍历顺序各加入一项 secondary。这里不降低目录中的原始 duration/intensity。
2. 若 primary 不是司机，最后追加司机项：有专属响应则使用其 reaction/highlight，否则使用 `driver-water`、`driver-impact`、`driver-wind` 或 `driver-slope`，highlight 为“最佳乘客表情”。该项 intensity 为 0.55，时长为 `min(primary.durationMs, 1100ms)`。
3. 若 primary 本身来自 driver，不再重复司机，最后追加 `chassis-wiggle`：`partId/slot` 均为 chassis，900ms、intensity 0.45、highlight“快乐车身”。

因此 secondary 不再固定为“一项司机反应”；同一事件可同时让多个非主零件和司机/车身参与。primary/secondary 都是公开、可序列化的既有反应契约，数组字段没有改变形状。

`ReactionLibrary` 用运动通道而非为每辆车复制条件分支：`lift`、`forward`、`pitch/roll/yaw`、`squash/wobble`、`spin/open/bounce/wag`、车轮增量、司机抬升/欢呼等由 reaction profile 组合。`sampleReactionPose` 以 sin 包络和 cycles 生成有限姿态，减少动效时降低强度；找不到 reaction ID 时按当前 stimulus 使用通用 profile。

- **primary**：`cue.localProgress` 以 primary/cue 时长计算，并使用 cue 的整体随机 intensity 覆盖主反应强度，驱动整辆车的视觉姿态、主槽位局部 rig、车轮增量和司机姿态。
- **secondary**：`sampleSecondaryProgress` 用 cue 已经过的毫秒数除以该 secondary 自己的 `durationMs`，各项独立截断到 0–1；渲染时强度另乘 0.48，再叠加到对应槽位。非主零件局部动作与司机动作可同时发生，但不重复驱动整车位移。
- **模型节点**：局部姿态只写入工厂公开的 `rotor`、`drum`、`wheel`、`motion`、`spring`、`canopy`、`jaw`、`lid`、`hose`、`steam`、`spout`、`bird`、`tail`、`keys` 等已存在节点；节点不存在时该通道自然无效。

### 分阶段反应表演

`samplePerformanceCue(racer, elapsedMs, reducedMotion)` 是渲染层的第二级绝对时间采样器，不改写 `sampleMonsterCarFrame` 的 activeCue：

1. 正常模式将视觉窗口提前到 `startAtMs - 320ms`；anticipation 从 0 增至 1，悬挂略下沉，司机回望/睁眼，给主反应一个可读预备。
2. 主反应仍从原 startAtMs 计算 localProgress；接触后 anticipation 再用 240ms 连续释放到 0，不发生一帧跳变。ReactionLibrary 对姿态进度截断到 0–1，因此预备期不会提前发射粒子或改变赛事进度。
3. 视觉结束由 primary 与最长 secondary 的较大时长决定，再增加至多 420ms follow-through；secondary 仍按自己的 durationMs 独立截断，follow-through 只加轻微车身回摆。
4. 减少动效时预备/跟随扩展均为 0，既有运动强度也继续按减少动效规则降低。若视觉窗口重叠，选择 startAtMs 较新的 cue。

HUD 高光与音效仍消费共享 `sampleMonsterCarFrame` 的原始 activeCue 窗口；320/420ms 只是 Three.js 表现，不会写入 plan.cues、产生新协议字段或延长服务端阶段。

### 反应粒子语义

粒子类型来自 primary 的 `ReactionProfile.particle`，不再仅按 stimulus 或少数 reaction ID 硬编码。`primaryParticle` 支持 `water`、`wind`、`dust`、`bubble`、`popcorn`、`steam`、`notes`、`spark`、`stars`：水花/风/尘土、泡泡/爆米花、上升蒸汽，以及 notes/spark/stars 的彩色魔法粒子分别使用对应轨迹和配色。secondary 只贡献局部动作，**不额外发射自己的粒子**。未知 reaction 的粒子类型随表现层刺激回退。

`ParticleField` 使用一个固定容量 InstancedMesh（详细模式 420、紧凑模式 220），每帧重建实例列表并受容量上限截断；环境微粒在减少动效时保留 24 个静态粒子，反应粒子和庆祝彩纸则跳过。粒子只表现 primary 和庆祝状态，不影响采样、成绩或网络载荷。GPU 烟花是另一套 `FireworksField`，见下文。

## 计划、采样与“表现不影响成绩”

开局由服务端注入随机源产生 32 位 seed；进入倒计时时，`createMonsterCarRacePlan` 用独立 seeded RNG 生成完整计划。计划和反应 cue 都是普通 JSON 数据，不包含 Three.js 对象、函数、循环引用或系统时钟句柄。ShowPlan 的具名 purpose 哈希/局部流、车库惊喜的本地 Math.random 均不向该 RNG 请求随机数；business 中固定种子的 events、finishOrder、pace、finishAtMs golden 回归锁定既有调用顺序，防止展示新增功能改变比赛。

- 先创建事件，再洗牌 `finishOrder`，随后生成每名 racer 的 pace/cues。
- 完赛时刻按名次为 `28_600 + rank * 280`ms；四人最后一名也在 30 秒内。
- 六段 pace 的每段权重在 0.82–1.18 之间，再归一化到 finishAtMs，形成途中领先交换。
- 零件只用于 build 外观和反应解析；生成 finishOrder 与 pace 时不读取零件，因此交换 builds 不改变同种子下的顺序与配速。
- `sampleMonsterCarFrame` 将请求时间限制到 `[0, 30000]`，按 pace 插值，并重算当前 place/leader/activeCue。采样不依赖上一帧，正序、倒序或跳跃采样同一时刻结果一致。
- 到达 finishAtMs 后允许 progress 略大于 1，形成短暂冲线滑行；这不改变计划中的 finishOrder，HUD 路线会把显示位置限制在 100%。

Three.js 每个显示帧在本地采样，React HUD 的本地回调最多每 125ms 一次。连接恢复后，Web 复用现有 ping/pong，以服务器时间和往返中点估算时钟偏移；车辆与倒计时使用校正后的服务端时间轴，避免设备系统时钟偏差改变所见赛事。浏览器不发送 frame，服务端也不逐帧广播坐标。游戏状态、seed、plan、时间边界和 standings 以 `version: 1` 放入房间快照，比赛中重启不会重掷。40 款扩展仅追加合法 ID 和既有 secondary 数组中的条目，旧 20 款快照保持兼容；ShowPlan、身份、故事、天气、社交、相机、分阶段反应和循环合影都能本地重建，不增加字段或版本。完整网络字段见 `docs/PROTOCOL.md`。

## 场景、性能与减少动效

`MonsterCarWorld` 在车库和竞演/赛后世界之间切换：

- 车库有圆形地台、展台、树木和粒子，展示当前 draft build；改装通过 `setPart` 局部替换模型，不再为每次选择销毁整辆车。
- 竞演按 plan 创建 CourseVisual、每名 racer 的 CarAssembly 和独立阴影；按 ShowPlan 创建一个 WeatherField，并给每辆车应用对应 CarIdentity/头像旗。导演相机在车队、事件、社交与终点镜头间纯函数混合。
- `sampleCourse` 是道路 ribbon、车辆位置、障碍和相机共同使用的纯函数，避免模型漂浮在不同的道路定义上。
- 山体、森林、花草等装饰使用固定本地种子；计划事件使用赛事 seed。天空和水面使用内联 shader，石块、标线、树木、花草和反应粒子使用 InstancedMesh 控制 draw call。
- 窄屏降低森林/花草/粒子数量；RenderSurface 在桌面和移动端都以约 30fps 为上限，移动端另降低 pixel ratio 并关闭阴影，桌面 pixel ratio 也有上限。赛后世界同样约 30fps，减少动效时降到约 5fps；非赛后场景减少动效不另降帧率。
- `document.hidden` 时跳过更新和绘制。减少动效偏好会冻结/削弱环境、idle、悬挂、分阶段反应、天气和粒子表现；赛后直接采样静止合影，不再继续绕场/跳跃或移动车轮，也不会暂停权威计时或改变名次。

固定资源预算如下；容量在构造时确定，不能随比赛/庆典时长增长：

| 资源 | detailed | compact | 更新与生命周期 |
| --- | ---: | ---: | --- |
| `ParticleField` | 420 instances | 220 instances | 每帧在既有 InstancedMesh 中重建环境、primary 反应和彩纸列表，超出容量即截断 |
| `WeatherField` | 360 points | 180 points | 每个竞演世界一个；固定 attributes，只写 time/focusX/reducedMotion uniforms |
| `FireworksField` | 8×72 = 576 points | 6×48 = 288 points | 首次 finished 时一个；固定 attributes，只写时间/减少动效/intensity uniforms |
| 头像旗 | 每辆展示车一张 128×80 CanvasTexture | 同左 | 不挂载 2D canvas；换场/卸载随车辆模型释放纹理 |

森林为详细 150/紧凑 90 组实例化树木，花草为 240/120 组，故事装饰固定 24 个实例。主世界只有一个 renderer；缩略图另有单个按需临时 baker renderer，二者都不按零件或粒子数量创建 WebGL 上下文。所有池、InstancedMesh、几何体、材质、纹理和阴影在 clearWorld/dispose 中释放。

音效按自己车辆的 `plan.id + eventId` 去重触发，终局庆祝按 plan.id 去重。其他车辆是否发声、声音是否可用都不参与规则。

## 完赛后的确定性云朵操场与循环合影

内部 `finished` 到达后，服务端生成 standings 并停在 `finished`；`MonsterCarWorld` 仅设置本地 `celebrating` 布尔值，不增加游戏阶段、协议消息或快照字段。赛事采样 elapsed 仍截断到 30 秒供 HUD 使用，另以 `rawElapsed - plan.durationMs` 得到连续的 `celebrationMs`。

基础 `samplePlaygroundMotion(plan, celebrationMs)` 仍是无游标纯函数：从最终 RacePlan 帧出发，前 1,500ms 用 smoothstep 接入以 `COURSE_LENGTH + 5` 为中心、半径 5.9 的圆环；之后由绝对时间驱动 0.42 rad/s 圆周运动/yaw、单调 travelDistance，以及按 plan seed/racer index 错相的 1.85–2.5 秒周期跳跃。负值和非有限时间归零，不生成名次或改写 plan。

`sampleFinaleMotion` 复用上述基础采样并添加每 20,000ms 重复的编队编舞：

| 每周期赛后相位 | 行为 |
| --- | --- |
| 0–1.5 秒（仅首轮含入场） | 保留基础采样器的终点到圆环平滑入场 |
| 0–5.0 秒 | 圆环绕行与错相庆祝 |
| 5.0–6.4 秒 | smoothstep 驶入当前队形，跳跃和 pitch 渐收 |
| 6.4–9.4 秒 | `photo: true`；所有车辆位置/yaw/pitch、跳跃、celebration 和 travelDistance 完全固定 |
| 9.4–11.4 秒 | 平滑返回基础圆环，恢复行驶 |
| 11.4–20.0 秒 | 继续绕行；下一周期选择下一款队形 |

队形按实际 racer 数量留出整车间距，并由 plan.seed 与 cycle 轮换：

| 车辆数 | 依次可用队形 |
| ---: | --- |
| 2 | `side-by-side` 并排、`facing-pair` 面对面 |
| 3 | `triangle` 三角、`arc` 弧线 |
| 4 | `line` 横列、`diamond` 菱形、`2x2` 方阵 |

旅行里程只扣除已经度过的静止合影时间，因此车轮不会在原地空转，跨多次循环仍单调增长。圆环位置和 yaw 也使用同一个暂停补偿时间线，返场时车轮与车身不会互相错位。同一 plan/时刻以任意顺序调用结果一致；Number.MAX_VALUE 等极端时间也保持有限。`photo` 和 `formation` 只是本地 pose 元数据，不是服务端字段。

`samplePlaygroundCamera(poses, aspect, mode, photo)` 使用去掉跳跃高度后的车辆边界，不追随单次起跳或圆环角度：

- `results` 模式为桌面右侧结果卡横向偏移目标，为竖屏底部结果卡降低目标并扩大视野。
- 结果卡收起后使用 `photo` 模式；合影进入/退出沿用同一构图，不因 photo 布尔值突然变焦，车队/空帧/非法 aspect 均有有限回退。
- 以落地 XZ 边界的旋转不变半径和投影后的高度共同计算 halfWidth，并加整车边距，横竖屏均不裁掉车辆；同一合影姿态得到完全相同的相机。

刷新后由既有 plan 与当前服务器时间直接恢复对应赛后姿态和镜头，不补收动画历史。

## GPU 烟花与暮色过渡

首次进入赛后庆典时创建一个 `FireworksField`，直到世界清理才 dispose。它不是逐帧 new 粒子的 CPU 发射器，而是一份固定种子的 GPU 循环数据：

| 模式 | volley 数 | 每束火花 | 固定点容量 | 循环 period |
| --- | ---: | ---: | ---: | ---: |
| detailed | 8 | 72 | 576 | 10.2 秒 |
| compact | 6 | 48 | 288 | 8.4 秒 |

- 单个 `THREE.Points` 的 BufferGeometry 预分配 position（起点）、`aVelocity`、`aColor`、`aStart`、`aLifetime`、`aSize` TypedArray；容量和 attribute 引用在 update 中不变。
- vertex shader 用 `(time - aStart) mod period` 计算年龄，施加速度/重力、存活判断和淡入淡出；fragment shader 用 `gl_PointCoord` 绘制柔性径向光点。材质为 transparent、AdditiveBlending、depthWrite false。
- update 只写入绝对赛后时间取模、减少动效和 intensity uniforms，不扩张池、不替换 attributes。减少动效时固定在 0.72 秒并降低 alpha，消除时间驱动闪烁；6.4–9.4 秒合影窗 intensity 为 0.55，其他时刻为 1，非法强度有有限截断。
- `CourseVisual.update(..., celebrationSeconds)` 用 `celebrationSeconds / 2` 截断并 smoothstep，在两秒内把当前故事的日间 top/middle/bottom 插值到该故事暮色三色；赛后太阳强度使用较低的庆典值。
- dispose 有幂等保护，移除 Points 并释放 geometry/material；切场和卸载也会清理烟花。

## 结果卡自动收起与手动控制

每次进入新的 `finished` plan 时结果卡展开，并设置一个 5 秒计时器，随后收起为“欢乐车阵 · 礼花庆典”停靠条，让持续操场与烟花露出。点击“看车车和礼花”可提前收起；点击“查看名次”重新展开。手动关闭和重新展开都会清除并置空旧 timer，所以手动展开后不会被先前计时器再次收起，也不会影响车辆/烟花运动。结果卡开关只切换本地 results/photo 相机构图，并通过 `aria-expanded`/`aria-controls` 暴露关系；若焦点位于将被收起的卡片内，会转移到“查看名次”。阶段或 plan 切换、组件卸载时清理 timer。房主在结果卡或停靠条发起的仍是既有 `play-again`，新局保留已提交 build。

## Renderer 生命周期与 DOM 回退

1. `MonsterCarCanvas` 挂载后创建 `MonsterCarWorld`，再创建 `RenderSurface`。
2. RenderSurface 创建 WebGLRenderer，附加 `data-testid="monster-car-canvas"`、`data-render-engine="three.js"` 和初始 `data-render-state="starting"` 的 canvas；成功绘制后状态为 `running`。这与缩略图烘焙器不共享 renderer，但两者不会为每个零件各建一个上下文。
3. ResizeObserver 同步容器尺寸、renderer 尺寸和 orthographic camera。RAF 使用经 ping/pong 偏移校正的绝对时间更新世界，不累计赛事/操场位置状态；shader 的秒数另限制在适合 32 位浮点精度的范围内。
4. WebGLRenderer 构造失败会释放场景并通知面板；运行中 `webglcontextlost` 会阻止默认处理、标记 `lost` 并通知面板。
5. 面板随后以 DOM 汽车预览或 DOM 森林道路替代 canvas，并禁用模型缩略图请求、保留 emoji 控件；竞演中仍按 125ms 调用同一个纯采样函数更新路线、计时和反应。装车、阶段文案与服务端 standings 仍由 React 数据驱动；DOM 回退不是完整 3D 竞演/赛后庆典的等效实现，也不会自行推进规则。
6. 卸载时取消 RAF、断开 observer、移除 context-lost 监听，释放 assembly/course/ParticleField/WeatherField/FireworksField 的几何体和材质、头像旗纹理、阴影、renderer 与 DOM canvas；Soundscape 关闭 AudioContext。重复 dispose 有 disposed 标记保护 RenderSurface、WeatherField 和 FireworksField。

真实 WebGL 是否成功必须由 Chromium E2E 验证。jsdom 不提供真实 GPU 帧管线：`monster-car.test.tsx` 的 mock canvas 和 mock PartThumbnail 只能证明 React 数据流、分页/惊喜草稿与回退；`monster-car-rendering.test.tsx` 证明无 WebGL 的模型/运动协议；`monster-car-presentation.test.tsx` 证明 CarIdentity/ShowPlan/社交/RaceCamera 纯函数及 WeatherField 固定资源契约；`monster-car-celebration.test.tsx` 证明基础 PlaygroundMotion 与 FireworksField；`monster-car-finale.test.tsx` 证明 2/3/4 车循环编队、静止合影和 PlaygroundCamera 构图。它们都不能单独证明 `running`、shader 编译、真实 GPU 资源释放或完整 DOM 回退路径。

Chromium E2E 将车库交互与完整竞演拆成两个独立场景，各自创建/关闭浏览器上下文并受单独超时约束。车库场景检查真实 canvas running、当前页四张缩略图 loaded、翻页、惊喜与旋转；竞演场景检查稳定阶段范围、两端故事/最终 standings 一致、刷新恢复、结果卡与重开后已提交零件保留。不要把它写成对某个瞬时倒计时数字、途中名次、反应姿态、天气粒子、社交镜头或合影帧的断言；截图只是附件。正常与降级测试边界见 `docs/TESTING.md`。

## 修改零件或资产的检查清单

1. 在 `packages/protocol/src/monster-car.ts` 保持五槽结构和合法 ID 一致；纯追加且旧 ID/字段/阶段不变时保留版本 1，不兼容变更必须提升游戏 version。
2. 在 `parts.ts` 补 label、emoji、slot、idle 元数据与响应；确认 primary、多项 secondary、司机/chassis 回退仍满足契约。
3. 在 `rendering/models/` 注册共享模型工厂和必要 rig 节点；在 `ReactionLibrary.ts` 为每个 reaction ID 配运动通道/粒子类型。确认整车与缩略图都能创建模型，`setPart` 只释放被替换槽位；头像旗等新增纹理必须进入 dispose 路径。
4. 保持 finishOrder、finishAtMs 与 pace 不受零件影响；任何速度/名次加成都是另一项规则变更，不能夹在资产修改中。展示身份、天气、社交、相机和合影只能使用独立展示哈希，运行 RacePlan golden 防止 RNG 漂移。
5. 保持货架每页四款、惊喜只改本地草稿、pointer/键盘旋转不联网；play-again 只保留已提交权威 build，并清空 ready/plan/时间/standings。更新 business/network 回归以及 40 款模型/运动无 WebGL 测试。
6. 修改 ShowPlan 时覆盖六故事可达、身份稳定、社交组合不重复、RaceCamera 任意顺序/极端输入；修改天气/烟花时保持 360/180、576/288 固定池、只写 uniforms 和幂等 dispose。真实缩略图、WebGL 画布、resize、刷新恢复、context loss 和 DOM 回退分别用 Chromium 验证。
7. 修改赛后表现时保持 `finished` 权威阶段和现有协议/快照不变，验证 PlaygroundMotion/FinaleMotion 任意顺序采样、2/3/4 车队形、20 秒循环、6.4–9.4 秒静止合影、PlaygroundCamera 安全构图、合影烟花降强度、暮色、减少动效及结果卡旧 timer 取消。
8. 同步 `docs/PROTOCOL.md`、本文及必要的架构/测试说明，不引入未说明的外部素材请求；E2E 只增加稳定状态断言，不把瞬时动画截图当回归 oracle。
