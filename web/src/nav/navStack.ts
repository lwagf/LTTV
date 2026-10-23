import { useSyncExternalStore } from "react";
import type { Category } from "../twitch/helix";

export type StreamRef =
  | {
      kind: "live";
      login: string;
      userId: string;
      displayName: string;
      gameName: string;
      /** Broadcast start (ISO); enables rewinding back to it via the in-progress VOD. */
      startedAt?: string;
      title?: string;
      thumbnailUrl?: string;
    }
  | {
      kind: "vod";
      videoId: string;
      userId: string;
      login: string;
      displayName: string;
      title: string;
      thumbnailUrl?: string;
    }
  | {
      kind: "clip";
      slug: string;
      title: string;
      displayName: string;
      viewCount: number;
      thumbnailUrl: string;
    };

export type Screen =
  | { name: "home" }
  | { name: "browse" }
  | { name: "category"; category: Category }
  | { name: "section"; category: Category; section: "live" | "videos" | "clips"; sort: string }
  | { name: "search" }
  | { name: "channel"; login: string; userId: string; displayName: string }
  | { name: "player"; ref: StreamRef; context: StreamRef[] }
  | { name: "settings" }
  | { name: "help" };

let stack: Screen[] = [{ name: "home" }];
const listeners = new Set<() => void>();

function set(next: Screen[]) {
  stack = next;
  for (const l of [...listeners]) l();
}

export const push = (s: Screen) => set([...stack, s]);
export const replace = (s: Screen) => set([...stack.slice(0, -1), s]);
export const resetTo = (s: Screen) => set([s]);
export const currentScreen = () => stack[stack.length - 1];
export const stackDepth = () => stack.length;

/** Returns false (and stays put) at the root screen. */
export function pop(): boolean {
  if (stack.length <= 1) return false;
  set(stack.slice(0, -1));
  return true;
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function useCurrentScreen(): Screen {
  return useSyncExternalStore(subscribe, currentScreen);
}
