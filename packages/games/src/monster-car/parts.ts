import type { MonsterCarBuild, MonsterCarSlot } from '@party/protocol';

export type MonsterCarStimulus = 'water' | 'impact' | 'wind' | 'slope';
export type MonsterCarReactionSlot = MonsterCarSlot | 'chassis';

export interface MonsterCarReactionDefinition {
  reaction: string;
  durationMs: number;
  intensity: number;
  highlight: string;
}

export interface MonsterCarPartDefinition {
  slot: MonsterCarSlot;
  label: string;
  emoji: string;
  idle: 'none' | 'spin' | 'bounce' | 'sway' | 'blink';
  responses: Partial<Record<MonsterCarStimulus, MonsterCarReactionDefinition>>;
}

export interface ResolvedMonsterCarReaction extends MonsterCarReactionDefinition {
  partId: string;
  slot: MonsterCarReactionSlot;
}

export interface ResolvedMonsterCarCarReaction {
  primary: ResolvedMonsterCarReaction;
  secondary: ResolvedMonsterCarReaction[];
}

const response = (
  reaction: string,
  highlight: string,
  durationMs = 1_250,
  intensity = 1,
): MonsterCarReactionDefinition => ({ reaction, highlight, durationMs, intensity });

export const MONSTER_CAR_PART_CATALOG: Record<
  MonsterCarSlot,
  Record<string, MonsterCarPartDefinition>
