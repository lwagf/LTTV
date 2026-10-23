import { afterEach, beforeEach, expect, test } from "bun:test";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { stubFetch, stubNativeHttp } from "../../test/helpers";
import { dispatchRemoteKey, dispatchRemoteKeyUp } from "../input/keys";
import { setNative } from "../native/bridge";
import type { FakeNative } from "../native/fakeNative";
import { currentScreen, push, resetTo, type StreamRef } from "../nav/navStack";
import { updateSettings } from "../settings/settings";
import { tokenStore } from "../twitch/tokenStore";
import { PlayerScreen } from "./PlayerScreen";

const live = (login: string): StreamRef => ({
  kind: "live",
  login,
  userId: `id-${login}`,
  displayName: login.toUpperCase(),
  gameName: "Game",
});
const vod: StreamRef = {
  kind: "vod",
  videoId: "123",
  userId: "u",
  login: "a",
  displayName: "A",
  title: "Old stream",
};

let native: FakeNative;
beforeEach(() => {
  localStorage.clear();
  native = stubNativeHttp((req) =>
    req.url.includes("usher")
      ? { status: 200, body: "#EXTM3U" }
      : {
          status: 200,
          body: {
            data: {
              streamPlaybackAccessToken: { value: "v", signature: "s" },
              videoPlaybackAccessToken: { value: "v", signature: "s" },
            },
          },
        },
  );
});
afterEach(() => {
  cleanup();
  setNative(null);
});

const loads = () =>
  native.callsOf("player.load").map((c) => c.args as { url: string; isLive: boolean });

test("loads the live url with isLive true", async () => {
  render(<PlayerScreen streamRef={live("lirik")} context={[live("lirik")]} />);
  await waitFor(() => expect(loads()).toHaveLength(1));
  expect(loads()[0].isLive).toBe(true);
  expect(loads()[0].url).toContain("/api/channel/hls/lirik.m3u8");
});

test("down twice switches to the next channel in the context", async () => {
  const ctx = [live("a"), live("b")];
  render(<PlayerScreen streamRef={ctx[0]} context={ctx} />);
  await waitFor(() => expect(loads()).toHaveLength(1));
  act(() => {
    dispatchRemoteKey("down");
  });
  act(() => {
    dispatchRemoteKey("down");
  });
  await waitFor(() => expect(loads()).toHaveLength(2));
  expect(loads()[1].url).toContain("/hls/b.m3u8");
  expect(screen.getByText("B · Game")).toBeTruthy();
});

test("down at the end of the context does nothing", async () => {
  const ctx = [live("a"), live("b")];
  render(<PlayerScreen streamRef={ctx[1]} context={ctx} />);
  await waitFor(() => expect(loads()).toHaveLength(1));
  act(() => {
    dispatchRemoteKey("down");
  });
  await new Promise((r) => setTimeout(r, 50));
  expect(loads()).toHaveLength(1);
});

test("unmount stops the player", async () => {
  const { unmount } = render(<PlayerScreen streamRef={live("a")} context={[]} />);
  await waitFor(() => expect(loads()).toHaveLength(1));
  unmount();
  expect(native.callsOf("player.stop")).toHaveLength(1);
});

test("VODs load from position 0 and have no Go to LIVE option", async () => {
  render(<PlayerScreen streamRef={vod} context={[]} />);
  await waitFor(() => expect(loads()).toHaveLength(1));
  expect(native.callsOf("player.load")[0].args).toMatchObject({
    isLive: false,
    startPositionMs: 0,
  });
  act(() => {
    dispatchRemoteKey("select");
  });
  expect(screen.getByText("Mute")).toBeTruthy();
  expect(screen.queryByText("Go to LIVE")).toBeNull();
});

test("live options include Go to LIVE", async () => {
  render(<PlayerScreen streamRef={live("a")} context={[]} />);
  await waitFor(() => expect(loads()).toHaveLength(1));
  act(() => {
    dispatchRemoteKey("select");
  });
  expect(screen.getByText("Go to LIVE")).toBeTruthy();
});

