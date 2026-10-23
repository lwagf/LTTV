import { afterEach, beforeEach, expect, test } from "bun:test";
import { stubFetch, stubNativeHttp } from "../../test/helpers";
import { setNative } from "../native/bridge";
import { AuthError } from "./auth";
import {
  getCategoryClipsPage,
  getFollowedStreams,
  getLiveBroadcastVod,
  getRecentFollowedVideos,
  helixGet,
} from "./helix";
import { type Tokens, tokenStore } from "./tokenStore";

let restore = () => {};
const fresh: Tokens = {
  accessToken: "at1",
  refreshToken: "rt1",
  expiresAt: Date.now() + 3_600_000,
  userId: "42",
  login: "logan",
};

beforeEach(() => {
  localStorage.clear();
  tokenStore.save(fresh);
});
afterEach(() => {
  restore();
  setNative(null);
});

function authOf(init?: RequestInit) {
  return (init?.headers as Record<string, string> | undefined)?.Authorization;
}

const refreshOk = () =>
  stubNativeHttp(() => ({
    status: 200,
    body: { access_token: "at2", refresh_token: "rt2", expires_in: 3600 },
  }));

test("sends Client-Id and Bearer", async () => {
  const f = stubFetch(() => ({ status: 200, body: { data: [] } }));
  restore = f.restore;
  await helixGet("/users", { id: "1" });
  const headers = f.calls[0].init?.headers as Record<string, string>;
  expect(f.calls[0].url).toBe("https://api.twitch.tv/helix/users?id=1");
  expect(headers.Authorization).toBe("Bearer at1");
  expect("Client-Id" in headers).toBe(true);
});

test("401 then refresh then retry succeeds", async () => {
  refreshOk();
  const f = stubFetch((_url, init) =>
    authOf(init) === "Bearer at1"
      ? { status: 401, body: {} }
      : { status: 200, body: { data: [1] } },
  );
  restore = f.restore;
  expect(await helixGet<{ data: number[] }>("/users", {})).toEqual({ data: [1] });
  expect(f.calls.map((c) => authOf(c.init))).toEqual(["Bearer at1", "Bearer at2"]);
});

test("second 401 clears tokens and throws revoked", async () => {
  refreshOk();
  restore = stubFetch(() => ({ status: 401, body: {} })).restore;
  const err = (await helixGet("/users", {}).catch((e) => e)) as AuthError;
  expect(err).toBeInstanceOf(AuthError);
  expect(err.reason).toBe("revoked");
  expect(tokenStore.load()).toBeNull();
});

test("refreshes proactively when near expiry", async () => {
  tokenStore.save({ ...fresh, expiresAt: Date.now() + 30_000 });
  refreshOk();
  const f = stubFetch(() => ({ status: 200, body: { data: [] } }));
  restore = f.restore;
  await helixGet("/users", {});
  expect(authOf(f.calls[0].init)).toBe("Bearer at2");
});

const stream = (id: string, viewers: number) => ({
  user_id: id,
  user_login: `u${id}`,
  user_name: `U${id}`,
  game_id: "g",
  game_name: "Game",
  title: "t",
  viewer_count: viewers,
  started_at: "2026-10-23T00:00:00Z",
  thumbnail_url: "https://x/live_user_u-{width}x{height}.jpg",
});

test("paginates followed streams via cursor and sorts by viewers", async () => {
  const f = stubFetch((url) =>
    url.includes("after=c1")
      ? { status: 200, body: { data: [stream("2", 500)], pagination: {} } }
      : { status: 200, body: { data: [stream("1", 10)], pagination: { cursor: "c1" } } },
  );
  restore = f.restore;
  const streams = await getFollowedStreams("42");
  expect(f.calls).toHaveLength(2);
  expect(streams.map((s) => s.userId)).toEqual(["2", "1"]);
});

test("thumbnail template replaced", async () => {
  restore = stubFetch(() => ({ status: 200, body: { data: [stream("1", 1)] } })).restore;
  const [s] = await getFollowedStreams("42");
  expect(s.thumbnailUrl).toBe("https://x/live_user_u-640x360.jpg");
});

function stubFollowedVideos() {
  const channels = Array.from({ length: 25 }, (_, i) => ({ broadcaster_id: `c${i}` }));
  return stubFetch((url) => {
    const params = new URL(url).searchParams;
    if (url.includes("/channels/followed")) {
      return { status: 200, body: { data: channels.slice(0, Number(params.get("first"))) } };
    }
    const id = params.get("user_id") ?? "";
    const n = Number(id.slice(1));
    return {
      status: 200,
      body: {
        data: Array.from({ length: 5 }, (_, j) => ({
          id: `${id}-${j}`,
          user_id: id,
          user_login: id,
          user_name: id,
          title: "v",
          created_at: new Date(Date.UTC(2026, 0, 1, n, j)).toISOString(),
          duration: "1h",
          thumbnail_url: "https://x/%{width}x%{height}.jpg",
        })),
      },
    };
  });
}

