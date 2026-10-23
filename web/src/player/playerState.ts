import type { RemoteKey } from "../input/keys";
import type { EventData } from "../native/protocol";

export type PlayerStatus =
  | "loading"
  | "playing"
  | "paused"
  | "buffering"
  | "offline"
  | "ended"
  | "error";

export interface PlayerUiState {
  status: PlayerStatus;
  message: string | null;
  optionsOpen: boolean;
  chatOn: boolean;
  muted: boolean;
  banner: string | null;
  positionMs: number;
  /** VOD length, or the rewindable window's length on live. */
  durationMs: number | null;
  behindLiveMs: number | null;
}

export type PlayerAction =
  | { type: "load" }
  | { type: "playbackError"; code: "offline" | "not_found" | "network"; displayName: string }
  | { type: "native"; data: EventData<"player.state">; isLive: boolean; displayName: string }
  | { type: "progress"; positionMs: number; durationMs: number | null; behindLiveMs: number | null }
  | { type: "openOptions" }
  | { type: "closeOptions" }
  | { type: "toggleChat" }
  | { type: "toggleMute" }
  | { type: "banner"; text: string | null };

export type PlayerCommand =
  /** Up/Down: preview the neighbour in the list; a second press confirms (switchPreview.ts). */
  | { type: "preview"; dir: -1 | 1 }
  | { type: "toggleChat" }
  | { type: "togglePause" }
  | { type: "scrub"; dir: -1 | 1 }
  | { type: "openOptions" }
  | { type: "closeOptions" }
  | { type: "exit" }
  | { type: "retry" }
  | { type: "none" };

const GENERIC_ERROR = "Couldn't play this stream";

export function initialPlayerState(chatOn: boolean): PlayerUiState {
  return {
    status: "loading",
    message: null,
    optionsOpen: false,
    chatOn,
    muted: false,
    banner: null,
    positionMs: 0,
    durationMs: null,
    behindLiveMs: null,
  };
}

const isStopped = (s: PlayerStatus) => s === "offline" || s === "ended" || s === "error";

/** Within this of the live edge counts as live (ExoPlayer's live offset drifts after a rebuffer). */
export const LIVE_EDGE_MS = 5000;

/** Nothing is ahead of live: forward only scrubs when behind (the scrub stops at LIVE). */
function scrubForward(s: PlayerUiState, isLive: boolean): PlayerCommand {
  if (isLive && (s.behindLiveMs ?? 0) < LIVE_EDGE_MS) return { type: "none" };
  return { type: "scrub", dir: 1 };
}

export function reducePlayer(s: PlayerUiState, a: PlayerAction): PlayerUiState {
  switch (a.type) {
    case "load":
      return {
        ...s,
        status: "loading",
        message: null,
        positionMs: 0,
        durationMs: null,
        behindLiveMs: null,
      };
    case "playbackError":
      return a.code === "offline"
        ? { ...s, status: "offline", message: `${a.displayName} is offline` }
        : { ...s, status: "error", message: GENERIC_ERROR };
    case "native": {
      const d = a.data;
      // Whether a failed live stream has actually ended is re-checked by reloading it.
      if (d.error) return { ...s, status: "error", message: GENERIC_ERROR };
      if (d.state === "ended") return { ...s, status: "ended", message: "Stream ended" };
      if (d.state === "buffering") return { ...s, status: "buffering", message: null };
      if (d.state === "ready")
        return { ...s, status: d.playing ? "playing" : "paused", message: null };
      return s;
    }
    case "progress":
      return {
        ...s,
        positionMs: a.positionMs,
        durationMs: a.durationMs,
        behindLiveMs: a.behindLiveMs,
      };
    case "openOptions":
      return { ...s, optionsOpen: true };
    case "closeOptions":
      return { ...s, optionsOpen: false };
    case "toggleChat":
      return { ...s, chatOn: !s.chatOn };
    case "toggleMute":
      return { ...s, muted: !s.muted };
    case "banner":
      return { ...s, banner: a.text };
  }
}

/** What a remote key does on the player screen (the README's remote table lists the mapping). */
export function playerKeyAction(
  key: RemoteKey,
  s: PlayerUiState,
  isLive: boolean,
  hasContext: boolean,
): PlayerCommand {
  // Every kind (live, VOD, clip) can move through the list it was opened from.
  const canSwitch = hasContext;
  if (isStopped(s.status)) {
    if ((key === "up" || key === "down") && canSwitch) {
      return { type: "preview", dir: key === "up" ? -1 : 1 };
    }
    if (key === "select" || key === "playPause") return { type: "retry" };
    return key === "back" ? { type: "exit" } : { type: "none" };
  }
  switch (key) {
    case "playPause":
      return { type: "togglePause" };
    case "menu":
      return { type: "toggleChat" };
    case "rewind":
      return { type: "scrub", dir: -1 };
    case "fastForward":
      return scrubForward(s, isLive);
  }
  if (s.optionsOpen) return key === "back" ? { type: "closeOptions" } : { type: "none" };
  switch (key) {
    case "up":
    case "down":
      return canSwitch ? { type: "preview", dir: key === "up" ? -1 : 1 } : { type: "none" };
    case "left":
      return { type: "scrub", dir: -1 };
    case "right":
      return scrubForward(s, isLive);
    case "select":
      return { type: "openOptions" };
    case "back":
      return { type: "exit" };
  }
  return { type: "none" };
}