test("offline channel shows the offline message", async () => {
  native.respond("http.request", (req) =>
    req.url.includes("usher")
      ? { status: 404, body: "[]" }
      : {
          status: 200,
          body: JSON.stringify({
            data: { streamPlaybackAccessToken: { value: "v", signature: "s" } },
          }),
        },
  );
  render(<PlayerScreen streamRef={live("lirik")} context={[]} />);
  expect(await screen.findByText("LIRIK is offline")).toBeTruthy();
});

test("scrubbing shows the seekbar preview of how far back you'll land", async () => {
  render(<PlayerScreen streamRef={live("a")} context={[]} />);
  await waitFor(() => expect(loads()).toHaveLength(1));
  expect(screen.queryByTestId("seekbar")).toBeNull();
  act(() =>
    native.emit("player.progress", {
      positionMs: 89000,
      durationMs: 240000,
      isLive: true,
      behindLiveMs: 151000,
    }),
  );
  act(() => {
    dispatchRemoteKey("left");
  });
  expect(screen.getByTestId("seekbar")).toBeTruthy();
  expect(screen.getByText("−2:41")).toBeTruthy();
});

test("a VOD whose replay is unavailable says so in chat", async () => {
  native.respond("http.request", (req) => {
    if (req.url.includes("usher")) return { status: 200, body: "#EXTM3U" };
    const body = req.body ?? "";
    return body.includes("VideoCommentsByOffsetOrCursor")
      ? { status: 200, body: JSON.stringify({ errors: [{ message: "integrity" }] }) }
      : {
          status: 200,
          body: JSON.stringify({
            data: { videoPlaybackAccessToken: { value: "v", signature: "s" } },
          }),
        };
  });
  render(<PlayerScreen streamRef={vod} context={[]} />);
  expect(await screen.findByText("Chat replay unavailable")).toBeTruthy();
});

test("switching to an offline channel stops the previous stream and ignores its events", async () => {
  const ctx = [live("a"), live("b")];
  native.respond("http.request", (req) =>
    req.url.includes("usher")
      ? { status: req.url.includes("/hls/b.m3u8") ? 404 : 200, body: "#EXTM3U" }
      : {
          status: 200,
          body: JSON.stringify({
            data: { streamPlaybackAccessToken: { value: "v", signature: "s" } },
          }),
        },
  );
  render(<PlayerScreen streamRef={ctx[0]} context={ctx} />);
  await waitFor(() => expect(loads()).toHaveLength(1));
  act(() => {
    dispatchRemoteKey("down");
  });
  act(() => {
    dispatchRemoteKey("down");
  });
  expect(await screen.findByText("B is offline")).toBeTruthy();
  expect(native.callsOf("player.stop").length).toBeGreaterThan(0);
  // A late event from A's player must not hide B's offline message.
  act(() =>
    native.emit("player.state", { state: "ready", playing: true, error: null, httpStatus: null }),
  );
  expect(screen.getByText("B is offline")).toBeTruthy();
});

const gqlOk = {
  status: 200,
  body: JSON.stringify({ data: { streamPlaybackAccessToken: { value: "v", signature: "s" } } }),
};
const nativeError = {
  state: "idle" as const,
  playing: false,
  error: "ERROR_CODE_IO_BAD_HTTP_STATUS",
  httpStatus: 404,
};

test("a live playback error rechecks the channel and shows offline when it has ended", async () => {
  let usherStatus = 200;
  native.respond("http.request", (req) =>
    req.url.includes("usher") ? { status: usherStatus, body: "#EXTM3U" } : gqlOk,
  );
  render(<PlayerScreen streamRef={live("lirik")} context={[]} />);
  await waitFor(() => expect(loads()).toHaveLength(1));
  usherStatus = 404;
  act(() => native.emit("player.state", nativeError));
  expect(await screen.findByText("LIRIK is offline")).toBeTruthy();
});

test("a live playback error while the channel is still live reloads once by itself", async () => {
  native.respond("http.request", (req) =>
    req.url.includes("usher") ? { status: 200, body: "#EXTM3U" } : gqlOk,
  );
  render(<PlayerScreen streamRef={live("lirik")} context={[]} />);
  await waitFor(() => expect(loads()).toHaveLength(1));
  act(() => native.emit("player.state", nativeError));
  await waitFor(() => expect(loads()).toHaveLength(2));
  // A second failure doesn't loop: it shows the error and waits for the user.
  act(() => native.emit("player.state", nativeError));
  expect(await screen.findByText("Couldn't play this stream")).toBeTruthy();
  expect(loads()).toHaveLength(2);
});

