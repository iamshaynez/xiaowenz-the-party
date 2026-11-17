import { z } from 'zod';

export const MONSTER_CAR_SLOTS = ['wheels', 'front', 'rear', 'roof', 'driver'] as const;
export type MonsterCarSlot = (typeof MONSTER_CAR_SLOTS)[number];

// 零件 ID 是网络、快照与渲染器之间的稳定契约；展示名和动画可以独立迭代。
export const MONSTER_CAR_PART_IDS = {
  wheels: ['classic', 'donut', 'spring', 'balloon', 'banana', 'square', 'bubble-tea', 'duck-float'],
  front: ['smile', 'duck', 'train', 'scoop', 'shark', 'vacuum', 'ice-cream', 'piano'],
  rear: ['trunk', 'rocket', 'bubble', 'tail', 'washing-machine', 'campfire', 'jackbox', 'snail'],
  roof: ['mushroom', 'umbrella', 'propeller', 'antenna', 'teapot', 'birdcage', 'cactus', 'whale'],
  driver: ['bear', 'frog', 'duck', 'alien', 'robot', 'penguin', 'ghost', 'lion'],
} as const satisfies Record<MonsterCarSlot, readonly string[]>;

export const monsterCarBuildSchema = z.object({
  wheels: z.enum(MONSTER_CAR_PART_IDS.wheels),
  front: z.enum(MONSTER_CAR_PART_IDS.front),
  rear: z.enum(MONSTER_CAR_PART_IDS.rear),
  roof: z.enum(MONSTER_CAR_PART_IDS.roof),
  driver: z.enum(MONSTER_CAR_PART_IDS.driver),
}).strict();
export type MonsterCarBuild = z.infer<typeof monsterCarBuildSchema>;

export const monsterCarActionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('build-car'), build: monsterCarBuildSchema }).strict(),
  z.object({ type: z.literal('play-again') }).strict(),
]);
