import { LIVE_EDGE_MS } from "./playerState";
import "./Seekbar.css";

/** How far back live can be rewound (matches the native PlaylistAccumulator window). */
const LIVE_REWIND_MS = 240000;

interface SeekbarProps {
  isLive: boolean;
  positionMs: number;
  /** VOD length, or the rewindable window's length on live. */
  durationMs: number | null;
  behindLiveMs: number | null;
  /** Live: how far back the bar reaches (the broadcast, or the 4-minute window). */
  spanMs?: number;
  /** Live: the whole broadcast is reachable (in-progress VOD), so nothing is shaded. */
  hasVod?: boolean;
  /** While scrubbing: where you'll land (live: behind; VOD: position). */
  scrubBehindMs?: number;
  scrubPositionMs?: number;
}

/** 5000 → "0:05", 3723000 → "1:02:03". */
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const sec = String(total % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const pct = (v: number) => `${Math.round(clamp01(v) * 100)}%`;

export function Seekbar({
  isLive,
  positionMs: playingPositionMs,
  durationMs,
  behindLiveMs,
  spanMs = LIVE_REWIND_MS,
  hasVod = false,
  scrubBehindMs,
  scrubPositionMs,
}: SeekbarProps) {
  const behind = scrubBehindMs ?? behindLiveMs ?? 0;
  const positionMs = scrubPositionMs ?? playingPositionMs;
  const atLive = isLive && behind < LIVE_EDGE_MS;
  // Live spans the whole rewind allowance; the part not watched yet (unreachable) is shaded.
  const fraction = isLive
    ? atLive
      ? 1
      : 1 - behind / spanMs
    : durationMs
      ? positionMs / durationMs
      : 0;
  const unreachable =
    isLive && !hasVod ? 1 - (playingPositionMs + (behindLiveMs ?? 0)) / spanMs : 0;
  const label = isLive
    ? atLive
      ? "LIVE"
      : `−${formatClock(behind)}`
    : `${formatClock(positionMs)} / ${formatClock(durationMs ?? 0)}`;
  return (
    <div data-testid="seekbar" className="seekbar">
      <span className={`seekbar-label${atLive ? " live" : ""}`}>{label}</span>
      <div className="seekbar-track">
        <div className="seekbar-fill" style={{ width: pct(fraction) }} />
        {unreachable > 0 && (
          <div className="seekbar-unavailable" style={{ width: pct(unreachable) }} />
        )}
      </div>
    </div>
  );
}