test("select on an error screen retries the stream", async () => {
  native.respond("http.request", (req) =>
    req.url.includes("usher") ? { status: 500, body: "" } : gqlOk,
  );
  render(<PlayerScreen streamRef={live("lirik")} context={[]} />);
  expect(await screen.findByText("Couldn't play this stream")).toBeTruthy();
  native.respond("http.request", (req) =>
    req.url.includes("usher") ? { status: 200, body: "#EXTM3U" } : gqlOk,
  );
  act(() => {
    dispatchRemoteKey("select");
  });
  await waitFor(() => expect(loads()).toHaveLength(1));
});

// Scrubbing and full-broadcast rewind

const HOUR = 3600_000;

function liveWithStart(login: string, startedAt: string): StreamRef {
  return { ...live(login), startedAt } as StreamRef;
}

/** Helix answers for the in-progress VOD lookup (via fetch), plus a signed-in token. */
function stubBroadcastVod(createdAt: string | null) {
  tokenStore.save({
    accessToken: "a",
    refreshToken: "r",
    expiresAt: Date.now() + HOUR,
    userId: "me",
    login: "me",
  });
  return stubFetch((url) =>
    url.includes("/helix/videos")
      ? {
          status: 200,
          body: {
            data: createdAt
              ? [
                  {
                    id: "vod1",
                    user_id: "id-a",
                    user_login: "a",
                    user_name: "A",
                    title: "t",
                    created_at: createdAt,
                    duration: "3h",
                    thumbnail_url: "",
                  },
                ]
              : [],
          },
        }
      : undefined,
  );
}

const vodOk = {
  status: 200,
  body: JSON.stringify({
    data: {
      streamPlaybackAccessToken: { value: "v", signature: "s" },
      videoPlaybackAccessToken: { value: "v", signature: "s" },
    },
  }),
};

async function startLive(ref: StreamRef) {
  native.respond("http.request", (req) =>
    req.url.includes("usher") ? { status: 200, body: "#EXTM3U" } : vodOk,
  );
  render(<PlayerScreen streamRef={ref} context={[]} />);
  await waitFor(() => expect(loads()).toHaveLength(1));
  act(() =>
    native.emit("player.progress", {
      positionMs: 238000,
      durationMs: 240000,
      isLive: true,
      behindLiveMs: 2000,
    }),
  );
}

function hold(key: "left" | "right", presses: number) {
  act(() => {
    dispatchRemoteKey(key);
    for (let i = 1; i < presses; i++) dispatchRemoteKey(key, { repeat: true });
  });
}

/** Let go, then wait out the tap window (instant test presses count as quick taps). */
async function release(key: "left" | "right") {
  act(() => dispatchRemoteKeyUp(key));
  await act(() => new Promise((r) => setTimeout(r, 650)));
}

test("holding left moves the seekbar without seeking until release", async () => {
  const f = stubBroadcastVod(null);
  try {
    await startLive(live("a"));
    hold("left", 3);
    expect(screen.getByTestId("seekbar")).toBeTruthy();
    expect(native.callsOf("player.seekBy")).toHaveLength(0);
    await release("left");
    expect(native.callsOf("player.seekBy")).toEqual([
      { cmd: "player.seekBy", args: { deltaMs: -30000 } },
    ]);
  } finally {
    f.restore();
  }
});

test("releasing far back on live loads the in-progress VOD at the matching moment", async () => {
  const started = new Date(Date.now() - 3 * HOUR).toISOString();
  const created = new Date(Date.now() - 3 * HOUR + 20_000).toISOString();
  const f = stubBroadcastVod(created);
  try {
    await startLive(liveWithStart("a", started));
    await new Promise((r) => setTimeout(r, 20));
    hold("left", 30); // 30 quick taps = 300 s further back
    await release("left");
    await waitFor(() => expect(loads()).toHaveLength(2));
    const args = native.callsOf("player.load")[1].args as {
      url: string;
      isLive: boolean;
      startPositionMs: number;
    };
    expect(args.isLive).toBe(false);
    expect(args.url).toContain("/vod/vod1.m3u8");
    const expected = Date.now() - Date.parse(created) - (2000 + 300_000);
    expect(Math.abs(args.startPositionMs - expected)).toBeLessThan(3000);
  } finally {
    f.restore();
  }
});