> = {
  wheels: {
    classic: { slot: 'wheels', label: '圆圆轮', emoji: '⚙️', idle: 'spin', responses: {} },
    donut: {
      slot: 'wheels', label: '甜甜圈轮', emoji: '🍩', idle: 'spin',
      responses: {
        water: response('donut-splash', '甜甜圈冲浪手'),
        impact: response('donut-roll', '糖霜弹跳王'),
      },
    },
    spring: {
      slot: 'wheels', label: '弹簧轮', emoji: '🌀', idle: 'bounce',
      responses: {
        impact: response('spring-bounce', '飞跃木头冠军', 1_500, 1.2),
        slope: response('spring-bounce', '山坡弹跳家', 1_400, 1.05),
      },
    },
    balloon: {
      slot: 'wheels', label: '气球轮', emoji: '🎈', idle: 'bounce',
      responses: {
        water: response('balloon-float', '轻飘飘水手'),
        wind: response('balloon-float', '乘风气球车', 1_600, 1.15),
        impact: response('soft-squash', '软乎乎碰撞家'),
      },
    },
    banana: {
      slot: 'wheels', label: '香蕉轮', emoji: '🍌', idle: 'spin',
      responses: {
        water: response('banana-peel-paddle', '香蕉皮冲浪选手'),
        impact: response('banana-peel-skid', '香蕉皮漂移冠军', 1_400, 1.1),
      },
    },
    square: {
      slot: 'wheels', label: '方方轮', emoji: '🟨', idle: 'bounce',
      responses: {
        impact: response('square-wheel-clunk', '方轮咚咚打击乐', 1_400, 1.15),
        slope: response('square-wheel-tumble', '方轮翻山街舞王', 1_500, 1.1),
      },
    },
    'bubble-tea': {
      slot: 'wheels', label: '珍珠奶茶轮', emoji: '🧋', idle: 'bounce',
      responses: {
        water: response('bubble-tea-boba-splash', '珍珠奶茶冲浪杯'),
        slope: response('bubble-tea-boba-bounce', '珍珠爬坡弹弹乐', 1_450, 1.1),
      },
    },
    'duck-float': {
      slot: 'wheels', label: '鸭鸭泳圈轮', emoji: '🛟', idle: 'bounce',
      responses: {
        water: response('duck-float-paddle', '泳圈鸭鸭漂流王', 1_600, 1.15),
        wind: response('duck-float-sail', '乘风泳圈鸭', 1_500, 1.1),
        impact: response('duck-float-squeak', '泳圈防撞嘎嘎队'),
      },
    },
  },
  front: {
    smile: { slot: 'front', label: '微笑车头', emoji: '😊', idle: 'blink', responses: {} },
    duck: {
      slot: 'front', label: '鸭鸭船头', emoji: '🦆', idle: 'sway',
      responses: { water: response('duck-paddle', '嘎嘎划水冠军', 1_600, 1.1) },
    },
    train: {
      slot: 'front', label: '火车烟囱', emoji: '🚂', idle: 'none',
      responses: {
        impact: response('train-toot', '森林鸣笛家'),
        slope: response('train-toot', '翻山小火车'),
      },
    },
    scoop: {
      slot: 'front', label: '鼹鼠铲铲', emoji: '🦫', idle: 'sway',
      responses: {
        water: response('scoop-splash', '超大水花制造机', 1_400, 1.15),
        impact: response('scoop-hop', '铲铲跳跃王'),
      },
    },
    shark: {
      slot: 'front', label: '鲨鱼车头', emoji: '🦈', idle: 'sway',
      responses: {
        water: response('shark-fin-splash', '鲨鱼鳍划水冠军', 1_500, 1.15),
        slope: response('shark-fin-surf', '陆地冲浪大鲨鱼'),
      },
    },
    vacuum: {
      slot: 'front', label: '吸尘器车头', emoji: '🧹', idle: 'spin',
      responses: {
        water: response('vacuum-puddle-slurp', '吸干水坑小能手'),
        impact: response('vacuum-log-slurp', '一口吸走小木头', 1_500, 1.2),
        wind: response('vacuum-gust-slurp', '把阵风吸进肚子', 1_450, 1.1),
      },
    },
    'ice-cream': {
      slot: 'front', label: '冰淇淋车头', emoji: '🍦', idle: 'sway',
      responses: {
        water: response('ice-cream-sprinkle-splash', '糖针水花甜筒车'),
        impact: response('ice-cream-wobble', '冰淇淋叠叠摇摆王'),
        wind: response('ice-cream-brain-freeze', '被风吹到脑冻结'),
      },
    },
    piano: {
      slot: 'front', label: '钢琴车头', emoji: '🎹', idle: 'bounce',
      responses: {
        impact: response('piano-crash-chord', '撞出爵士和弦'),
        slope: response('piano-hill-glissando', '上坡滑奏音乐家', 1_600, 1.1),
      },
    },
  },
  rear: {
    trunk: { slot: 'rear', label: '旅行小箱', emoji: '🧳', idle: 'bounce', responses: {} },
    rocket: {
      slot: 'rear', label: '爆米花火箭', emoji: '🚀', idle: 'sway',
      responses: {
        slope: response('rocket-popcorn', '爆米花推进器', 1_700, 1.2),
        wind: response('rocket-wobble', '风里摇摆火箭'),
      },
    },
    bubble: {
      slot: 'rear', label: '泡泡浴缸', emoji: '🛁', idle: 'bounce',
      responses: {
        water: response('bubble-foam', '泡泡翻倍魔法', 1_650, 1.2),
        slope: response('bubble-trail', '一路泡泡尾巴'),
      },
    },
    tail: {
      slot: 'rear', label: '快乐尾巴', emoji: '🦊', idle: 'sway',
      responses: {
        wind: response('tail-wag', '风中摇尾冠军'),
        impact: response('tail-wag', '开心摇摇尾'),
      },
    },
    'washing-machine': {
      slot: 'rear', label: '滚筒洗衣机', emoji: '🧺', idle: 'spin',
      responses: {
        water: response('washing-machine-spin-cycle', '水坑脱水小滚筒', 1_650, 1.2),
        impact: response('washing-machine-rattle', '滚筒哐当洗衣舞'),
        wind: response('washing-machine-fluff', '阵风吹干小床单'),
      },
    },
    campfire: {
      slot: 'rear', label: '篝火小车尾', emoji: '🔥', idle: 'bounce',
      responses: {
        water: response('campfire-steam-hiss', '水坑蒸汽小火锅'),
        wind: response('campfire-spark-dance', '火星迎风霹雳舞', 1_500, 1.15),
        impact: response('campfire-marshmallow-pop', '震飞棉花糖冠军'),
      },
    },
    jackbox: {
      slot: 'rear', label: '惊喜弹簧盒', emoji: '🎁', idle: 'bounce',
      responses: {
        impact: response('jackbox-surprise-pop', '撞出惊喜弹簧人', 1_500, 1.2),
        slope: response('jackbox-peekaboo', '山顶躲猫猫冠军'),
        wind: response('jackbox-lid-flap', '盒盖迎风打拍子'),
      },
    },
    snail: {
      slot: 'rear', label: '蜗牛小车尾', emoji: '🐌', idle: 'sway',
      responses: {
        slope: response('snail-slow-climb', '慢悠悠爬坡冠军', 1_800, 0.9),
        water: response('snail-slime-splash', '亮晶晶黏液水手'),
        wind: response('snail-shell-tilt', '风吹蜗壳不倒翁'),
      },
    },
  },
  roof: {
    mushroom: {
      slot: 'roof', label: '蘑菇车顶', emoji: '🍄', idle: 'bounce',
      responses: {
        water: response('mushroom-bloom', '雨中开花蘑菇'),
        impact: response('mushroom-boing', '蘑菇蹦蹦车'),
      },
    },
    umbrella: {
      slot: 'roof', label: '雨伞车顶', emoji: '☂️', idle: 'sway',
      responses: {
        wind: response('umbrella-sail', '森林飞行伞', 1_800, 1.25),
        water: response('umbrella-open', '最干爽旅行家'),
      },
    },
    propeller: {
      slot: 'roof', label: '螺旋桨', emoji: '🚁', idle: 'spin',
      responses: {
        wind: response('propeller-flight', '旋风飞行员', 1_650, 1.15),
        slope: response('propeller-spin', '山坡螺旋桨'),
      },
    },
    antenna: {
      slot: 'roof', label: '星星天线', emoji: '⭐', idle: 'sway',
      responses: {
        wind: response('antenna-wobble', '接收风声的人'),
        impact: response('antenna-boing', '星星摇摇乐'),
      },
    },
    teapot: {
      slot: 'roof', label: '茶壶车顶', emoji: '🫖', idle: 'sway',
      responses: {
        water: response('teapot-rain-brew', '雨水泡茶大师', 1_500, 1.05),
        slope: response('teapot-hill-whistle', '山顶鸣笛小茶壶'),
        impact: response('teapot-lid-rattle', '壶盖哐当打击乐'),
      },
    },
    birdcage: {
      slot: 'roof', label: '鸟笼车顶', emoji: '🪶', idle: 'sway',
      responses: {
        wind: response('birdcage-wind-chirp', '风里合唱小鸟笼'),
        impact: response('birdcage-swing', '鸟笼秋千领航员'),
      },
    },
    cactus: {
      slot: 'roof', label: '仙人掌车顶', emoji: '🌵', idle: 'bounce',
      responses: {
        water: response('cactus-rain-storage', '喝水不眨眼仙人掌'),
        impact: response('cactus-soft-boing', '看着扎其实软弹弹'),
        wind: response('cactus-needle-conduct', '尖刺指挥风声团'),
      },
    },
    whale: {
      slot: 'roof', label: '鲸鱼车顶', emoji: '🐳', idle: 'bounce',
      responses: {
        water: response('whale-spout', '车顶鲸鱼喷泉秀', 1_700, 1.25),
        wind: response('whale-tail-sail', '鲸尾迎风领航员'),
        impact: response('whale-belly-bounce', '鲸鱼肚皮减震器'),
      },
    },
  },
  driver: {
    bear: {
      slot: 'driver', label: '小熊司机', emoji: '🐻', idle: 'blink',
      responses: { impact: response('bear-hold', '抱紧方向盘冠军') },
    },
    frog: {
      slot: 'driver', label: '青蛙司机', emoji: '🐸', idle: 'bounce',
      responses: {
        water: response('frog-croak', '水坑歌唱家'),
        impact: response('frog-hop', '青蛙跳跳司机'),
      },
    },
    duck: {
      slot: 'driver', label: '小鸭司机', emoji: '🐤', idle: 'sway',
      responses: { water: response('driver-splash', '玩水小鸭司机') },
    },
    alien: {
      slot: 'driver', label: '外星司机', emoji: '👽', idle: 'blink',
      responses: {
        wind: response('alien-float', '失重外星司机'),
        slope: response('alien-anticipation', '山坡预测大师'),
      },
    },
    robot: {
      slot: 'driver', label: '机器人司机', emoji: '🤖', idle: 'blink',
      responses: {
        impact: response('robot-bolt-rattle', '螺丝松半圈车手'),
        wind: response('robot-reboot-wobble', '迎风重启机器人'),
        water: response('robot-splash-dance', '防水机器人泼水舞'),
      },
    },
    penguin: {
      slot: 'driver', label: '企鹅司机', emoji: '🐧', idle: 'sway',
      responses: {
        water: response('penguin-belly-slide', '肚皮划水企鹅司机', 1_600, 1.15),
        slope: response('penguin-waddle-climb', '摇摆爬坡小企鹅'),
        impact: response('penguin-brake-hop', '企鹅刹车蹦蹦跳'),
      },
    },
    ghost: {
      slot: 'driver', label: '幽灵司机', emoji: '👻', idle: 'bounce',
      responses: {
        wind: response('ghost-sheet-flap', '被风吹成床单鬼'),
        impact: response('ghost-boo-bounce', '吓木头一跳司机'),
        water: response('ghost-mist-hover', '水上漂透明司机'),
      },
    },
    lion: {
      slot: 'driver', label: '狮子司机', emoji: '🦁', idle: 'blink',
      responses: {
        impact: response('lion-roar-bounce', '怒吼减震狮司机'),
        wind: response('lion-mane-blowdry', '阵风吹鬃毛造型师'),
        slope: response('lion-summit-roar', '山顶狮王报到'),
      },
    },
  },
};

