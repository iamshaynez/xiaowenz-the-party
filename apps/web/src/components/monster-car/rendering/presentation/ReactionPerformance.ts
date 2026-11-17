import type { MonsterCarFrameCar, MonsterCarRacerPlan } from '@party/games';

export interface PerformanceTiming {
  anticipation: number;
  followThrough: number;
}

export interface PerformanceCue extends NonNullable<MonsterCarFrameCar['activeCue']> {
  performance: PerformanceTiming;
}

export function samplePerformanceCue(
  racer: MonsterCarRacerPlan,
  elapsedMs: number,
  reducedMotion = false,
): PerformanceCue | null {
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0) return null;
  let selected: MonsterCarRacerPlan['cues'][number] | null = null;
  let selectedStart = 0;
  for (const cue of racer.cues) {
    const anticipationMs = reducedMotion ? 0 : 320;
    const primaryEnd = cue.startAtMs + cue.durationMs;
    const secondaryEnd = Math.max(...cue.secondary.map((secondary) => secondary.durationMs), 0);
    const endAtMs = cue.startAtMs + Math.max(cue.durationMs, secondaryEnd) + (reducedMotion ? 0 : 420);
    const visualStart = cue.startAtMs - anticipationMs;
    if (elapsedMs < visualStart || elapsedMs > endAtMs) continue;
    if (!selected || cue.startAtMs >= selectedStart) {
      selected = cue;
      selectedStart = cue.startAtMs;
    }
  }
  if (!selected) return null;
  const anticipation = reducedMotion ? 0 : elapsedMs < selected.startAtMs
    ? Math.max(0, Math.min(1, 1 - (selected.startAtMs - elapsedMs) / 320))
    : Math.max(0, 1 - (elapsedMs - selected.startAtMs) / 240);
  const primaryEnd = selected.startAtMs + selected.durationMs;
  const followThrough = elapsedMs > primaryEnd
    ? Math.max(0, Math.min(1, (elapsedMs - primaryEnd) / 420))
    : 0;
  return {
    ...selected,
    localProgress: (elapsedMs - selected.startAtMs) / selected.durationMs,
    performance: { anticipation, followThrough },
  };
}