test("releasing within the live window seeks the live stream", async () => {
  const f = stubBroadcastVod(null);
  try {
    await startLive(live("a"));
    hold("left", 2);
    await release("left");
    expect(native.callsOf("player.seekBy")).toEqual([
      { cmd: "player.seekBy", args: { deltaMs: -20000 } },
    ]);
    expect(loads()).toHaveLength(1);
  } finally {
    f.restore();
  }
});

test("scrubbing forward to LIVE goes to the live edge", async () => {
  const f = stubBroadcastVod(null);
  try {
    await startLive(live("a"));
    act(() =>
      native.emit("player.progress", {
        positionMs: 200000,
        durationMs: 240000,
        isLive: true,
        behindLiveMs: 15000,
      }),
    );
    hold("right", 2);
    await release("right");
    expect(native.callsOf("player.seekToLive")).toHaveLength(1);
    expect(native.callsOf("player.seekBy")).toHaveLength(0);
  } finally {
    f.restore();
  }
});

test("without an in-progress VOD rewind stays inside the 4-minute window", async () => {
  const f = stubBroadcastVod(null);
  try {
    await startLive(liveWithStart("a", new Date(Date.now() - 3 * HOUR).toISOString()));
    await new Promise((r) => setTimeout(r, 20));
    hold("left", 60);
    await release("left");
    const seeks = native
      .callsOf("player.seekBy")
      .map((c) => (c.args as { deltaMs: number }).deltaMs);
    expect(seeks).toHaveLength(1);
    expect(seeks[0]).toBeGreaterThanOrEqual(-240000);
    expect(loads()).toHaveLength(1);
  } finally {
    f.restore();
  }
});

test("reaching the end of the in-progress VOD returns to live", async () => {
  const started = new Date(Date.now() - 3 * HOUR).toISOString();
  const f = stubBroadcastVod(new Date(Date.now() - 3 * HOUR + 20_000).toISOString());
  try {
    await startLive(liveWithStart("a", started));
    await new Promise((r) => setTimeout(r, 20));
    hold("left", 30);
    await release("left");
    await waitFor(() => expect(loads()).toHaveLength(2));
    const start = (native.callsOf("player.load")[1].args as { startPositionMs: number })
      .startPositionMs;
    // Playing from where we asked, then catching up with the VOD's end.
    act(() =>
      native.emit("player.progress", {
        positionMs: start,
        durationMs: start + 60_000,
        isLive: true,
        behindLiveMs: 0,
      }),
    );
    act(() =>
      native.emit("player.progress", {
        positionMs: start + 55_000,
        durationMs: start + 60_000,
        isLive: true,
        behindLiveMs: 0,
      }),
    );
    await waitFor(() => expect(loads()).toHaveLength(3));
    expect(loads()[2].isLive).toBe(true);
  } finally {
    f.restore();
  }
});

test("on a VOD, scrubbing commits a single seek on release", async () => {
  render(<PlayerScreen streamRef={vod} context={[]} />);
  await waitFor(() => expect(loads()).toHaveLength(1));
  act(() =>
    native.emit("player.progress", {
      positionMs: 600_000,
      durationMs: 3 * HOUR,
      isLive: false,
      behindLiveMs: null,
    }),
  );
  hold("right", 4);
  expect(native.callsOf("player.seekBy")).toHaveLength(0);
  await release("right");
  expect(native.callsOf("player.seekBy")).toEqual([
    { cmd: "player.seekBy", args: { deltaMs: 40000 } },
  ]);
});

