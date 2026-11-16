export type BuiltinMusicId =
  | 'none'
  | 'lofi_chill'
  | 'acoustic_morning'
  | 'energetic_beat'
  | 'dreamy_ambient';

export interface BuiltinMusicTrack {
  id: BuiltinMusicId;
  title: string;
  mood: string;
  bpm: number;
}

export const BUILTIN_MUSIC_TRACKS: BuiltinMusicTrack[] = [
  { id: 'none', title: 'Tanpa Musik', mood: 'Hening', bpm: 0 },
  { id: 'lofi_chill', title: 'Senja Lo-Fi', mood: 'Santai & Hangat', bpm: 78 },
  { id: 'acoustic_morning', title: 'Kopi Pagi Akustik', mood: 'Lembut & Cerah', bpm: 92 },
  { id: 'energetic_beat', title: 'Ritme Kota', mood: 'Cepat & Dinamis', bpm: 116 },
  { id: 'dreamy_ambient', title: 'Langit Tenang', mood: 'Sinematik & Luas', bpm: 68 },
];

// Frequency tables (in Hz) for pleasant musical chord progressions
const TRACK_PATTERNS: Record<
  Exclude<BuiltinMusicId, 'none'>,
  { stepMs: number; chords: number[][]; bass: number[]; hasPerc: boolean }
> = {
  lofi_chill: {
    stepMs: 760,
    chords: [
      [261.63, 329.63, 392.0, 493.88], // Cmaj7
      [220.0, 261.63, 329.63, 392.0],  // Am7
      [174.61, 220.0, 261.63, 329.63], // Fmaj7
      [196.0, 246.94, 293.66, 349.23], // G7
    ],
    bass: [130.81, 110.0, 87.31, 98.0],
    hasPerc: true,
  },
  acoustic_morning: {
    stepMs: 650,
    chords: [
      [293.66, 369.99, 440.0, 554.37], // Dmaj7
      [246.94, 293.66, 369.99, 440.0], // Bm7
      [196.0, 246.94, 293.66, 369.99], // Gmaj7
      [220.0, 277.18, 329.63, 392.0],  // A7
    ],
    bass: [146.83, 123.47, 98.0, 110.0],
    hasPerc: false,
  },
  energetic_beat: {
    stepMs: 515,
    chords: [
      [261.63, 311.13, 392.0, 466.16], // Cm7
      [233.08, 293.66, 349.23, 415.3], // Bb6
      [207.65, 261.63, 311.13, 392.0], // Abmaj7
      [196.0, 246.94, 293.66, 392.0],  // G
    ],
    bass: [65.41, 58.27, 51.91, 49.0],
    hasPerc: true,
  },
  dreamy_ambient: {
    stepMs: 920,
    chords: [
      [220.0, 277.18, 329.63, 415.3],  // Amaj7
      [164.81, 207.65, 246.94, 329.63], // Emaj7
      [185.0, 220.0, 277.18, 329.63],  // F#m7
      [146.83, 185.0, 220.0, 277.18],  // Dmaj7
    ],
    bass: [110.0, 82.41, 92.5, 73.42],
    hasPerc: false,
  },
};

class OfflineMusicPlayer {
  private ctx: AudioContext | null = null;
  private timerId: number | null = null;
  private step = 0;
  private activeId: BuiltinMusicId = 'none';

  private ensureContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return null;
    if (!this.ctx) {
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  start(trackId: BuiltinMusicId) {
    if (trackId === 'none') {
      this.stop();
      return;
    }
    if (this.activeId === trackId && this.timerId !== null) return;

    this.stop();
    const ctx = this.ensureContext();
    if (!ctx) return;

    this.activeId = trackId;
    this.step = 0;
    const pattern = TRACK_PATTERNS[trackId];

    const playStep = () => {
      if (!this.ctx || this.activeId !== trackId) return;
      const now = this.ctx.currentTime;
      const barIdx = Math.floor(this.step / 2) % pattern.chords.length;
      const chord = pattern.chords[barIdx];
      const bassFreq = pattern.bass[barIdx];
      const isEven = this.step % 2 === 0;

      // Play warm pad/chord on downbeat
      if (isEven) {
        chord.forEach((freq, idx) => {
          const osc = this.ctx!.createOscillator();
          const gain = this.ctx!.createGain();
          osc.type = trackId === 'acoustic_morning' ? 'triangle' : 'sine';
          osc.frequency.setValueAtTime(freq, now + idx * 0.04);

          gain.gain.setValueAtTime(0.0001, now + idx * 0.04);
          gain.gain.linearRampToValueAtTime(0.032, now + idx * 0.04 + 0.06);
          gain.gain.exponentialRampToValueAtTime(
            0.0001,
            now + idx * 0.04 + (pattern.stepMs * 1.85) / 1000
          );

          osc.connect(gain);
          gain.connect(this.ctx!.destination);
          osc.start(now + idx * 0.04);
          osc.stop(now + idx * 0.04 + (pattern.stepMs * 1.9) / 1000);
        });

        // Subtle warm bass
        const bassOsc = this.ctx.createOscillator();
        const bassGain = this.ctx.createGain();
        bassOsc.type = 'triangle';
        bassOsc.frequency.setValueAtTime(bassFreq, now);
        bassGain.gain.setValueAtTime(0.0001, now);
        bassGain.gain.linearRampToValueAtTime(0.055, now + 0.03);
        bassGain.gain.exponentialRampToValueAtTime(0.0001, now + (pattern.stepMs * 1.6) / 1000);
        bassOsc.connect(bassGain);
        bassGain.connect(this.ctx.destination);
        bassOsc.start(now);
        bassOsc.stop(now + (pattern.stepMs * 1.7) / 1000);
      } else if (trackId === 'acoustic_morning' || trackId === 'energetic_beat') {
        // Gentle melodic pluck on off-beat
        const note = chord[(this.step + 1) % chord.length] * 1.5;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(note, now);
        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.linearRampToValueAtTime(0.025, now + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now);
        osc.stop(now + 0.38);
      }

      // Soft percussive thump when hasPerc is enabled
      if (pattern.hasPerc && isEven) {
        const kick = this.ctx.createOscillator();
        const kickGain = this.ctx.createGain();
        kick.type = 'sine';
        kick.frequency.setValueAtTime(115, now);
        kick.frequency.exponentialRampToValueAtTime(42, now + 0.11);
        kickGain.gain.setValueAtTime(0.07, now);
        kickGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.13);
        kick.connect(kickGain);
        kickGain.connect(this.ctx.destination);
        kick.start(now);
        kick.stop(now + 0.14);
      }

      this.step += 1;
    };

    playStep();
    this.timerId = window.setInterval(playStep, pattern.stepMs);
  }

  stop() {
    if (this.timerId !== null) {
      window.clearInterval(this.timerId);
      this.timerId = null;
    }
    this.activeId = 'none';
  }
}

export const offlineMusicPlayer = new OfflineMusicPlayer();
