import { describe, expect, test } from "bun:test";
import type { RemoteKey } from "../input/keys";
import {
  initialPlayerState,
  type PlayerCommand,
  type PlayerUiState,
  playerKeyAction,
  reducePlayer,
} from "./playerState";

const base = initialPlayerState(true);
const nativeState = (
  state: "idle" | "buffering" | "ready" | "ended",
  over: Partial<{ playing: boolean; error: string | null; httpStatus: number | null }> = {},
) => ({ state, playing: false, error: null, httpStatus: null, ...over });

describe("reducePlayer", () => {
  test("offline playback error shows the offline message", () => {
    const s = reducePlayer(base, { type: "playbackError", code: "offline", displayName: "Lirik" });
    expect(s).toMatchObject({ status: "offline", message: "Lirik is offline" });
  });

  test("ended event shows Stream ended", () => {
    const s = reducePlayer(base, {
      type: "native",
      data: nativeState("ended"),
      isLive: true,
      displayName: "Lirik",
    });
    expect(s).toMatchObject({ status: "ended", message: "Stream ended" });
  });

  test("other native errors show a generic message", () => {
    const s = reducePlayer(base, {
      type: "native",
      data: nativeState("idle", { error: "ERROR_CODE_IO_NETWORK_CONNECTION_FAILED" }),
      isLive: true,
      displayName: "Lirik",
    });
    expect(s).toMatchObject({ status: "error", message: "Couldn't play this stream" });
  });

  test("progress stores position, duration and how far behind live", () => {
    const s = reducePlayer(base, {
      type: "progress",
      positionMs: 1000,
      durationMs: 240000,
      behindLiveMs: 30000,
    });
    expect(s).toMatchObject({ positionMs: 1000, durationMs: 240000, behindLiveMs: 30000 });
  });

  test("ready and playing clears the message", () => {
    const err = reducePlayer(base, { type: "playbackError", code: "network", displayName: "x" });
    const s = reducePlayer(reducePlayer(err, { type: "load" }), {
      type: "native",
      data: nativeState("ready", { playing: true }),
      isLive: true,
      displayName: "x",
    });
    expect(s).toMatchObject({ status: "playing", message: null });
  });
});

describe("playerKeyAction", () => {
  const closed: PlayerUiState = { ...base, status: "playing" };
  const open: PlayerUiState = { ...closed, optionsOpen: true };
  const cases: [string, RemoteKey, PlayerUiState, boolean, boolean, PlayerCommand][] = [
    ["up previews the previous item", "up", closed, true, true, { type: "preview", dir: -1 }],
    ["down previews the next item", "down", closed, true, true, { type: "preview", dir: 1 }],
    [
      "down previews on a VOD with a list too",
      "down",
      closed,
      false,
      true,
      { type: "preview", dir: 1 },
    ],
    ["up does nothing on a VOD without a list", "up", closed, false, false, { type: "none" }],
    ["down does nothing without a context", "down", closed, true, false, { type: "none" }],
    ["menu toggles chat", "menu", closed, true, true, { type: "toggleChat" }],
    ["play/pause toggles pause", "playPause", closed, true, true, { type: "togglePause" }],
    ["left scrubs back", "left", closed, true, true, { type: "scrub", dir: -1 }],
    ["rewind scrubs back", "rewind", closed, true, true, { type: "scrub", dir: -1 }],
    ["right scrubs forward on a VOD", "right", closed, false, false, { type: "scrub", dir: 1 }],
    [
      "fast-forward scrubs forward on a VOD",
      "fastForward",
      closed,
      false,
      false,
      { type: "scrub", dir: 1 },
    ],
    ["select opens options", "select", closed, true, true, { type: "openOptions" }],
    ["back exits", "back", closed, true, true, { type: "exit" }],
    ["back closes open options", "back", open, true, true, { type: "closeOptions" }],
    ["arrows go to spatial nav while options are open", "left", open, true, true, { type: "none" }],
    [
      "media keys still work with options open",
      "playPause",
      open,
      true,
      true,
      { type: "togglePause" },
    ],
    ["menu still toggles chat with options open", "menu", open, true, true, { type: "toggleChat" }],
  ];
  for (const [name, key, state, isLive, hasContext, expected] of cases) {
    test(name, () => expect(playerKeyAction(key, state, isLive, hasContext)).toEqual(expected));
  }

  test("within 5 s of live counts as live: forward does nothing", () => {
    const atLive: PlayerUiState = { ...closed, behindLiveMs: 4000 };
    expect(playerKeyAction("right", atLive, true, true)).toEqual({ type: "none" });
    expect(playerKeyAction("fastForward", atLive, true, true)).toEqual({ type: "none" });
  });

  test("behind live, forward scrubs (the scrub itself stops at LIVE)", () => {
    const behind: PlayerUiState = { ...closed, behindLiveMs: 12000 };
    expect(playerKeyAction("right", behind, true, true)).toEqual({ type: "scrub", dir: 1 });
    expect(playerKeyAction("fastForward", behind, true, true)).toEqual({ type: "scrub", dir: 1 });
  });

  test("seeking forward on live with unknown position does nothing", () => {
    expect(playerKeyAction("right", { ...closed, behindLiveMs: null }, true, true)).toEqual({
      type: "none",
    });
  });

  test("on a stopped screen: preview, back, and select/play-pause retry", () => {
    for (const status of ["offline", "error", "ended"] as const) {
      const stopped: PlayerUiState = { ...closed, status };
      expect(playerKeyAction("down", stopped, true, true)).toEqual({ type: "preview", dir: 1 });
      expect(playerKeyAction("back", stopped, true, true)).toEqual({ type: "exit" });
      expect(playerKeyAction("select", stopped, true, true)).toEqual({ type: "retry" });
      expect(playerKeyAction("playPause", stopped, true, true)).toEqual({ type: "retry" });
      expect(playerKeyAction("left", stopped, true, true)).toEqual({ type: "none" });
    }
  });
});