test("with the options bar open, held arrows don't scrub", async () => {
  render(<PlayerScreen streamRef={vod} context={[]} />);
  await waitFor(() => expect(loads()).toHaveLength(1));
  act(() => {
    dispatchRemoteKey("select");
  });
  hold("left", 3);
  await release("left");
  expect(native.callsOf("player.seekBy")).toHaveLength(0);
});

test("with no key-up, the scrub commits 700 ms after the last press", async () => {
  render(<PlayerScreen streamRef={vod} context={[]} />);
  await waitFor(() => expect(loads()).toHaveLength(1));
  act(() =>
    native.emit("player.progress", {
      positionMs: 600_000,
      durationMs: 3 * HOUR,
      isLive: false,
      behindLiveMs: null,
    }),
  );
  act(() => {
    dispatchRemoteKey("left");
  });
  expect(native.callsOf("player.seekBy")).toHaveLength(0);
  await waitFor(() => expect(native.callsOf("player.seekBy")).toHaveLength(1), { timeout: 1500 });
});

// Confirm-to-switch

test("down once previews the next channel without switching", async () => {
  const ctx = [live("a"), live("b")];
  render(<PlayerScreen streamRef={ctx[0]} context={ctx} />);
  await waitFor(() => expect(loads()).toHaveLength(1));
  act(() => {
    dispatchRemoteKey("down");
  });
  expect(screen.getByTestId("switch-preview").textContent).toContain("B");
  expect(screen.getByText("Press ▼ again to switch")).toBeTruthy();
  await new Promise((r) => setTimeout(r, 30));
  expect(loads()).toHaveLength(1);
});

test("back closes the preview without leaving the player", async () => {
  const ctx = [live("a"), live("b")];
  resetTo({ name: "home" });
  push({ name: "player", ref: ctx[0], context: ctx });
  render(<PlayerScreen streamRef={ctx[0]} context={ctx} />);
  await waitFor(() => expect(loads()).toHaveLength(1));
  act(() => {
    dispatchRemoteKey("down");
  });
  act(() => {
    dispatchRemoteKey("back");
  });
  expect(screen.queryByTestId("switch-preview")).toBeNull();
  expect(currentScreen().name).toBe("player");
});

test("VODs switch with the same confirm", async () => {
  const other: StreamRef = { ...vod, videoId: "456", title: "Another stream" };
  render(<PlayerScreen streamRef={vod} context={[vod, other]} />);
  await waitFor(() => expect(loads()).toHaveLength(1));
  act(() => {
    dispatchRemoteKey("down");
  });
  expect(screen.getByTestId("switch-preview").textContent).toContain("Another stream");
  act(() => {
    dispatchRemoteKey("down");
  });
  await waitFor(() => expect(loads()).toHaveLength(2));
  expect(loads()[1].url).toContain("/vod/456.m3u8");
});

test("rewinding past what the live stream has buffered so far switches to the VOD", async () => {
  const started = new Date(Date.now() - 3 * HOUR).toISOString();
  const f = stubBroadcastVod(new Date(Date.now() - 3 * HOUR + 20_000).toISOString());
  try {
    native.respond("http.request", (req) =>
      req.url.includes("usher") ? { status: 200, body: "#EXTM3U" } : vodOk,
    );
    render(<PlayerScreen streamRef={liveWithStart("a", started)} context={[]} />);
    await waitFor(() => expect(loads()).toHaveLength(1));
    // Just tuned in: 25 s of live history, 2 s behind.
    act(() =>
      native.emit("player.progress", {
        positionMs: 23_000,
        durationMs: 25_000,
        isLive: true,
        behindLiveMs: 2000,
      }),
    );
    await new Promise((r) => setTimeout(r, 20));
    hold("left", 4); // 40 s back
    await release("left");
    await waitFor(() => expect(loads()).toHaveLength(2));
    expect(loads()[1].isLive).toBe(false);
  } finally {
    f.restore();
  }
});

