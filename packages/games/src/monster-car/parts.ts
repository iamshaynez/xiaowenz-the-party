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

  const driverSlot: MonsterCarSlot = 'driver';
  const driverId = build.driver;
  const driverResponse = definitionFor(build, driverSlot).responses[stimulus];
  const secondary: ResolvedMonsterCarReaction[] = [{
    reaction: driverResponse?.reaction ?? `driver-${stimulus}`,
    durationMs: Math.min(primary.durationMs, 1_100),
    intensity: 0.55,
    highlight: driverResponse?.highlight ?? '最佳乘客表情',
    partId: driverId,
    slot: driverSlot,
  }];
  if (primary.slot === 'driver') {
    secondary[0] = {
      reaction: 'chassis-wiggle', durationMs: 900, intensity: 0.45,
      highlight: '快乐车身', partId: 'chassis', slot: 'chassis',
    };
  }
  return { primary, secondary };
}
