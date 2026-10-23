import { afterEach, expect, test } from "bun:test";
import { stubNativeHttp } from "../../test/helpers";
import { setNative } from "../native/bridge";
import { GQL_CLIENT_ID, TWITCH_CLIENT_ID } from "./config";
import { getClipUrl, getLiveStreamUrl, getVodStreamUrl, PlaybackError } from "./playback";

afterEach(() => setNative(null));

const token = { value: '{"channel":"lirik","x":1}', signature: "sig123" };

/** GQL answers with `data`; usher (also proxied) answers with `usherStatus`. */
function gql(data: unknown, usherStatus = 200) {
  return stubNativeHttp((req) =>
    req.url.startsWith("https://usher.ttvnw.net")
      ? { status: usherStatus, body: "#EXTM3U" }
      : { status: 200, body: { data } },
  );
}

test("live url contains encoded token and signature", async () => {
  gql({ streamPlaybackAccessToken: token });
  const url = new URL(await getLiveStreamUrl("lirik"));
  expect(url.host).toBe("usher.ttvnw.net");
  expect(url.pathname).toBe("/api/channel/hls/lirik.m3u8");
  expect(url.searchParams.get("sig")).toBe("sig123");
  expect(url.searchParams.get("token")).toBe(token.value);
  expect(url.searchParams.get("allow_source")).toBe("true");
});

test("null token is PlaybackError not_found", async () => {
  gql({ streamPlaybackAccessToken: null });
  const err = await getLiveStreamUrl("nobody").catch((e) => e);
  expect(err).toBeInstanceOf(PlaybackError);
  expect(err.code).toBe("not_found");
});

test("usher 404 is PlaybackError offline", async () => {
  gql({ streamPlaybackAccessToken: token }, 404);
  const err = await getLiveStreamUrl("lirik").catch((e) => e);
  expect(err).toBeInstanceOf(PlaybackError);
  expect(err.code).toBe("offline");
});

test("vod url uses /vod/ path", async () => {
  gql({ videoPlaybackAccessToken: token });
  const url = new URL(await getVodStreamUrl("123456"));
  expect(url.pathname).toBe("/vod/123456.m3u8");
  expect(url.searchParams.get("sig")).toBe("sig123");
});

test("gql request uses GQL client id header, never TWITCH_CLIENT_ID", async () => {
  const native = gql({ streamPlaybackAccessToken: token });
  await getLiveStreamUrl("lirik");
  const args = native.callsOf("http.request")[0].args as {
    url: string;
    headers: Record<string, string>;
  };
  expect(args.url).toBe("https://gql.twitch.tv/gql");
  expect(args.headers["Client-Id"]).toBe(GQL_CLIENT_ID);
  expect(Object.values(args.headers)).not.toContain(TWITCH_CLIENT_ID);
});

test("clip url carries sig and encoded token and picks the highest quality", async () => {
  gql({
    clip: {
      playbackAccessToken: { value: '{"clip":1}', signature: "csig" },
      videoQualities: [
        { quality: "360", frameRate: 30, sourceURL: "https://clips/360.mp4" },
        { quality: "1080", frameRate: 60, sourceURL: "https://clips/1080.mp4" },
      ],
    },
  });
  const url = new URL(await getClipUrl("Slug1"));
  expect(url.origin + url.pathname).toBe("https://clips/1080.mp4");
  expect(url.searchParams.get("sig")).toBe("csig");
  expect(url.searchParams.get("token")).toBe('{"clip":1}');
});

test("a missing clip throws not_found", async () => {
  gql({ clip: null });
  const err = await getClipUrl("nope").catch((e) => e);
  expect(err).toBeInstanceOf(PlaybackError);
  expect(err.code).toBe("not_found");
});