test("an in-progress VOD briefly reporting its end before the start seek lands doesn't bounce back to live", async () => {
  const started = new Date(Date.now() - 3 * HOUR).toISOString();
  const f = stubBroadcastVod(new Date(Date.now() - 3 * HOUR + 20_000).toISOString());
  try {
    await startLive(liveWithStart("a", started));
    await new Promise((r) => setTimeout(r, 20));
    hold("left", 30);
    await release("left");
    await waitFor(() => expect(loads()).toHaveLength(2));
    // Before its start position applies, the VOD reports the live-ish end of its playlist.
    act(() =>
      native.emit("player.progress", {
        positionMs: 10_795_000,
        durationMs: 10_800_000,
        isLive: true,
        behindLiveMs: 2000,
      }),
    );
    await new Promise((r) => setTimeout(r, 30));
    expect(loads()).toHaveLength(2);
  } finally {
    f.restore();
  }
});

test("once on the VOD, further rewinds and nearer-to-live seeks stay on the VOD", async () => {
  const started = new Date(Date.now() - 3 * HOUR).toISOString();
  const f = stubBroadcastVod(new Date(Date.now() - 3 * HOUR + 20_000).toISOString());
  try {
    await startLive(liveWithStart("a", started));
    await new Promise((r) => setTimeout(r, 20));
    hold("left", 30);
    await release("left");
    await waitFor(() => expect(loads()).toHaveLength(2));
    const start = (native.callsOf("player.load")[1].args as { startPositionMs: number })
      .startPositionMs;
    act(() =>
      native.emit("player.progress", {
        positionMs: start,
        durationMs: start + 300_000,
        isLive: true,
        behindLiveMs: null,
      }),
    );
    // Forward to ~60 s behind live: still on the VOD (the live stream has no history to use).
    hold("right", 24);
    await release("right");
    expect(loads()).toHaveLength(2);
    expect(native.callsOf("player.seekBy").length).toBeGreaterThan(0);
  } finally {
    f.restore();
  }
});

test("starts on the chosen item even when the list holds an equal copy of it", async () => {
  const other: StreamRef = { ...vod, videoId: "456", title: "Another stream" };
  render(<PlayerScreen streamRef={{ ...other }} context={[vod, { ...other }]} />);
  await waitFor(() => expect(loads()).toHaveLength(1));
  expect(loads()[0].url).toContain("/vod/456.m3u8");
});

// Clips

const clip = (n: number): StreamRef => ({
  kind: "clip",
  slug: `Slug${n}`,
  title: `Clip ${n}`,
  displayName: `Streamer${n}`,
  viewCount: 1000 * n,
  thumbnailUrl: `https://clip/${n}.jpg`,
});

const clipGql = {
  status: 200,
  body: JSON.stringify({
    data: {
      clip: {
        playbackAccessToken: { value: "{}", signature: "s" },
        videoQualities: [{ quality: "720", frameRate: 30, sourceURL: "https://clips/c.mp4" }],
      },
    },
  }),
};

const clipLoads = () =>
  native
    .callsOf("player.load")
    .map((c) => c.args as { url: string; format?: string; loop?: boolean });

test("clips load as progressive mp4 without looping when auto-advance is on", async () => {
  native.respond("http.request", () => clipGql);
  render(<PlayerScreen streamRef={clip(1)} context={[clip(1), clip(2)]} />);
  await waitFor(() => expect(clipLoads()).toHaveLength(1));
  expect(clipLoads()[0]).toMatchObject({ format: "progressive", loop: false });
  expect(clipLoads()[0].url).toContain("https://clips/c.mp4");
});

test("with auto-advance off, a clip loops", async () => {
  updateSettings({ clipsAutoAdvance: false });
  native.respond("http.request", () => clipGql);
  render(<PlayerScreen streamRef={clip(1)} context={[clip(1)]} />);
  await waitFor(() => expect(clipLoads()).toHaveLength(1));
  expect(clipLoads()[0].loop).toBe(true);
});

test("when a clip ends it moves to the next one without a confirm", async () => {
  native.respond("http.request", () => clipGql);
  render(<PlayerScreen streamRef={clip(1)} context={[clip(1), clip(2)]} />);
  await waitFor(() => expect(clipLoads()).toHaveLength(1));
  act(() =>
    native.emit("player.state", { state: "ended", playing: false, error: null, httpStatus: null }),
  );
  await waitFor(() => expect(clipLoads()).toHaveLength(2));
  expect(screen.queryByText("Stream ended")).toBeNull();
});

