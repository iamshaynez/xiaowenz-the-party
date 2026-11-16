import type { CarShowStats } from './show';

export interface CarAward {
  id: string;
  name: string;
  icon: string;
  description: string;
  score: (stats: CarShowStats) => number;
}

export interface CarAwardAssignment {
  playerId: string;
  awardId: string;
}

export const CAR_AWARDS = [
  {
    id: 'street-rocket', name: '街道火箭候审奖', icon: '🚀',
    description: '速度证明了推进器有效，也证明了刹车需要开会。',
    score: (stats) => stats.topSpeedKph,
  },
  {
    id: 'temporary-airport', name: '临时停机坪奖', icon: '🛫',
    description: '本轮最持久的离地状态，航空部门已收到非正式通知。',
    score: (stats) => stats.airtimeMs / 100 + stats.maxHeightM * 4,
  },
  {
    id: 'long-goodbye', name: '远方不一定有车奖', icon: '🌈',
    description: '飞跃距离让终点线开始怀疑自己的位置。',
    score: (stats) => stats.jumpDistanceM * 1.5,
  },
  {
    id: 'block-demolition', name: '积木拆迁办锦旗', icon: '🧱',
    description: '没有一块软积木能带着完整结构离开现场。',
    score: (stats) => stats.softBlocksHit * 8,
  },
  {
    id: 'bumper-member', name: '碰碰车荣誉会员', icon: '💥',
    description: '把碰撞当成交谈，把车损当成语气。',
    score: (stats) => stats.collisions * 6,
  },
  {
    id: 'car-gyroscope', name: '车载陀螺认证', icon: '🌀',
    description: '前进方向是一种建议，旋转才是本体。',
    score: (stats) => stats.spins * 14,
  },
  {
    id: 'splash-captain', name: '浪花气氛组长', icon: '💦',
    description: '车辆是否防水未知，观众已经全面补水。',
    score: (stats) => stats.splashes * 7,
  },
  {
    id: 'busy-in-place', name: '原地也很忙奖', icon: '🐌',
    description: '转速、音量和表情都在前进，只有车没有。',
    score: (stats) => stats.stuckMs / 250,
  },
  {
    id: 'parking-guardian', name: '停车位守护神', icon: '🅿️',
    description: '用极短的行驶距离守住出发时的初心。',
    score: (stats) => Math.max(0, 45 - stats.distanceM),
  },
  {
    id: 'pose-over-speed', name: '姿势比速度重要奖', icon: '✨',
    description: '性能可以争论，镜头表现没有输。',
    score: (stats) => stats.stylePoints * 2,
  },
  {
    id: 'chaotic-neutral', name: '混乱中立驾驶员', icon: '🎭',
    description: '每个零件都有想法，而且它们同时发言。',
    score: (stats) => stats.chaosPoints * 1.8,
  },
  {
    id: 'somehow-arrived', name: '居然真的到了奖', icon: '🏁',
    description: '过程无法复现，结果值得鼓掌。',
    score: (stats) => stats.finished ? stats.chaosPoints + stats.collisions * 3 + 5 : 0,
  },
  {
    id: 'landing-judge', name: '落地姿势满分奖', icon: '🧘',
    description: '起跳可以意外，落地必须体面。',
    score: (stats) => stats.landedUpright ? Math.max(2, 30 - stats.spins * 5 - stats.collisions * 2) : 0,
  },
  {
    id: 'scenery-enjoyer', name: '沿途风景鉴赏家', icon: '🐢',
    description: '不是慢，是给每处风景足够的尊重。',
    score: (stats) => Math.max(0, 32 - stats.averageSpeedKph) + (stats.finished ? 4 : 0),
  },
  {
    id: 'brave-participant', name: '参与就很勇敢奖', icon: '🎗️',
    description: '没有打破纪录，但完整参与了这场机械冒险。',
    score: (stats) => stats.finished ? 1 : 0.5,
  },
] as const satisfies readonly CarAward[];

export const FALLBACK_CAR_AWARD_ID = 'brave-participant';

export function getCarAward(awardId: string): CarAward | undefined {
  return CAR_AWARDS.find((award) => award.id === awardId);
}

export function assignCarAwards(
  cars: readonly { playerId: string; stats: CarShowStats }[],
): CarAwardAssignment[] {
  const used = new Set<string>();
  return cars.map((car) => {
    const available = CAR_AWARDS.filter((award) => !used.has(award.id));
    let selected = available[0] ?? CAR_AWARDS[0];
    let bestScore = Number.NEGATIVE_INFINITY;
    for (const award of available) {
      const score = award.score(car.stats);
      if (score > bestScore) {
        selected = award;
        bestScore = score;
      }
    }
    if (bestScore <= 0) {
      selected = available.find((award) => award.id === FALLBACK_CAR_AWARD_ID) ?? selected;
    }
    used.add(selected.id);
    return { playerId: car.playerId, awardId: selected.id };
  });
}
