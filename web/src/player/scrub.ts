/**
 * Hold-to-accelerate scrubbing. Each key press (or auto-repeat) moves a pending seek; the
 * player seeks once when the key is released, so a held key never floods the native player.
 */

export interface Scrub {
  active: boolean;
  /** When the current direction's hold began. */
  startedAt: number;
  dir: -1 | 1;
  /** Pending seek relative to where playback was when scrubbing began. */
  deltaMs: number;
  /** The key was let go: the next press is a new tap and starts again at 10 s steps. */
  released: boolean;
}

export const IDLE_SCRUB: Scrub = {
  active: false,
  startedAt: 0,
  dir: -1,
  deltaMs: 0,
  released: false,
};

/** A press held at least this long commits as soon as it's let go; shorter taps wait for more. */
const HOLD_COMMIT_MS = 400;

/** 10 s for the first second of holding, then 30 s, 60 s and 300 s steps. */
export function scrubStepMs(heldMs: number): number {
  if (heldMs < 1000) return 10_000;
  if (heldMs < 2500) return 30_000;
  if (heldMs < 5000) return 60_000;
  return 300_000;
}

/** `limits`: how far back and forward the target may go from the starting point. */
export function scrubPress(
  s: Scrub,
  dir: -1 | 1,
  now: number,
  limits: { backMs: number; forwardMs: number },
): Scrub {
  const sameHold = s.active && s.dir === dir && !s.released;
  const startedAt = sameHold ? s.startedAt : now;
  const deltaMs = s.deltaMs + dir * scrubStepMs(now - startedAt);
  return {
    active: true,
    startedAt,
    dir,
    deltaMs: Math.max(-limits.backMs, Math.min(limits.forwardMs, deltaMs)),
    released: false,
  };
}

export function scrubKeyUp(s: Scrub): Scrub {
  return s.active ? { ...s, released: true } : s;
}

/** Whether letting go should seek now (a hold) or wait briefly for more taps. */
export function commitsOnRelease(s: Scrub, now: number): boolean {
  return now - s.startedAt >= HOLD_COMMIT_MS;
}

export function scrubRelease(s: Scrub): { scrub: Scrub; commitMs: number } {
  return { scrub: IDLE_SCRUB, commitMs: s.deltaMs };
}