test("the last clip ending says End of clips and stays put", async () => {
  native.respond("http.request", () => clipGql);
  render(<PlayerScreen streamRef={clip(2)} context={[clip(1), clip(2)]} />);
  await waitFor(() => expect(clipLoads()).toHaveLength(1));
  act(() =>
    native.emit("player.state", { state: "ended", playing: false, error: null, httpStatus: null }),
  );
  expect(await screen.findByText("End of clips")).toBeTruthy();
  expect(clipLoads()).toHaveLength(1);
});

test("clips have no chat and show their title, streamer and views", async () => {
  native.respond("http.request", () => clipGql);
  const { container } = render(<PlayerScreen streamRef={clip(3)} context={[clip(3)]} />);
  await waitFor(() => expect(clipLoads()).toHaveLength(1));
  expect(screen.getByText("Streamer3 · Clip 3 · 3k views")).toBeTruthy();
  expect(container.querySelector(".player-chat")).toBeNull();
});

// VOD fallback, stale progress and preview edge cases

test("if the broadcast VOD won't play, rewind falls back to live instead of an error screen", async () => {
  const started = new Date(Date.now() - 3 * HOUR).toISOString();
  const f = stubBroadcastVod(new Date(Date.now() - 3 * HOUR + 20_000).toISOString());
  try {
    await startLive(liveWithStart("a", started));
    await new Promise((r) => setTimeout(r, 20));
    hold("left", 30);
    await release("left");
    await waitFor(() => expect(loads()).toHaveLength(2));
    // Sub-only VOD: usher refuses it.
    act(() =>
      native.emit("player.state", {
        state: "idle",
        playing: false,
        error: "ERROR_CODE_IO_BAD_HTTP_STATUS",
        httpStatus: 403,
      }),
    );
    await waitFor(() => expect(loads()).toHaveLength(3));
    expect(loads()[2].isLive).toBe(true);
    expect(screen.queryByText("Couldn't play this stream")).toBeNull();
  } finally {
    f.restore();
  }
});

test("progress from the old live stream while the VOD is loading doesn't bounce back to live", async () => {
  // Broadcast started 3 min ago; its VOD began 5 s after that.
  const started = new Date(Date.now() - 180_000).toISOString();
  const f = stubBroadcastVod(new Date(Date.now() - 175_000).toISOString());
  try {
    native.respond("http.request", (req) =>
      req.url.includes("usher") ? { status: 200, body: "#EXTM3U" } : vodOk,
    );
    render(<PlayerScreen streamRef={liveWithStart("a", started)} context={[]} />);
    await waitFor(() => expect(loads()).toHaveLength(1));
    act(() =>
      native.emit("player.progress", {
        positionMs: 20_000,
        durationMs: 22_000,
        isLive: true,
        behindLiveMs: 2000,
      }),
    );
    await new Promise((r) => setTimeout(r, 20));
    // The VOD's token request hangs, so the live stream keeps reporting progress meanwhile.
    native.respond("http.request", (req) =>
      req.body?.includes('"isVod":true') ? new Promise(() => {}) : vodOk,
    );
    hold("left", 6); // ~62 s behind → VOD at ~113 s
    await release("left");
    // A tick from the live stream that happens to sit near the VOD target and "near its end".
    act(() =>
      native.emit("player.progress", {
        positionMs: 110_000,
        durationMs: 113_000,
        isLive: true,
        behindLiveMs: 2000,
      }),
    );
    await new Promise((r) => setTimeout(r, 30));
    expect(loads()).toHaveLength(1);
  } finally {
    f.restore();
  }
});