test("recent followed videos merges, sorts desc, caps at 20", async () => {
  const f = stubFollowedVideos();
  restore = f.restore;
  const videos = await getRecentFollowedVideos("42");
  const videoCalls = f.calls.filter((c) => c.url.includes("/videos"));
  expect(videoCalls).toHaveLength(20);
  expect(videos).toHaveLength(20);
  expect(videos[0].id).toBe("c19-4");
  expect(videos[0].thumbnailUrl).toBe("https://x/640x360.jpg");
  const times = videos.map((v) => v.createdAt);
  expect([...times].sort().reverse()).toEqual(times);
});

test("recent followed videos asks for only the 20 newest follows, not every page", async () => {
  const f = stubFollowedVideos();
  restore = f.restore;
  await getRecentFollowedVideos("42");
  const followed = f.calls.filter((c) => c.url.includes("/channels/followed"));
  expect(followed).toHaveLength(1);
  expect(new URL(followed[0].url).searchParams.get("first")).toBe("20");
});

test("recent followed videos keeps at most 5 /videos requests in flight", async () => {
  const f = stubFollowedVideos();
  const stubbed = globalThis.fetch;
  let inFlight = 0;
  let peak = 0;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    inFlight++;
    peak = Math.max(peak, inFlight);
    try {
      await new Promise((r) => setTimeout(r, 1));
      return await stubbed(input, init);
    } finally {
      inFlight--;
    }
  }) as typeof fetch;
  restore = f.restore;
  await getRecentFollowedVideos("42");
  expect(peak).toBe(5);
});

test("concurrent 401s share a single refresh", async () => {
  const native = refreshOk();
  restore = stubFetch((_url, init) =>
    authOf(init) === "Bearer at1" ? { status: 401, body: {} } : { status: 200, body: { data: [] } },
  ).restore;
  await Promise.all([helixGet("/a", {}), helixGet("/b", {}), helixGet("/c", {})]);
  expect(native.callsOf("http.request")).toHaveLength(1);
});

const rawVideo = (id: string, createdAt: string) => ({
  id,
  user_id: "u1",
  user_login: "u1",
  user_name: "U1",
  title: "v",
  created_at: createdAt,
  duration: "1h",
  thumbnail_url: "",
});

test("clips for 24h send started_at 24 hours before now; all time omits it", async () => {
  const f = stubFetch(() => ({
    status: 200,
    body: {
      data: [
        {
          id: "Slug1",
          title: "nice",
          broadcaster_id: "b",
          broadcaster_name: "B",
          view_count: 5,
          created_at: "2026-10-23T09:00:00Z",
          duration: 29.5,
          thumbnail_url: "https://clip/1.jpg",
          game_id: "g1",
        },
      ],
      pagination: { cursor: "next" },
    },
  }));
  restore = f.restore;
  const now = Date.parse("2026-10-23T12:00:00Z");
  const page = await getCategoryClipsPage("g1", "24h", undefined, now);
  expect(new URL(f.calls[0].url).searchParams.get("started_at")).toBe("2026-10-22T12:00:00.000Z");
  expect(page).toEqual({
    items: [
      {
        id: "Slug1",
        slug: "Slug1",
        title: "nice",
        broadcasterId: "b",
        broadcasterName: "B",
        viewCount: 5,
        createdAt: "2026-10-23T09:00:00Z",
        durationS: 29.5,
        thumbnailUrl: "https://clip/1.jpg",
        gameId: "g1",
      },
    ],
    cursor: "next",
  });
  await getCategoryClipsPage("g1", "all", undefined, now);
  expect(new URL(f.calls[1].url).searchParams.has("started_at")).toBe(false);
});

test("live broadcast VOD is the archive created after the stream started", async () => {
  restore = stubFetch(() => ({
    status: 200,
    body: { data: [rawVideo("now", "2026-10-23T10:00:30Z")] },
  })).restore;
  expect((await getLiveBroadcastVod("u1", "2026-10-23T10:00:00Z"))?.id).toBe("now");
});

test("live broadcast VOD is null when the newest archive predates the stream", async () => {
  restore = stubFetch(() => ({
    status: 200,
    body: { data: [rawVideo("old", "2026-10-22T10:00:00Z")] },
  })).restore;
  expect(await getLiveBroadcastVod("u1", "2026-10-23T10:00:00Z")).toBeNull();
});

test("clip periods send an end time of now, so 30 days means the last 30 days", async () => {
  const f = stubFetch(() => ({ status: 200, body: { data: [], pagination: {} } }));
  restore = f.restore;
  const now = Date.parse("2026-10-23T12:00:00Z");
  await getCategoryClipsPage("g1", "30d", undefined, now);
  const q = new URL(f.calls[0].url).searchParams;
  expect(q.get("started_at")).toBe("2026-09-23T12:00:00.000Z");
  expect(q.get("ended_at")).toBe("2026-10-23T12:00:00.000Z");
});
