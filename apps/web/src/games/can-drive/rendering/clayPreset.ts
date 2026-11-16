/** Shared palette for the matte, handmade clay miniature. */
export const CLAY_PRESET = {
  background: '#e8dfd0',
  ground: '#d2c3ac',
  platform: '#f4ead8',
  road: '#b8aa93',
  coral: '#e9826f',
  coralLight: '#f6b5a6',
  yellow: '#f2c14e',
  cream: '#f6e7c9',
  white: '#fff7e8',
  ink: '#403d39',
  mint: '#7e9c95',
  leaf: '#8ea77c',
  orange: '#e9a25f',
  red: '#cf6658',
  pink: '#e9a5ad',
  purple: '#9b8aad',
  blue: '#81aeb9',
  water: '#78b7c5',
  ice: '#c7e3df',
  brown: '#95765b',
  mud: '#84634f',
  silver: '#a9aaa2',
  gold: '#d6a74d',
  cave: '#585367',
} as const;

export type ClayColor = keyof typeof CLAY_PRESET;

export const CLAY_MATERIAL_DEFAULTS = {
  roughness: 0.93,
  metalness: 0,
} as const;
