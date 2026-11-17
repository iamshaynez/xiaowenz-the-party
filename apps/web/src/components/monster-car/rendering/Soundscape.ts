import type { MonsterCarStimulus } from '@party/games';

export class Soundscape {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private muted = true;

  get isMuted() {
    return this.muted;
  }

  async unlock() {
    if (this.muted) return;
    try {
      if (!this.context) {
        this.context = new AudioContext();
        this.master = this.context.createGain();
        this.master.gain.value = 0.16;
        this.master.connect(this.context.destination);
      }
      if (this.context.state === 'suspended') await this.context.resume();
    } catch {
      // 视觉与规则不依赖音频；浏览器拒绝音频时保持安静。
    }
  }

  setMuted(muted: boolean) {
    this.muted = muted;
    if (this.master && this.context) {
      this.master.gain.setTargetAtTime(muted ? 0 : 0.16, this.context.currentTime, 0.03);
    }
  }

  private tone(frequency: number, delay: number, duration: number, type: OscillatorType = 'sine', volume = 0.35) {
    if (!this.context || !this.master || this.muted) return;
    const start = this.context.currentTime + delay;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, start);
    oscillator.frequency.exponentialRampToValueAtTime(frequency * 1.08, start + duration);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + 0.025);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(gain);
    gain.connect(this.master);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.03);
  }

  cue(stimulus: MonsterCarStimulus) {
    if (stimulus === 'water') {
      this.tone(420, 0, 0.16, 'sine', 0.22);
      this.tone(650, 0.07, 0.22, 'sine', 0.18);
    } else if (stimulus === 'impact') {
      this.tone(160, 0, 0.15, 'triangle', 0.28);
      this.tone(260, 0.08, 0.22, 'sine', 0.18);
    } else if (stimulus === 'wind') {
      this.tone(540, 0, 0.45, 'sine', 0.11);
      this.tone(810, 0.12, 0.4, 'sine', 0.08);
    } else {
      this.tone(240, 0, 0.18, 'triangle', 0.2);
      this.tone(360, 0.1, 0.25, 'triangle', 0.16);
    }
  }

  celebrate() {
    [523, 659, 784, 1_047].forEach((frequency, index) => this.tone(frequency, index * 0.11, 0.42, 'sine', 0.2));
  }

  dispose() {
    if (this.context) void this.context.close();
    this.context = null;
    this.master = null;
  }
}
