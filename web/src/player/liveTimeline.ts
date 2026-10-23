/**
 * Maps a live broadcast onto two sources: the live stream (its last ~4 minutes, kept by the
 * native playlist accumulator) and the broadcast's in-progress VOD (everything older).
 */

/** Matches the native PlaylistAccumulator window. */
export const LIVE_WINDOW_MS = 240_000;
/** Switch to the VOD a little before the live window runs out. */
const VOD_SWITCH_MARGIN_MS = 20_000;
/** On the VOD, this close to its end means you've caught up: go back to live. */
const VOD_END_MARGIN_MS = 10_000;
/** Targets this close to live stay on the live stream: on the VOD they'd count as caught up. */
const MIN_VOD_BEHIND_MS = 25_000;

export interface LiveTimeline {
  startedAtMs: number;
  vod: { id: string; createdAtMs: number } | null;
}

/** How far back the seekbar reaches: the whole broadcast, or just the live window. */
export function broadcastSpanMs(t: LiveTimeline, now: number): number {
  const span = Math.max(0, now - t.startedAtMs);
  return t.vod ? span : Math.min(span, LIVE_WINDOW_MS);
}

export function vodPositionForBehind(t: LiveTimeline, behindMs: number, now: number): number {
  if (!t.vod) return 0;
  return Math.max(0, now - t.vod.createdAtMs - behindMs);
}

export function behindForVodPosition(t: LiveTimeline, positionMs: number, now: number): number {
  if (!t.vod) return 0;
  return Math.max(0, now - t.vod.createdAtMs - positionMs);
}

/**
 * Where a position `behindMs` behind live should play from. The live stream can only rewind
 * through the history it has buffered (`liveHistoryMs`, at most the 4-minute window).
 */
export function sourceForBehind(
  t: LiveTimeline,
  behindMs: number,
  liveHistoryMs: number = LIVE_WINDOW_MS,
): "live" | "vod" {
  if (!t.vod || behindMs < MIN_VOD_BEHIND_MS) return "live";
  const reachable = Math.min(liveHistoryMs, LIVE_WINDOW_MS - VOD_SWITCH_MARGIN_MS);
  return behindMs > reachable ? "vod" : "live";
}

export function shouldReturnToLive(positionMs: number, durationMs: number): boolean {
  return durationMs > 0 && positionMs >= durationMs - VOD_END_MARGIN_MS;
}
