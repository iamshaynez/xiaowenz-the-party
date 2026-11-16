import type { CarEnvironmentId } from './environments';

export const CAN_DRIVE_SLOTS = ['driver', 'motion', 'front', 'rear', 'roof'] as const;
export type CarSlot = (typeof CAN_DRIVE_SLOTS)[number];
export type CanDriveSlot = CarSlot;
export type CarBuild = Record<CarSlot, string>;

export interface CarPartReaction {
  environmentId: CarEnvironmentId;
  text: string;
}

export interface CarPart {
  id: string;
  slot: CarSlot;
  name: string;
  icon: string;
  behavior: string;
  tags: readonly string[];
  reactions: readonly CarPartReaction[];
}

function reactions(...entries: Array<readonly [CarEnvironmentId, string]>): CarPartReaction[] {
  return entries.map(([environmentId, text]) => ({ environmentId, text }));
}

function part(
  slot: CarSlot,
  id: string,
  name: string,
  icon: string,
  behavior: string,
  tags: readonly string[],
  partReactions: readonly CarPartReaction[],
): CarPart {
  return { id, slot, name, icon, behavior, tags, reactions: partReactions };
}

export const CAR_PARTS = {
  driver: [
    part('driver', 'cat', '猫咪司机', '🐱', '灵活变道，但会被自己的尾巴分散注意。', ['agile', 'balanced', 'soft'],
      reactions(['washboard', '把颠簸当成自动揉肩。'], ['dark-cave', '瞳孔开大，夜路照走。'])),
    part('driver', 'robot', '机器人司机', '🤖', '严格计算路线，遇到意外就重新计算人生。', ['precise', 'stable', 'high-tech'],
      reactions(['ice', '开启陀螺仪，努力不跳机械舞。'], ['dark-cave', '切换红外导航，顺便报出湿度。'])),
    part('driver', 'banana', '香蕉司机', '🍌', '重心很弯，转向风格更难预测。', ['light', 'slippery', 'chaotic'],
      reactions(['ice', '终于和自己一样滑的路见面了。'], ['mud', '泥点一沾，变成巧克力香蕉。'])),
    part('driver', 'rice-ball', '饭团司机', '🍙', '三角重心扎实，饿了会越开越慢。', ['stable', 'soft', 'heavy'],
      reactions(['water', '努力不让自己泡成粥。'], ['washboard', '每颠一下就掉一粒米。'])),
    part('driver', 'alien', '外星人司机', '👽', '用不熟悉地球交规的方式理解重力。', ['high-tech', 'lift', 'chaotic'],
      reactions(['jump', '宣布这叫低空返航。'], ['dark-cave', '眼睛发光，省下一盏车灯。'])),
    part('driver', 'hippo', '河马司机', '🦛', '动力充沛、体型稳重，水域尤其自信。', ['heavy', 'power', 'amphibious'],
      reactions(['water', '像回到客厅一样自在。'], ['mud', '开始享受高级泥浴。'])),
    part('driver', 'ghost', '幽灵司机', '👻', '没有实体安全带，偶尔穿过自己的方向盘。', ['light', 'phase', 'weatherproof'],
      reactions(['low-tunnel', '车顶卡住时，司机先穿过去看看。'], ['rain', '雨直接穿过，反而有点失落。'])),
    part('driver', 'sock', '袜子司机', '🧦', '柔软轻便，另一只袜子正在别处失踪。', ['soft', 'light', 'chaotic'],
      reactions(['crosswind', '兜满风后开始寻找另一只袜子。'], ['washboard', '被抖出了洗衣机的熟悉感。'])),
  ],
  motion: [
    part('motion', 'normal-wheels', '普通轮胎', '🛞', '没有噱头，可靠地负责滚动。', ['wheeled', 'balanced', 'grip'],
      reactions(['washboard', '规律弹跳，仍努力保持圆形。'], ['mud', '中规中矩地甩出泥巴。'])),
    part('motion', 'monster-wheels', '怪兽轮胎', '🛞', '巨大胎纹提供动力和通过性。', ['wheeled', 'power', 'suspension', 'heavy', 'high-clearance'],
      reactions(['mud', '把泥潭当成小型自助餐。'], ['soft-blocks', '还没看清积木就越过去了。'])),
    part('motion', 'square-wheels', '方形轮胎', '⬛', '每转一圈完成四次小型落地。', ['wheeled', 'bumpy', 'chaotic', 'slow'],
      reactions(['washboard', '与路面达成共识：一起方。'], ['jump', '起飞前先把四个角都数清楚。'])),
    part('motion', 'tracks', '全地形履带', '⛓️', '牺牲速度换取稳定抓地。', ['tracked', 'grip', 'heavy', 'all-terrain', 'slow'],
      reactions(['mud', '稳稳前进，并留下两条面包纹。'], ['ice', '履带很努力，冰面仍有点意见。'])),
    part('motion', 'springs', '弹簧腿', '🌀', '不靠滚动，靠一连串有方向的弹跳。', ['bouncy', 'suspension', 'stunt', 'chaotic'],
      reactions(['washboard', '路面负责蓄力，弹簧负责加戏。'], ['jump', '坡道只是第二次弹射的借口。'])),
    part('motion', 'balloons', '气球轮', '🎈', '轻飘飘地滑行，浮力大于路感。', ['floating', 'light', 'buoyant', 'fragile', 'low-grip'],
      reactions(['water', '轮胎和车一起思考船生。'], ['crosswind', '瞬间获得不受控制的转向助力。'])),
    part('motion', 'skis', '滑雪板', '🎿', '在光滑表面很快，在粗糙表面很诚实。', ['sliding', 'ice', 'low-friction', 'fast'],
      reactions(['ice', '终于来到专业场地。'], ['mud', '滑雪板沉默地变成了搅拌棒。'])),
    part('motion', 'duck-feet', '鸭掌', '🦆', '啪嗒啪嗒前进，水陆都很有节奏。', ['amphibious', 'soft', 'water-grip', 'comedic'],
      reactions(['water', '划水效率让旁边鸭子点头。'], ['washboard', '每一步都发出不同音调。'])),
  ],
  front: [
    part('front', 'bumper', '老实防撞杠', '🚧', '把冲击分散到整块车头。', ['safety', 'stable', 'heavy'],
      reactions(['soft-blocks', '礼貌推开积木，没有一块受伤。'], ['low-tunnel', '先隧道一步感到紧张。'])),
    part('front', 'plow', '推土铲', '🚜', '把前方障碍统一归类为待移动物品。', ['digging', 'power', 'heavy', 'all-terrain'],
      reactions(['mud', '顺手开辟一条巧克力运河。'], ['soft-blocks', '推出了一个很平的建筑工地。'])),
    part('front', 'boxing-glove', '拳击手套', '🥊', '碰撞后回弹，偶尔比车先冲出去。', ['bouncy', 'impact', 'chaotic'],
      reactions(['soft-blocks', '每块积木都获得一次出局机会。'], ['jump', '落地时替整车先出一拳。'])),
    part('front', 'vacuum', '强力吸尘器', '🌪️', '吸走轻质障碍，也吸走路边注意力。', ['suction', 'clean', 'special'],
      reactions(['rain', '吸了半天，水箱先满了。'], ['soft-blocks', '积木没吸进来，说明书吸进来了。'])),
    part('front', 'magnet', '大磁铁', '🧲', '吸引金属零件，不问它们愿不愿意。', ['magnetic', 'special', 'heavy'],
      reactions(['dark-cave', '吸来一枚来历不明的硬币照明。'], ['soft-blocks', '发现积木不导电后略显失望。'])),
    part('front', 'drill', '疯狂钻头', '🪛', '持续旋转，把阻挡理解成待钻材料。', ['digging', 'power', 'chaotic'],
      reactions(['low-tunnel', '试图把限高改成不限高。'], ['mud', '钻出一杯非常厚的泥浆奶昔。'])),
    part('front', 'pillow', '枕头车头', '🛏️', '柔软吸能，碰撞看起来也很困。', ['soft', 'safety', 'bouncy', 'light'],
      reactions(['soft-blocks', '和积木一起举办睡衣派对。'], ['water', '吸水后突然变得非常踏实。'])),
    part('front', 'duck-bill', '鸭嘴车头', '🐤', '扁宽车头适合拨水，也适合嘎嘎。', ['amphibious', 'soft', 'comedic'],
      reactions(['water', '一边前进一边过滤并不存在的浮游生物。'], ['soft-blocks', '每撞一块就配音一声嘎。'])),
  ],
  rear: [
    part('rear', 'spoiler', '帅气尾翼', '🪽', '速度越快，越努力把车按回地面。', ['aero', 'stable', 'fast', 'style'],
      reactions(['crosswind', '努力保持姿态，顺便展示侧面。'], ['jump', '空中仍坚持自己很有用。'])),
    part('rear', 'rocket', '火箭推进器', '🚀', '提供猛烈推力，刹车不在套餐内。', ['thrust', 'fast', 'chaotic', 'fire'],
      reactions(['rain', '火焰发出呲的一声继续加班。'], ['jump', '把飞跃临时升级成发射任务。'])),
    part('rear', 'fan', '电风扇尾推', '🪭', '风力温和，发型影响显著。', ['thrust', 'wind', 'light'],
      reactions(['crosswind', '终于分清顺风和逆风的区别。'], ['water', '把水花吹成移动喷雾。'])),
    part('rear', 'bubbles', '泡泡机', '🫧', '持续留下轻盈泡泡和错误尾迹。', ['buoyant', 'style', 'chaotic', 'fragile'],
      reactions(['rain', '泡泡刚出门就被雨点签收。'], ['dark-cave', '泡泡反光，假装自己是探照灯。'])),
    part('rear', 'water-cannon', '后坐力水炮', '🔫', '向后喷水，同时提供不可忽略的反推。', ['water', 'recoil', 'thrust', 'chaotic'],
      reactions(['water', '坚持认为是在用专业方式划水。'], ['mud', '把泥点均匀分享给后方观众。'])),
    part('rear', 'confetti', '彩带炮', '🎉', '不分场合地制造终点氛围。', ['style', 'party', 'light'],
      reactions(['jump', '还没到终点就提前庆祝。'], ['rain', '彩带变成纸糊，但气氛没糊。'])),
    part('rear', 'spring-tail', '弹簧尾巴', '🌀', '车尾触地回弹，偶尔提供额外跃起。', ['bouncy', 'stunt', 'chaotic'],
      reactions(['washboard', '车尾比车头多走了三倍路程。'], ['jump', '落地后又擅自续跳一次。'])),
    part('rear', 'music-horn', '音乐喇叭', '🎺', '用嘹亮旋律替代普通排气声。', ['musical', 'style', 'loud'],
      reactions(['dark-cave', '回声免费组了一支铜管乐队。'], ['low-tunnel', '音量翻倍，隧道拒绝返场。'])),
  ],
  roof: [
    part('roof', 'flag', '飘扬旗帜', '🚩', '明确展示车队立场：尽量向前。', ['style', 'wind-catching', 'light'],
      reactions(['crosswind', '旗面瞬间变成水平直线。'], ['low-tunnel', '旗杆先向隧道敬礼。'])),
    part('roof', 'umbrella', '大雨伞', '☂️', '挡雨可靠，兜风也同样可靠。', ['shelter', 'wind-catching', 'light'],
      reactions(['rain', '司机很干，车轮全湿。'], ['crosswind', '短暂获得一张不情愿的风帆。'])),
    part('roof', 'propeller', '车顶螺旋桨', '🚁', '旋转时产生升力和大量心理安慰。', ['lift', 'wind', 'chaotic'],
      reactions(['jump', '努力把车翻译成直升机。'], ['low-tunnel', '被限高杆按下了暂停键。'])),
    part('roof', 'searchlight', '探照灯', '🔦', '照亮远处，也照亮路边的困惑表情。', ['light-source', 'night', 'special'],
      reactions(['dark-cave', '终于让山洞露出尴尬表情。'], ['rain', '照出每一滴很有存在感的雨。'])),
    part('roof', 'trampoline', '迷你蹦床', '🤸', '车顶物品可以反弹，车顶本身也是。', ['bouncy', 'stunt', 'chaotic'],
      reactions(['jump', '在空中又举办了一场小型跳跃。'], ['low-tunnel', '蹦床和隧道互相弹开。'])),
    part('roof', 'satellite', '卫星导航锅', '📡', '搜索信号、计算轨迹，偶尔接收球赛。', ['high-tech', 'navigation', 'style'],
      reactions(['dark-cave', '失去信号后改用星星口述路线。'], ['crosswind', '卫星锅转成了天气预报现场。'])),
    part('roof', 'flowerpot', '车顶花盆', '🪴', '增加一点自然气息和不必要的重心。', ['heavy', 'fragile', 'garden'],
      reactions(['rain', '全车只有这盆花真心开心。'], ['washboard', '每颠一下就自动松土。'])),
    part('roof', 'windmill', '风力小风车', '🎡', '借风旋转，顺便给电机一点微弱希望。', ['wind', 'thrust', 'style', 'green'],
      reactions(['crosswind', '转速拉满，开始供应想象中的电。'], ['low-tunnel', '叶片折叠成一排惊讶的省略号。'])),
  ],
} as const satisfies Record<CarSlot, readonly CarPart[]>;

export const DEFAULT_CAR_BUILD = {
  driver: 'cat',
  motion: 'square-wheels',
  front: 'pillow',
  rear: 'rocket',
  roof: 'umbrella',
} as const satisfies CarBuild;

export function cloneCarBuild(build: CarBuild): CarBuild {
  return {
    driver: build.driver,
    motion: build.motion,
    front: build.front,
    rear: build.rear,
    roof: build.roof,
  };
}

export function getCarPart(slot: CarSlot, partId: string): CarPart | undefined {
  return CAR_PARTS[slot].find((candidate) => candidate.id === partId);
}

export function getBuildParts(build: CarBuild): CarPart[] {
  return CAN_DRIVE_SLOTS.flatMap((slot) => {
    const selected = getCarPart(slot, build[slot]);
    return selected ? [selected] : [];
  });
}