test("a short rewind onto the VOD isn't undone by the VOD reporting its end before seeking", async () => {
  const started = new Date(Date.now() - 3 * HOUR).toISOString();
  const f = stubBroadcastVod(new Date(Date.now() - 3 * HOUR + 20_000).toISOString());
  try {
    native.respond("http.request", (req) =>
      req.url.includes("usher") ? { status: 200, body: "#EXTM3U" } : vodOk,
    );
    render(<PlayerScreen streamRef={liveWithStart("a", started)} context={[]} />);
    await waitFor(() => expect(loads()).toHaveLength(1));
    act(() =>
      native.emit("player.progress", {
        positionMs: 28_000,
        durationMs: 30_000,
        isLive: true,
        behindLiveMs: 2000,
      }),
    );
    await new Promise((r) => setTimeout(r, 20));
    hold("left", 4); // 42 s behind: more than the 30 s the live stream has
    await release("left");
    await waitFor(() => expect(loads()).toHaveLength(2));
    const start = (native.callsOf("player.load")[1].args as { startPositionMs: number })
      .startPositionMs;
    // Before the start seek lands, the in-progress VOD reports its end.
    act(() =>
      native.emit("player.progress", {
        positionMs: start + 37_000,
        durationMs: start + 42_000,
        isLive: true,
        behindLiveMs: null,
      }),
    );
    await new Promise((r) => setTimeout(r, 30));
    expect(loads()).toHaveLength(2);
  } finally {
    f.restore();
  }
});

test("left while a preview is open only dismisses it, even if the key is held", async () => {
  const ctx = [live("a"), live("b")];
  render(<PlayerScreen streamRef={ctx[0]} context={ctx} />);
  await waitFor(() => expect(loads()).toHaveLength(1));
  act(() =>
    native.emit("player.progress", {
      positionMs: 200_000,
      durationMs: 240_000,
      isLive: true,
      behindLiveMs: 30_000,
    }),
  );
  act(() => {
    dispatchRemoteKey("down");
  });
  hold("left", 3);
  expect(screen.queryByTestId("switch-preview")).toBeNull();
  await release("left");
  expect(native.callsOf("player.seekBy")).toHaveLength(0);
  // After letting go, Left scrubs again as normal.
  hold("left", 1);
  await release("left");
  expect(native.callsOf("player.seekBy")).toHaveLength(1);
});

// Tap bursts

function tap(key: "left" | "right", times: number) {
  for (let i = 0; i < times; i++) {
    act(() => {
      dispatchRemoteKey(key);
    });
    act(() => dispatchRemoteKeyUp(key));
  }
}

test("a burst of quick taps commits one combined seek after a short pause", async () => {
  render(<PlayerScreen streamRef={vod} context={[]} />);
  await waitFor(() => expect(loads()).toHaveLength(1));
  act(() =>
    native.emit("player.progress", {
      positionMs: 600_000,
      durationMs: 3 * HOUR,
      isLive: false,
      behindLiveMs: null,
    }),
  );
  tap("left", 3);
  expect(native.callsOf("player.seekBy")).toHaveLength(0);
  await waitFor(() =>
    expect(native.callsOf("player.seekBy")).toEqual([
      { cmd: "player.seekBy", args: { deltaMs: -30000 } },
    ]),
  );
});

test("seeking again while the VOD is still starting moves its start instead of seeking from the old stream", async () => {
  const started = new Date(Date.now() - 3 * HOUR).toISOString();
  const f = stubBroadcastVod(new Date(Date.now() - 3 * HOUR + 20_000).toISOString());
  try {
    await startLive(liveWithStart("a", started));
    await new Promise((r) => setTimeout(r, 20));
    // The VOD's token arrives late.
    let releaseToken: (v: unknown) => void = () => {};
    native.respond("http.request", (req) =>
      req.body?.includes('"isVod":true')
        ? new Promise((r) => {
            releaseToken = () => r(vodOk);
          })
        : vodOk,
    );
    hold("left", 30); // ~302 s behind → VOD
    await release("left");
    await new Promise((r) => setTimeout(r, 700));
    tap("left", 2); // a further 20 s back while the VOD is still starting
    await new Promise((r) => setTimeout(r, 900));
    expect(native.callsOf("player.seekBy")).toHaveLength(0);
    releaseToken(undefined);
    await waitFor(() => expect(loads()).toHaveLength(2));
    const start = (native.callsOf("player.load")[1].args as { startPositionMs: number })
      .startPositionMs;
    const created = Date.now() - 3 * HOUR + 20_000;
    const expected = Date.now() - created - (2000 + 320_000);
    expect(Math.abs(start - expected)).toBeLessThan(3000);
  } finally {
    f.restore();
  }
});
