export type PurposeHashPart = string | number;

function token(value: PurposeHashPart) {
  const text = String(value);
  return `${typeof value}:${text.length}:${text}`;
}

/**
 * Stable, domain-separated hashing for presentation choices.
 *
 * This deliberately does not share a generator with the race simulation: adding
 * a visual sample must never change race events, pace, or finishing order.
 */
export function hashPurpose(purpose: string, ...parts: PurposeHashPart[]) {
  const input = [purpose, ...parts].map(token).join('|');
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x7feb352d);
  hash ^= hash >>> 15;
  hash = Math.imul(hash, 0x846ca68b);
  hash ^= hash >>> 16;
  return hash >>> 0;
}

/** Returns a deterministic number in [0, 1). */
export function unitFromPurpose(purpose: string, ...parts: PurposeHashPart[]) {
  return hashPurpose(purpose, ...parts) / 4_294_967_296;
}

/** A local deterministic stream, seeded by a named presentation purpose. */
export function randomFromPurpose(purpose: string, ...parts: PurposeHashPart[]) {
  let value = hashPurpose(purpose, ...parts);
  return () => {
    value = (value + 0x6d2b79f5) >>> 0;
    let result = value;
    result = Math.imul(result ^ (result >>> 15), result | 1);
    result ^= result + Math.imul(result ^ (result >>> 7), result | 61);
    return ((result ^ (result >>> 14)) >>> 0) / 4_294_967_296;
  };
}
