import { useSyncExternalStore } from "react";

export interface Settings {
  defaultQuality: "auto" | 1080 | 720 | 480 | 360;
  chatFadeSeconds: number;
  chatMaxMessages: number;
  chatTextSize: "s" | "m" | "l";
  chatOnByDefault: boolean;
  animatedEmotes: boolean;
  /** When a clip ends, play the next one (otherwise the clip loops). */
  clipsAutoAdvance: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  defaultQuality: "auto",
  chatFadeSeconds: 6,
  chatMaxMessages: 5,
  chatTextSize: "m",
  chatOnByDefault: true,
  animatedEmotes: true,
  clipsAutoAdvance: true,
};

export const RANGES = {
  chatFadeSeconds: [3, 15],
  chatMaxMessages: [2, 10],
} as const;

const KEY = "lttv.settings";
const listeners = new Set<() => void>();
let cache: Settings | null = null;

function read(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : { ...DEFAULT_SETTINGS };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

const clamp = (v: number, [lo, hi]: readonly [number, number]) => Math.min(hi, Math.max(lo, v));

export function getSettings(): Settings {
  // Re-read when nothing is cached so tests and other tabs see fresh storage.
  if (!cache || listeners.size === 0) cache = read();
  return cache;
}

export function updateSettings(patch: Partial<Settings>): Settings {
  const next = { ...getSettings(), ...patch };
  next.chatFadeSeconds = clamp(next.chatFadeSeconds, RANGES.chatFadeSeconds);
  next.chatMaxMessages = clamp(next.chatMaxMessages, RANGES.chatMaxMessages);
  cache = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Storage unavailable: keep the change for this session only.
  }
  for (const l of [...listeners]) l();
  return next;
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function useSettings(): [Settings, (patch: Partial<Settings>) => void] {
  const settings = useSyncExternalStore(subscribe, getSettings);
  return [settings, updateSettings];
}
