import { useCallback } from "react";

export type SoundType = "stt-complete" | "error" | "nudge";

function createAudioContext(): AudioContext | null {
  try {
    const Ctor =
      window.AudioContext ??
      (window as Window & { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    return Ctor ? new Ctor() : null;
  } catch {
    return null;
  }
}

function playTone(
  ctx: AudioContext,
  type: OscillatorType,
  freqStart: number,
  freqEnd: number,
  startTime: number,
  duration: number,
  volume: number
) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.type = type;
  osc.frequency.setValueAtTime(freqStart, startTime);
  if (freqEnd !== freqStart) {
    osc.frequency.linearRampToValueAtTime(freqEnd, startTime + duration);
  }
  gain.gain.setValueAtTime(0, startTime);
  gain.gain.linearRampToValueAtTime(volume, startTime + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
  osc.start(startTime);
  osc.stop(startTime + duration);
  osc.onended = () => { try { ctx.close(); } catch { /* ignore */ } };
}

export function useSounds() {
  const playSound = useCallback((type: SoundType) => {
    const ctx = createAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;

    if (type === "stt-complete") {
      // Pleasant ascending triple tone — recognition finished
      playTone(ctx, "sine", 440, 660, now, 0.18, 0.28);
      playTone(ctx, "sine", 660, 880, now + 0.12, 0.22, 0.22);
    } else if (type === "error") {
      // Descending sawtooth — something went wrong
      playTone(ctx, "sawtooth", 440, 200, now, 0.45, 0.3);
    } else if (type === "nudge") {
      // Two short pulses — gentle attention-getter for no-response
      playTone(ctx, "sine", 520, 520, now, 0.12, 0.22);
      playTone(ctx, "sine", 520, 520, now + 0.18, 0.12, 0.22);
    }
  }, []);

  return { playSound };
}
