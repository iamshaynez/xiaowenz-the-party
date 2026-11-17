import * as THREE from 'three';
import { CARD_RANK_LABELS, CARD_SUITS, JOKER_BIG, JOKER_SMALL } from '@party/protocol';

// ---------------------------------------------------------------------------
// 桌面游戏共享的程序化纹理工厂：全部用 Canvas 2D 现场绘制，不加载任何外部贴图。
// 每个工厂都带缓存——同一张牌面/同一种木纹只画一次。
// ---------------------------------------------------------------------------

const textureCache = new Map<string, THREE.Texture>();

function cached(key: string, size: number, paint: (ctx: CanvasRenderingContext2D, size: number) => void): THREE.Texture {
  const hit = textureCache.get(key);
  if (hit) return hit;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) paint(ctx, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  textureCache.set(key, texture);
  return texture;
}

// 稳定的伪随机：同一 key 每次生成相同纹理颗粒。
function seededNoise(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1_664_525 + 1_013_904_223) >>> 0;
    return state / 4_294_967_296;
  };
}

/** 木纹：暖色分层颗粒 + 弦向纹理，用于五子棋棋盘与棋牌室桌面。 */
export function woodTexture(tone: 'walnut' | 'oak' | 'cherry' = 'walnut'): THREE.Texture {
  const palette = {
    walnut: ['#8a5a33', '#6d4425', '#a06d3f', '#5c3820'],
    oak: ['#c8a066', '#a9804a', '#dab87e', '#8f6a3a'],
    cherry: ['#a34a30', '#823521', '#bf5f42', '#6e2b1a'],
  }[tone];
  return cached(`wood:${tone}`, 512, (ctx, size) => {
    const random = seededNoise(tone.length * 7919 + 13);
    ctx.fillStyle = palette[0]!;
    ctx.fillRect(0, 0, size, size);
    // 弦向长纹理。
    for (let index = 0; index < 46; index += 1) {
      const y = random() * size;
      const amplitude = 6 + random() * 18;
      const wavelength = 120 + random() * 240;
      const phase = random() * Math.PI * 2;
      ctx.beginPath();
      for (let x = 0; x <= size; x += 8) {
        const wave = Math.sin((x / wavelength) * Math.PI * 2 + phase) * amplitude;
        if (x === 0) ctx.moveTo(x, y + wave);
        else ctx.lineTo(x, y + wave);
      }
      ctx.strokeStyle = palette[1 + Math.floor(random() * 3)]!;
      ctx.globalAlpha = 0.10 + random() * 0.16;
      ctx.lineWidth = 1 + random() * 3.4;
      ctx.stroke();
    }
    // 细颗粒。
    ctx.globalAlpha = 1;
    for (let index = 0; index < 2_400; index += 1) {
      ctx.fillStyle = palette[1 + Math.floor(random() * 3)]!;
      ctx.globalAlpha = 0.05 + random() * 0.08;
      ctx.fillRect(random() * size, random() * size, 1.6, 1.6);
    }
    ctx.globalAlpha = 1;
  });
}

/** 毛毡桌面：细噪点 + 柔和晕影，用于扑克桌。 */
export function feltTexture(color: string, shadow = '#000000'): THREE.Texture {
  return cached(`felt:${color}`, 512, (ctx, size) => {
    const random = seededNoise(color.length * 104_729 + 7);
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, size, size);
    for (let index = 0; index < 9_000; index += 1) {
      ctx.globalAlpha = 0.03 + random() * 0.05;
      ctx.fillStyle = random() > 0.5 ? '#ffffff' : shadow;
      ctx.fillRect(random() * size, random() * size, 2, 2);
    }
    ctx.globalAlpha = 1;
    const vignette = ctx.createRadialGradient(size / 2, size / 2, size * 0.2, size / 2, size / 2, size * 0.75);
    vignette.addColorStop(0, 'rgba(255,255,255,0.05)');
    vignette.addColorStop(1, 'rgba(0,0,0,0.22)');
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, size, size);
  });
}

/** 地面光晕：桌面游戏舞台的柔和聚光落点。 */
export function groundGlowTexture(inner: string, outer: string): THREE.Texture {
  return cached(`glow:${inner}:${outer}`, 256, (ctx, size) => {
    const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    gradient.addColorStop(0, inner);
    gradient.addColorStop(1, outer);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
  });
}

const isRedSuit = (cardId: number) => Math.floor(cardId / 13) === 1 || Math.floor(cardId / 13) === 3 || cardId === JOKER_BIG;

