export type CarEnvironmentId =
  | 'washboard'
  | 'mud'
  | 'water'
  | 'ice'
  | 'crosswind'
  | 'rain'
  | 'low-tunnel'
  | 'dark-cave'
  | 'soft-blocks'
  | 'jump';

export type CarEnvironmentCategory = 'terrain' | 'weather' | 'special' | 'ability' | 'finale';

export interface CarEnvironment {
  id: CarEnvironmentId;
  name: string;
  icon: string;
  category: CarEnvironmentCategory;
  description: string;
  traction: number;
  resistance: number;
  roughness: number;
  crosswind: number;
  darkness: number;
  ceilingM: number | null;
  obstacle: 'none' | 'soft-blocks' | 'ramp';
}

export const CAR_ENVIRONMENTS = [
  {
    id: 'washboard', name: '搓衣板路', icon: '〰️', category: 'terrain',
    description: '密集起伏把每次加速都变成按摩。',
    traction: 0.9, resistance: 1.25, roughness: 1.8, crosswind: 0, darkness: 0, ceilingM: null, obstacle: 'none',
  },
  {
    id: 'mud', name: '焦糖泥潭', icon: '🟤', category: 'terrain',
    description: '黏稠泥地会吞掉转速，也会保住零件。',
    traction: 0.58, resistance: 2.1, roughness: 0.45, crosswind: 0, darkness: 0, ceilingM: null, obstacle: 'none',
  },
  {
    id: 'water', name: '浅水航道', icon: '💧', category: 'terrain',
    description: '水花越大，旁观者越容易被误伤。',
    traction: 0.68, resistance: 1.75, roughness: 0.1, crosswind: 0, darkness: 0, ceilingM: null, obstacle: 'none',
  },
  {
    id: 'ice', name: '镜面冰场', icon: '🧊', category: 'terrain',
    description: '抓地力请假，方向主要靠缘分。',
    traction: 0.24, resistance: 0.42, roughness: 0, crosswind: 0, darkness: 0, ceilingM: null, obstacle: 'none',
  },
  {
    id: 'crosswind', name: '侧风走廊', icon: '🌬️', category: 'weather',
    description: '横向阵风专治各种直线路线。',
    traction: 0.92, resistance: 0.8, roughness: 0.1, crosswind: 1.8, darkness: 0, ceilingM: null, obstacle: 'none',
  },
  {
    id: 'rain', name: '倾盆大雨', icon: '🌧️', category: 'weather',
    description: '湿滑路面配上免费全车冲洗。',
    traction: 0.55, resistance: 1.05, roughness: 0.15, crosswind: 0.35, darkness: 0.25, ceilingM: null, obstacle: 'none',
  },
  {
    id: 'low-tunnel', name: '限高隧道', icon: '🚇', category: 'special',
    description: '车顶创意需要先通过身高检查。',
    traction: 0.95, resistance: 0.75, roughness: 0, crosswind: 0, darkness: 0.35, ceilingM: 1.35, obstacle: 'none',
  },
  {
    id: 'dark-cave', name: '漆黑山洞', icon: '🕳️', category: 'special',
    description: '没有照明时，回声负责导航。',
    traction: 0.82, resistance: 0.9, roughness: 0.65, crosswind: 0, darkness: 1, ceilingM: 2.8, obstacle: 'none',
  },
  {
    id: 'soft-blocks', name: '软积木阵', icon: '🧱', category: 'ability',
    description: '可以撞，而且撞倒了也不算肇事。',
    traction: 0.88, resistance: 1.15, roughness: 0.25, crosswind: 0, darkness: 0, ceilingM: null, obstacle: 'soft-blocks',
  },
  {
    id: 'jump', name: '终极飞跃台', icon: '🚀', category: 'finale',
    description: '最后十二秒，用坡道检验整辆车的理想。',
    traction: 1, resistance: 0.55, roughness: 0, crosswind: 0, darkness: 0, ceilingM: null, obstacle: 'ramp',
  },
] as const satisfies readonly CarEnvironment[];
