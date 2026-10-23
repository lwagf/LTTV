import type { Part } from "./tokenize";

export interface BubbleInput {
  id: string;
  displayName: string;
  color: string | null;
  parts: Part[];
  action?: boolean;
}

export interface Bubble extends BubbleInput {
  addedAt: number;
}

export interface ChatStore {
  add(m: BubbleInput): void;
  /** Stable array reference until the next change (safe for useSyncExternalStore). */
  visible(): Bubble[];
  prune(): void;
  clear(): void;
  setLimits(maxMessages: number, fadeMs: number): void;
  maxMessages(): number;
  subscribe(cb: () => void): () => void;
}

/** Bounded list of chat bubbles: never more than `maxMessages`, each gone after `fadeMs`. */
export function createChatStore(
  maxMessages: number,
  fadeMs: number,
  now: () => number = Date.now,
): ChatStore {
  let max = maxMessages;
  let fade = fadeMs;
  let bubbles: Bubble[] = [];
  const listeners = new Set<() => void>();

  const set = (next: Bubble[]) => {
    bubbles = next;
    for (const l of [...listeners]) l();
  };

  return {
    add(m) {
      set([...bubbles.slice(-(max - 1)), { ...m, addedAt: now() }].slice(-max));
    },
    visible: () => bubbles,
    prune() {
      const cutoff = now() - fade;
      const kept = bubbles.filter((b) => b.addedAt > cutoff);
      if (kept.length !== bubbles.length) set(kept);
    },
    clear() {
      if (bubbles.length) set([]);
    },
    setLimits(nextMax, nextFade) {
      max = nextMax;
      fade = nextFade;
      if (bubbles.length > max) set(bubbles.slice(-max));
    },
    maxMessages: () => max,
    subscribe(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
  };
}