const SLOT_PRIORITY: Record<MonsterCarStimulus, MonsterCarSlot[]> = {
  water: ['front', 'wheels', 'roof', 'driver', 'rear'],
  impact: ['wheels', 'roof', 'front', 'driver', 'rear'],
  wind: ['roof', 'rear', 'driver', 'wheels', 'front'],
  slope: ['wheels', 'rear', 'roof', 'front', 'driver'],
};

const GENERIC: Record<MonsterCarStimulus, MonsterCarReactionDefinition> = {
  water: response('classic-splash', '晶亮水花制造机'),
  impact: response('classic-bump', '勇敢越过小障碍'),
  wind: response('classic-wind', '迎风旅行家'),
  slope: response('classic-slope', '稳稳翻山冠军'),
};

function definitionFor(build: MonsterCarBuild, slot: MonsterCarSlot) {
  const definition = MONSTER_CAR_PART_CATALOG[slot][build[slot]];
  if (!definition) throw new Error(`未知怪兽汽车组件：${slot}/${build[slot]}`);
  return definition;
}

export function resolveMonsterCarReaction(
  build: MonsterCarBuild,
  stimulus: MonsterCarStimulus,
): ResolvedMonsterCarCarReaction {
  let primary: ResolvedMonsterCarReaction | null = null;
  for (const slot of SLOT_PRIORITY[stimulus]) {
    const partId = build[slot];
    const specific = definitionFor(build, slot).responses[stimulus];
    if (specific) {
      primary = { ...specific, partId, slot };
      break;
    }
  }
  primary ??= { ...GENERIC[stimulus], partId: 'chassis', slot: 'chassis' };

  const secondary: ResolvedMonsterCarReaction[] = [];
  for (const slot of SLOT_PRIORITY[stimulus]) {
    if (slot === 'driver' || slot === primary.slot) continue;
    const specific = definitionFor(build, slot).responses[stimulus];
    if (specific) secondary.push({ ...specific, partId: build[slot], slot });
  }

  const driverSlot: MonsterCarSlot = 'driver';
  const driverId = build.driver;
  const driverResponse = definitionFor(build, driverSlot).responses[stimulus];
  if (primary.slot === driverSlot) {
    secondary.push({
      reaction: 'chassis-wiggle', durationMs: 900, intensity: 0.45,
      highlight: '快乐车身', partId: 'chassis', slot: 'chassis',
    });
  } else {
    secondary.push({
      reaction: driverResponse?.reaction ?? `driver-${stimulus}`,
      durationMs: Math.min(primary.durationMs, 1_100),
      intensity: 0.55,
      highlight: driverResponse?.highlight ?? '最佳乘客表情',
      partId: driverId,
      slot: driverSlot,
    });
  }
  return { primary, secondary };
}
