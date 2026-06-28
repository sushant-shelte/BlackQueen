type SoundKind = 'deal' | 'bid' | 'pass' | 'trick' | 'round' | 'join' | 'leave';

let audioContext: AudioContext | null = null;

const getAudioContext = () => {
  if (typeof window === 'undefined') return null;
  const Ctor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;

  if (!audioContext) {
    audioContext = new Ctor();
  }

  return audioContext;
};

const pattern: Record<SoundKind, { frequencies: number[]; duration: number; gap: number; gain: number }> = {
  deal: { frequencies: [660, 880], duration: 0.06, gap: 0.04, gain: 0.04 },
  bid: { frequencies: [520, 780], duration: 0.08, gap: 0.05, gain: 0.05 },
  pass: { frequencies: [320], duration: 0.08, gap: 0, gain: 0.035 },
  trick: { frequencies: [392, 523.25, 659.25], duration: 0.09, gap: 0.05, gain: 0.05 },
  round: { frequencies: [440, 587.33, 783.99], duration: 0.12, gap: 0.06, gain: 0.06 },
  join: { frequencies: [740], duration: 0.06, gap: 0, gain: 0.03 },
  leave: { frequencies: [240], duration: 0.08, gap: 0, gain: 0.03 }
};

export const playGameSound = async (kind: SoundKind) => {
  const ctx = getAudioContext();
  if (!ctx) return;

  try {
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }

    const spec = pattern[kind];
    const start = ctx.currentTime + 0.01;

    spec.frequencies.forEach((frequency, index) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = kind === 'round' ? 'triangle' : kind === 'trick' ? 'sine' : 'square';
      osc.frequency.value = frequency;
      gain.gain.value = 0;

      osc.connect(gain);
      gain.connect(ctx.destination);

      const noteStart = start + (spec.duration + spec.gap) * index;
      gain.gain.setValueAtTime(0.0001, noteStart);
      gain.gain.exponentialRampToValueAtTime(spec.gain, noteStart + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, noteStart + spec.duration);
      osc.start(noteStart);
      osc.stop(noteStart + spec.duration + 0.02);
    });
  } catch {
    // Audio cues are optional and should never block gameplay.
  }
};
