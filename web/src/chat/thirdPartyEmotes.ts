export interface Emote {
  url: string;
  staticUrl: string;
  animated: boolean;
}

/** Keyed by exact (case-sensitive) emote code. */
export type EmoteMap = Map<string, Emote>;

interface SevenTvEmote {
  name: string;
  data: { animated: boolean; host: { url: string } };
}

interface BttvEmote {
  id: string;
  code: string;
  animated: boolean;
}

const channelCache = new Map<string, Promise<EmoteMap>>();
let globalCache: Promise<[EmoteMap, EmoteMap]> | null = null;

export function clearEmoteCache() {
  channelCache.clear();
  globalCache = null;
}

async function getJson<T>(url: string, fetchImpl: typeof fetch): Promise<T | null> {
  try {
    const res = await fetchImpl(url);
    return res.ok ? ((await res.json()) as T) : null;
  } catch {
    return null;
  }
}

function fromSevenTv(emotes: SevenTvEmote[] | undefined): EmoteMap {
  const map: EmoteMap = new Map();
  for (const e of emotes ?? []) {
    const base = `https:${e.data.host.url}`;
    map.set(e.name, {
      url: `${base}/1x.webp`,
      staticUrl: `${base}/1x_static.webp`,
      animated: e.data.animated,
    });
  }
  return map;
}

function fromBttv(emotes: BttvEmote[] | undefined): EmoteMap {
  const map: EmoteMap = new Map();
  for (const e of emotes ?? []) {
    const base = `https://cdn.betterttv.net/emote/${e.id}`;
    map.set(e.code, {
      url: `${base}/1x.webp`,
      staticUrl: `${base}/static/1x.webp`,
      animated: e.animated,
    });
  }
  return map;
}

function loadGlobals(fetchImpl: typeof fetch): Promise<[EmoteMap, EmoteMap]> {
  if (!globalCache) {
    globalCache = Promise.all([
      getJson<{ emotes: SevenTvEmote[] }>("https://7tv.io/v3/emote-sets/global", fetchImpl).then(
        (j) => fromSevenTv(j?.emotes),
      ),
      getJson<BttvEmote[]>("https://api.betterttv.net/3/cached/emotes/global", fetchImpl).then(
        (j) => fromBttv(j ?? []),
      ),
    ]);
  }
  return globalCache;
}

/**
 * 7TV and BTTV emotes for a channel, merged with their global sets.
 * Precedence: 7TV channel > BTTV channel > 7TV global > BTTV global.
 * Any provider that fails simply contributes nothing.
 */
export function loadThirdPartyEmotes(
  twitchUserId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<EmoteMap> {
  let cached = channelCache.get(twitchUserId);
  if (!cached) {
    cached = (async () => {
      const [stvChannel, bttvChannel, [stvGlobal, bttvGlobal]] = await Promise.all([
        getJson<{ emote_set?: { emotes: SevenTvEmote[] } }>(
          `https://7tv.io/v3/users/twitch/${twitchUserId}`,
          fetchImpl,
        ).then((j) => fromSevenTv(j?.emote_set?.emotes)),
        getJson<{ channelEmotes: BttvEmote[]; sharedEmotes: BttvEmote[] }>(
          `https://api.betterttv.net/3/cached/users/twitch/${twitchUserId}`,
          fetchImpl,
        ).then((j) => fromBttv([...(j?.channelEmotes ?? []), ...(j?.sharedEmotes ?? [])])),
        loadGlobals(fetchImpl),
      ]);
      // Lowest precedence first; later sets overwrite earlier ones.
      return new Map([...bttvGlobal, ...stvGlobal, ...bttvChannel, ...stvChannel]);
    })();
    channelCache.set(twitchUserId, cached);
  }
  return cached;
}
