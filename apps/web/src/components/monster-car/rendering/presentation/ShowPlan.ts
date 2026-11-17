import type { MonsterCarRacePlan } from '@party/games';
import { createCarIdentity } from './CarIdentity';
import type { CarIdentity } from './CarIdentity';
import { hashPurpose, unitFromPurpose } from './deterministic';
import { createSocialMoments } from './SocialMoments';
import type { SocialMoment } from './SocialMoments';

export type MonsterCarWeather = 'fireflies' | 'rain' | 'petals' | 'flowers' | 'acorns' | 'lanterns';
export type MonsterCarSkyColors = [string, string, string];

export interface MonsterCarStory {
  id: string;
  title: string;
  weather: MonsterCarWeather;
  dayColors: MonsterCarSkyColors;
  twilightColors: MonsterCarSkyColors;
  fogColor: string;
  backgroundColor: string;
  sunColor: string;
  propVariant: number;
}

export interface MonsterCarShowPlan {
  identities: Record<string, CarIdentity>;
  avatars: Record<string, string>;
  story: MonsterCarStory;
  socialMoments: SocialMoment[];
  finaleSeed: number;
}

interface ShowPlayer {
  id: string;
  avatar: string;
}

const STORIES: readonly MonsterCarStory[] = [
  {
    id: 'firefly-grove',
    title: '萤火虫森林',
    weather: 'fireflies',
    dayColors: ['#6faeaf', '#f2c995', '#76966d'],
    twilightColors: ['#293f61', '#71647f', '#405f59'],
    fogColor: '#789c87',
    backgroundColor: '#365767',
    sunColor: '#ffe5a0',
    propVariant: 0,
  },
  {
    id: 'rainbow-rain',
    title: '雨滴交响曲',
    weather: 'rain',
    dayColors: ['#73aebe', '#d4c7ba', '#789783'],
    twilightColors: ['#415773', '#82768b', '#526c69'],
    fogColor: '#9bb9b7',
    backgroundColor: '#607f91',
    sunColor: '#f4e4c2',
    propVariant: 1,
  },
  {
    id: 'petal-picnic',
    title: '花瓣野餐会',
    weather: 'petals',
    dayColors: ['#86b8c1', '#f4c2b4', '#91aa7c'],
    twilightColors: ['#555b7c', '#b17f96', '#6f806f'],
    fogColor: '#c4b4aa',
    backgroundColor: '#91b8b5',
    sunColor: '#ffe0ac',
    propVariant: 2,
  },
  {
    id: 'flower-parade',
    title: '鲜花巡游',
    weather: 'flowers',
    dayColors: ['#79b5bd', '#f2d19b', '#8dac72'],
    twilightColors: ['#50577b', '#a47f9a', '#687b68'],
    fogColor: '#b5c6a5',
    backgroundColor: '#8db9ad',
    sunColor: '#fff0b5',
    propVariant: 0,
  },
  {
    id: 'acorn-woods',
    title: '橡果沙沙谷',
    weather: 'acorns',
    dayColors: ['#7ea8aa', '#e6bd8e', '#8f9a67'],
    twilightColors: ['#49566e', '#9a7a79', '#656c56'],
    fogColor: '#b1ac8d',
    backgroundColor: '#8c9a7c',
    sunColor: '#ffd492',
    propVariant: 1,
  },
  {
    id: 'lantern-festival',
    title: '灯笼星光夜',
    weather: 'lanterns',
    dayColors: ['#729ea9', '#eab78e', '#738c72'],
    twilightColors: ['#273653', '#79576f', '#3f5b58'],
    fogColor: '#756f72',
    backgroundColor: '#34465c',
    sunColor: '#ffc978',
    propVariant: 2,
  },
];

function copyStory(story: MonsterCarStory): MonsterCarStory {
  return {
    ...story,
    dayColors: [...story.dayColors],
    twilightColors: [...story.twilightColors],
  };
}

/**
 * Builds a detachable, JSON-serializable presentation plan. No object from the
 * authoritative race plan or player DTOs is retained or modified.
 */
export function createMonsterCarShowPlan(
  plan: MonsterCarRacePlan,
  players: ShowPlayer[],
): MonsterCarShowPlan {
  const avatars = new Map(players.map((player) => [player.id, player.avatar]));
  const identities = Object.fromEntries(plan.racers.map((racer, participantIndex) => [
    racer.playerId,
    createCarIdentity(racer.playerId, participantIndex, avatars.get(racer.playerId) ?? ''),
  ]));
  const storyIndex = Math.min(
    STORIES.length - 1,
    Math.floor(unitFromPurpose('monster-car.show.story', plan.id, plan.seed) * STORIES.length),
  );

  return {
    identities,
    avatars: Object.fromEntries(players.map((player) => [player.id, player.avatar])),
    story: copyStory(STORIES[storyIndex]!),
    socialMoments: createSocialMoments(plan),
    finaleSeed: hashPurpose('monster-car.show.finale', plan.id, plan.seed),
  };
}
