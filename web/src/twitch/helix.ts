import { AuthError, refreshTokens } from "./auth";
import { TWITCH_CLIENT_ID } from "./config";
import { HttpError, httpRequest } from "./http";
import { type Tokens, tokenStore } from "./tokenStore";

export interface Stream {
  userId: string;
  userLogin: string;
  userName: string;
  gameId: string;
  gameName: string;
  title: string;
  viewerCount: number;
  startedAt: string;
  thumbnailUrl: string;
}

export interface Video {
  id: string;
  userId: string;
  userLogin: string;
  userName: string;
  title: string;
  createdAt: string;
  duration: string;
  thumbnailUrl: string;
}

export interface Category {
  id: string;
  name: string;
  boxArtUrl: string;
}

export interface Channel {
  id: string;
  login: string;
  displayName: string;
  isLive: boolean;
  gameName: string;
}

type Params = Record<string, string | string[] | undefined>;

let refreshing: Promise<Tokens> | null = null;

/** Refresh tokens are single-use, so concurrent callers must share one refresh. */
function refreshOnce(t: Tokens): Promise<Tokens> {
  if (!refreshing) {
    refreshing = refreshTokens(t).finally(() => {
      refreshing = null;
    });
  }
  return refreshing;
}

function buildUrl(path: string, params: Params): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined) continue;
    for (const item of Array.isArray(v) ? v : [v]) q.append(k, item);
  }
  const qs = q.toString();
  return `https://api.twitch.tv/helix${path}${qs ? `?${qs}` : ""}`;
}

async function send(path: string, params: Params, t: Tokens) {
  return httpRequest({
    url: buildUrl(path, params),
    method: "GET",
    headers: { "Client-Id": TWITCH_CLIENT_ID, Authorization: `Bearer ${t.accessToken}` },
  });
}

export async function helixGet<T>(path: string, params: Params): Promise<T> {
  let t = tokenStore.load();
  if (!t) throw new AuthError("revoked");
  if (t.expiresAt - 60_000 < Date.now()) t = await refreshOnce(t);

  let res = await send(path, params, t);
  if (res.status === 401) {
    const current = tokenStore.load();
    // Another request may already have refreshed while this one was in flight.
    t = current && current.accessToken !== t.accessToken ? current : await refreshOnce(t);
    res = await send(path, params, t);
    if (res.status === 401) {
      tokenStore.clear();
      throw new AuthError("revoked");
    }
  }
  if (res.status >= 400) throw new HttpError(res.status);
  return JSON.parse(res.body) as T;
}

interface HelixPage<T> {
  data: T[];
  pagination?: { cursor?: string };
}

async function getAll<T>(path: string, params: Params, maxPages = 10): Promise<T[]> {
  const out: T[] = [];
  let after: string | undefined;
  for (let i = 0; i < maxPages; i++) {
    const page = await helixGet<HelixPage<T>>(path, { ...params, first: "100", after });
    out.push(...page.data);
    after = page.pagination?.cursor;
    if (!after) break;
  }
  return out;
}

// Streams use {width}x{height}; VODs use %{width}x%{height}.
const sized = (url: string, w: number, h: number) =>
  url.replace(/%?\{width\}/, String(w)).replace(/%?\{height\}/, String(h));

interface RawStream {
  user_id: string;
  user_login: string;
  user_name: string;
  game_id: string;
  game_name: string;
  title: string;
  viewer_count: number;
  started_at: string;
  thumbnail_url: string;
}

const toStream = (s: RawStream): Stream => ({
  userId: s.user_id,
  userLogin: s.user_login,
  userName: s.user_name,
  gameId: s.game_id,
  gameName: s.game_name,
  title: s.title,
  viewerCount: s.viewer_count,
  startedAt: s.started_at,
  thumbnailUrl: sized(s.thumbnail_url, 640, 360),
});

interface RawVideo {
  id: string;
  user_id: string;
  user_login: string;
  user_name: string;
  title: string;
  created_at: string;
  duration: string;
  thumbnail_url: string;
}

const toVideo = (v: RawVideo): Video => ({
  id: v.id,
  userId: v.user_id,
  userLogin: v.user_login,
  userName: v.user_name,
  title: v.title,
  createdAt: v.created_at,
  duration: v.duration,
  thumbnailUrl: sized(v.thumbnail_url, 640, 360),
});

interface RawCategory {
  id: string;
  name: string;
  box_art_url: string;
}

const toCategory = (c: RawCategory): Category => ({
  id: c.id,
  name: c.name,
  boxArtUrl: sized(c.box_art_url, 285, 380).replace(/-\d+x\d+\./, "-285x380."),
});

const byViewers = (a: Stream, b: Stream) => b.viewerCount - a.viewerCount;

export async function getFollowedStreams(userId: string): Promise<Stream[]> {
  const raw = await getAll<RawStream>("/streams/followed", { user_id: userId });
  return raw.map(toStream).sort(byViewers);
}