function drawSuit(ctx: CanvasRenderingContext2D, suit: string, x: number, y: number, pixelSize: number, color: string) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(pixelSize / 100, pixelSize / 100);
  ctx.fillStyle = color;
  if (suit === '♥' || suit === '♦') {
    ctx.beginPath();
    ctx.moveTo(0, 32);
    ctx.bezierCurveTo(-38, -4, -26, -36, 0, -14);
    ctx.bezierCurveTo(26, -36, 38, -4, 0, 32);
    ctx.fill();
    if (suit === '♦') {
      // 菱形其实由上述心形近似，这里直接覆盖成菱形。
      ctx.clearRect(-60, -60, 120, 120);
      ctx.beginPath();
      ctx.moveTo(0, -38);
      ctx.lineTo(28, 0);
      ctx.lineTo(0, 38);
      ctx.lineTo(-28, 0);
      ctx.closePath();
      ctx.fill();
    }
  } else if (suit === '♠' || suit === '♣') {
    ctx.beginPath();
    ctx.moveTo(0, -36);
    ctx.bezierCurveTo(26, -8, 34, 6, 18, 22);
    ctx.bezierCurveTo(10, 30, 0, 26, 0, 18);
    ctx.bezierCurveTo(0, 26, -10, 30, -18, 22);
    ctx.bezierCurveTo(-34, 6, -26, -8, 0, -36);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(0, 34);
    ctx.lineTo(-12, 14);
    ctx.lineTo(12, 14);
    ctx.closePath();
    ctx.fill();
    if (suit === '♣') {
      for (const [cx, cy] of [[-16, -6], [16, -6], [0, -22]] as const) {
        ctx.beginPath();
        ctx.arc(cx, cy, 11, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  ctx.restore();
}

function drawJokerArt(ctx: CanvasRenderingContext2D, size: number, big: boolean, color: string) {
  ctx.save();
  ctx.translate(size * 0.5, size * 0.56);
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = size * 0.016;
  // 帽子小丑剪影。
  ctx.beginPath();
  ctx.arc(0, size * 0.06, size * 0.13, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-size * 0.2, -size * 0.04);
  ctx.quadraticCurveTo(0, -size * 0.3, size * 0.2, -size * 0.04);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(-size * 0.2, -size * 0.02, size * 0.026, 0, Math.PI * 2);
  ctx.arc(size * 0.2, -size * 0.02, size * 0.026, 0, Math.PI * 2);
  ctx.fill();
  if (big) {
    ctx.font = `700 ${size * 0.1}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText('JOKER', 0, size * 0.3);
  }
  ctx.restore();
}

/** 扑克牌面：角标 + 中央花色，斗地主与德州扑克共用（纹理比例 5:7）。 */
export function cardFaceTexture(cardId: number): THREE.Texture {
  const key = `card:${cardId}`;
  const hit = textureCache.get(key);
  if (hit) return hit;
  const width = 250;
  const height = 350;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const color = isRedSuit(cardId) ? '#c8102e' : '#1c1c24';
    const rounded = 22;
    ctx.fillStyle = '#fbf7ee';
    ctx.beginPath();
    ctx.roundRect(1, 1, width - 2, height - 2, rounded);
    ctx.fill();
    ctx.strokeStyle = 'rgba(28,28,36,0.12)';
    ctx.lineWidth = 2;
    ctx.stroke();
    if (cardId === JOKER_SMALL || cardId === JOKER_BIG) {
      const jokerColor = cardId === JOKER_BIG ? '#c8102e' : '#1c1c24';
      ctx.save();
      ctx.translate(width * 0.16, height * 0.1);
      ctx.fillStyle = jokerColor;
      ctx.font = '700 34px system-ui, sans-serif';
      ctx.fillText(cardId === JOKER_BIG ? '大王' : '小王', 0, 30);
      ctx.restore();
      drawJokerArt(ctx, width, cardId === JOKER_BIG, jokerColor);
    } else {
      const suit = CARD_SUITS[Math.floor(cardId / 13)] ?? '♠';
      const rank = CARD_RANK_LABELS[cardId % 13] ?? '?';
      // 左上与右下角标。
      ctx.fillStyle = color;
      ctx.textAlign = 'left';
      ctx.font = '700 44px Georgia, serif';
      ctx.fillText(rank, 16, 52);
      drawSuit(ctx, suit, 34, 86, 40, color);
      ctx.save();
      ctx.translate(width, height);
      ctx.rotate(Math.PI);
      ctx.fillStyle = color;
      ctx.textAlign = 'left';
      ctx.font = '700 44px Georgia, serif';
      ctx.fillText(rank, 16, 52);
      drawSuit(ctx, suit, 34, 86, 40, color);
      ctx.restore();
      // 中央大花色。
      drawSuit(ctx, suit, width / 2, height / 2, 150, color);
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  textureCache.set(key, texture);
  return texture;
}

/** 牌背：菱格暗纹 + 主题描边。 */
export function cardBackTexture(accent = '#c8a24a'): THREE.Texture {
  return cached(`card-back:${accent}`, 256, (ctx, size) => {
    ctx.fillStyle = '#232333';
    ctx.beginPath();
    ctx.roundRect(2, 2, size - 4, size - 4, 18);
    ctx.fill();
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(10, 10, size - 20, size - 20, 12);
    ctx.clip();
    ctx.strokeStyle = accent;
    ctx.globalAlpha = 0.5;
    ctx.lineWidth = 2;
    for (let index = -size; index < size * 2; index += 18) {
      ctx.beginPath();
      ctx.moveTo(index, 0);
      ctx.lineTo(index + size, size);
      ctx.moveTo(index, size);
      ctx.lineTo(index + size, 0);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.restore();
    ctx.strokeStyle = accent;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(10, 10, size - 20, size - 20, 12);
    ctx.stroke();
  });
}

/** 筹码侧面条纹（环形展开贴图）。 */
export function chipEdgeTexture(base: string, stripe: string): THREE.Texture {
  return cached(`chip-edge:${base}:${stripe}`, 256, (ctx, size) => {
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = stripe;
    for (let x = 0; x < size; x += size / 6) {
      ctx.fillRect(x, 0, size / 18, size);
      ctx.fillRect(x + size / 12, 0, size / 18, size);
    }
  });
}

/** 筹码上下面的圆环面。 */
export function chipFaceTexture(base: string, ring: string): THREE.Texture {
  return cached(`chip-face:${base}:${ring}`, 128, (ctx, size) => {
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, size, size);
    ctx.strokeStyle = ring;
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size * 0.3, 0, Math.PI * 2);
    ctx.stroke();
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size * 0.42, 0, Math.PI * 2);
    ctx.stroke();
  });
}

/** 骰子点面（1–6）。 */
export function diceFaceTexture(pips: number): THREE.Texture {
  return cached(`dice:${pips}`, 128, (ctx, size) => {
    ctx.fillStyle = '#f7f2e6';
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = '#22222c';
    const dot = size * 0.11;
    const positions: Record<number, Array<[number, number]>> = {
      1: [[0.5, 0.5]],
      2: [[0.28, 0.28], [0.72, 0.72]],
      3: [[0.26, 0.26], [0.5, 0.5], [0.74, 0.74]],
      4: [[0.28, 0.28], [0.72, 0.28], [0.28, 0.72], [0.72, 0.72]],
      5: [[0.26, 0.26], [0.74, 0.26], [0.5, 0.5], [0.26, 0.74], [0.74, 0.74]],
      6: [[0.28, 0.22], [0.72, 0.22], [0.28, 0.5], [0.72, 0.5], [0.28, 0.78], [0.72, 0.78]],
    };
    for (const [x, y] of positions[pips] ?? []) {
      ctx.beginPath();
      ctx.arc(x * size, y * size, dot, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

/** 文字标签纹理：用于玩家名/筹码数的 Sprite。 */
export function labelTexture(text: string, options: { color?: string; background?: string; bold?: boolean } = {}): THREE.Texture {
  const color = options.color ?? '#f5efe0';
  const background = options.background ?? 'rgba(16,18,28,0.72)';
  return cached(`label:${text}:${color}:${background}:${options.bold ? 1 : 0}`, 256, (ctx, size) => {
    ctx.clearRect(0, 0, size, size);
    ctx.font = `${options.bold ? 700 : 500} 46px system-ui, -apple-system, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const metrics = ctx.measureText(text);
    const padding = 26;
    const boxWidth = Math.min(size - 8, metrics.width + padding * 2);
    ctx.fillStyle = background;
    ctx.beginPath();
    ctx.roundRect((size - boxWidth) / 2, size * 0.28, boxWidth, size * 0.44, size * 0.22);
    ctx.fill();
    ctx.fillStyle = color;
    ctx.fillText(text, size / 2, size * 0.51, size - 40);
  });
}

/** 头像圆盘纹理（emoji 徽章）。 */
export function avatarBadgeTexture(emoji: string, ringColor: string): THREE.Texture {
  return cached(`avatar:${emoji}:${ringColor}`, 128, (ctx, size) => {
    ctx.clearRect(0, 0, size, size);
    ctx.fillStyle = 'rgba(14,16,24,0.85)';
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size * 0.46, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = ringColor;
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size * 0.44, 0, Math.PI * 2);
    ctx.stroke();
    ctx.font = `${size * 0.42}px system-ui`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(emoji, size / 2, size * 0.54);
  });
}

/** 纯色圆点高亮（可选棋子指示）。 */
export function dotTexture(color: string): THREE.Texture {
  return cached(`dot:${color}`, 64, (ctx, size) => {
    ctx.clearRect(0, 0, size, size);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size * 0.42, 0, Math.PI * 2);
    ctx.fill();
  });
}

export function disposeTextureCache() {
  for (const texture of textureCache.values()) texture.dispose();
  textureCache.clear();
}
