import { expect, test } from "bun:test";
import {
  behindForVodPosition,
  broadcastSpanMs,
  type LiveTimeline,
  shouldReturnToLive,
  sourceForBehind,
  vodPositionForBehind,
} from "./liveTimeline";

const start = Date.parse("2026-10-23T10:00:00Z");
const now = start + 3 * 3600_000;
const withVod: LiveTimeline = { startedAtMs: start, vod: { id: "v", createdAtMs: start + 20_000 } };
const noVod: LiveTimeline = { startedAtMs: start, vod: null };

test("behind live and VOD position map onto each other", () => {
  const pos = vodPositionForBehind(withVod, 3600_000, now);
  expect(pos).toBe(3 * 3600_000 - 20_000 - 3600_000);
  expect(behindForVodPosition(withVod, pos, now)).toBe(3600_000);
});

test("VOD position never goes below zero", () => {
  expect(vodPositionForBehind(withVod, 4 * 3600_000, now)).toBe(0);
});

test("recent rewinds stay on live; older ones use the VOD when there is one", () => {
  expect(sourceForBehind(withVod, 30_000)).toBe("live");
  expect(sourceForBehind(withVod, 219_000)).toBe("live");
  expect(sourceForBehind(withVod, 221_000)).toBe("vod");
  expect(sourceForBehind(noVod, 221_000)).toBe("live");
});

test("the span is the whole broadcast, or the 4-minute window without a VOD", () => {
  expect(broadcastSpanMs(withVod, now)).toBe(3 * 3600_000);
  expect(broadcastSpanMs(noVod, now)).toBe(240_000);
  expect(broadcastSpanMs(noVod, start + 60_000)).toBe(60_000);
});

test("returns to live within 10 s of the VOD's end", () => {
  expect(shouldReturnToLive(995_000, 1_000_000)).toBe(true);
  expect(shouldReturnToLive(900_000, 1_000_000)).toBe(false);
});

test("the VOD takes over beyond the live stream's actual history, not just the 4-minute cap", () => {
  // Only 25 s of live history so far (just tuned in): 40 s back must come from the VOD.
  expect(sourceForBehind(withVod, 40_000, 25_000)).toBe("vod");
  expect(sourceForBehind(withVod, 20_000, 25_000)).toBe("live");
  // Without a VOD there's nowhere else to go.
  expect(sourceForBehind(noVod, 40_000, 25_000)).toBe("live");
});

test("rewinds closer than 25 s to live stay on the live stream even with little history", () => {
  expect(sourceForBehind(withVod, 20_000, 5_000)).toBe("live");
  expect(sourceForBehind(withVod, 30_000, 5_000)).toBe("vod");
});
