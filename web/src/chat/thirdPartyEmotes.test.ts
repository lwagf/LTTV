import { beforeEach, expect, test } from "bun:test";
import { clearEmoteCache, loadThirdPartyEmotes } from "./thirdPartyEmotes";

beforeEach(() => clearEmoteCache());

const seventv = (name: string, id: string, animated = false) => ({
  name,
  data: { animated, host: { url: `//cdn.7tv.app/emote/${id}` } },
});
const bttv = (code: string, id: string, animated = false) => ({ id, code, animated });

type Routes = Record<string, { status: number; body: unknown }>;

function fakeFetch(routes: Routes) {
  return (async (input: RequestInfo | URL) => {
    const r = routes[String(input)];
    if (!r) return new Response("not found", { status: 404 });
    return new Response(JSON.stringify(r.body), { status: r.status });
  }) as typeof fetch;
}

const URLS = {
  stvUser: "https://7tv.io/v3/users/twitch/42",
  stvGlobal: "https://7tv.io/v3/emote-sets/global",
  bttvUser: "https://api.betterttv.net/3/cached/users/twitch/42",
  bttvGlobal: "https://api.betterttv.net/3/cached/emotes/global",
};

test("7TV channel overrides BTTV channel overrides globals", async () => {
  const map = await loadThirdPartyEmotes(
    "42",
    fakeFetch({
      [URLS.stvUser]: { status: 200, body: { emote_set: { emotes: [seventv("A", "s-ch")] } } },
      [URLS.bttvUser]: {
        status: 200,
        body: { channelEmotes: [bttv("A", "b-ch"), bttv("B", "b-ch")], sharedEmotes: [] },
      },
      [URLS.stvGlobal]: {
        status: 200,
        body: { emotes: [seventv("B", "s-gl"), seventv("C", "s-gl")] },
      },
      [URLS.bttvGlobal]: { status: 200, body: [bttv("C", "b-gl"), bttv("D", "b-gl")] },
    }),
  );
  expect(map.get("A")?.url).toBe("https://cdn.7tv.app/emote/s-ch/1x.webp");
  expect(map.get("B")?.url).toBe("https://cdn.betterttv.net/emote/b-ch/1x.webp");
  expect(map.get("C")?.url).toBe("https://cdn.7tv.app/emote/s-gl/1x.webp");
  expect(map.get("D")?.url).toBe("https://cdn.betterttv.net/emote/b-gl/1x.webp");
});

test("7TV 404 still returns BTTV emotes", async () => {
  const map = await loadThirdPartyEmotes(
    "42",
    fakeFetch({
      [URLS.bttvUser]: {
        status: 200,
        body: { channelEmotes: [], sharedEmotes: [bttv("pepeD", "p", true)] },
      },
    }),
  );
  expect(map.get("pepeD")).toEqual({
    url: "https://cdn.betterttv.net/emote/p/1x.webp",
    staticUrl: "https://cdn.betterttv.net/emote/p/static/1x.webp",
    animated: true,
  });
});

test("all providers failing returns empty map", async () => {
  const failing = (async () => {
    throw new Error("network down");
  }) as unknown as typeof fetch;
  const map = await loadThirdPartyEmotes("42", failing);
  expect(map.size).toBe(0);
});

test("7TV static url uses _static variant", async () => {
  const map = await loadThirdPartyEmotes(
    "42",
    fakeFetch({ [URLS.stvGlobal]: { status: 200, body: { emotes: [seventv("x", "id", true)] } } }),
  );
  expect(map.get("x")?.staticUrl).toBe("https://cdn.7tv.app/emote/id/1x_static.webp");
});