export async function getStreamsByUserIds(ids: string[]): Promise<Stream[]> {
  if (!ids.length) return [];
  const page = await helixGet<HelixPage<RawStream>>("/streams", { user_id: ids });
  return page.data.map(toStream);
}

/** Runs `fn` over `items` with at most `limit` calls in flight, keeping the results in order. */
async function mapLimited<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>) {
  const out: R[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

export async function getRecentFollowedVideos(userId: string): Promise<Video[]> {
  // Follows come newest first, so one page covers the 20 channels this looks at.
  const follows = await helixGet<HelixPage<{ broadcaster_id: string }>>("/channels/followed", {
    user_id: userId,
    first: "20",
  });
  const pages = await mapLimited(follows.data, 5, (c) =>
    helixGet<HelixPage<RawVideo>>("/videos", {
      user_id: c.broadcaster_id,
      type: "archive",
      first: "5",
    }).catch((e) => {
      if (e instanceof AuthError) throw e;
      return { data: [] } as HelixPage<RawVideo>;
    }),
  );
  return pages
    .flatMap((p) => p.data.map(toVideo))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 20);
}

export async function getTopCategories(): Promise<Category[]> {
  const page = await helixGet<HelixPage<RawCategory>>("/games/top", { first: "40" });
  return page.data.map(toCategory);
}

export async function searchChannels(query: string): Promise<Channel[]> {
  const page = await helixGet<
    HelixPage<{
      id: string;
      broadcaster_login: string;
      display_name: string;
      is_live: boolean;
      game_name: string;
    }>
  >("/search/channels", { query, first: "20" });
  return page.data.map((c) => ({
    id: c.id,
    login: c.broadcaster_login,
    displayName: c.display_name,
    isLive: c.is_live,
    gameName: c.game_name,
  }));
}

export async function searchCategories(query: string): Promise<Category[]> {
  const page = await helixGet<HelixPage<RawCategory>>("/search/categories", { query, first: "20" });
  return page.data.map(toCategory);
}

export async function getChannelVideos(userId: string): Promise<Video[]> {
  const page = await helixGet<HelixPage<RawVideo>>("/videos", {
    user_id: userId,
    type: "archive",
    first: "20",
  });
  return page.data.map(toVideo);
}

export interface Page<T> {
  items: T[];
  cursor: string | null;
}

export type ClipPeriod = "24h" | "7d" | "30d" | "all";

export interface Clip {
  id: string;
  /** Clip ids are their URL slugs. */
  slug: string;
  title: string;
  broadcasterId: string;
  broadcasterName: string;
  viewCount: number;
  createdAt: string;
  durationS: number;
  thumbnailUrl: string;
  gameId: string;
}

export async function getCategoryStreamsPage(
  gameId: string,
  cursor?: string,
): Promise<Page<Stream>> {
  const page = await helixGet<HelixPage<RawStream>>("/streams", {
    game_id: gameId,
    first: "20",
    after: cursor,
  });
  return { items: page.data.map(toStream), cursor: page.pagination?.cursor ?? null };
}

const PERIOD_MS: Record<Exclude<ClipPeriod, "all">, number> = {
  "24h": 24 * 3600_000,
  "7d": 7 * 24 * 3600_000,
  "30d": 30 * 24 * 3600_000,
};

interface RawClip {
  id: string;
  title: string;
  broadcaster_id: string;
  broadcaster_name: string;
  view_count: number;
  created_at: string;
  duration: number;
  thumbnail_url: string;
  game_id: string;
}

/** Most-viewed clips in a category over the period (Helix orders clips by views). */
export async function getCategoryClipsPage(
  gameId: string,
  period: ClipPeriod,
  cursor?: string,
  now: number = Date.now(),
): Promise<Page<Clip>> {
  const page = await helixGet<HelixPage<RawClip>>("/clips", {
    game_id: gameId,
    first: "20",
    after: cursor,
    // Helix ends the window a week after started_at unless told otherwise.
    started_at: period === "all" ? undefined : new Date(now - PERIOD_MS[period]).toISOString(),
    ended_at: period === "all" ? undefined : new Date(now).toISOString(),
  });
  return {
    items: page.data.map((c) => ({
      id: c.id,
      slug: c.id,
      title: c.title,
      broadcasterId: c.broadcaster_id,
      broadcasterName: c.broadcaster_name,
      viewCount: c.view_count,
      createdAt: c.created_at,
      durationS: c.duration,
      thumbnailUrl: c.thumbnail_url,
      gameId: c.game_id,
    })),
    cursor: page.pagination?.cursor ?? null,
  };
}

/** The archive of the broadcast that is live now, or null (archives off, or not created yet). */
export async function getLiveBroadcastVod(
  userId: string,
  startedAt: string,
): Promise<Video | null> {
  const page = await helixGet<HelixPage<RawVideo>>("/videos", {
    user_id: userId,
    type: "archive",
    first: "1",
  });
  const v = page.data[0];
  if (!v) return null;
  return Date.parse(v.created_at) >= Date.parse(startedAt) - 120_000 ? toVideo(v) : null;
}
