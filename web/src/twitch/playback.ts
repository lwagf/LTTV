import { gql } from "./gql";
import { httpRequest } from "./http";

export class PlaybackError extends Error {
  constructor(
    readonly code: "offline" | "not_found" | "network",
    message: string,
  ) {
    super(message);
  }
}

interface AccessToken {
  value: string;
  signature: string;
}

// Same query Streamlink uses; the non-persisted form survives Twitch rotating query hashes.
const ACCESS_TOKEN_QUERY = `query PlaybackAccessToken_Template($login: String!, $isLive: Boolean!, $vodID: ID!, $isVod: Boolean!, $playerType: String!) {
  streamPlaybackAccessToken(channelName: $login, params: {platform: "web", playerBackend: "mediaplayer", playerType: $playerType}) @include(if: $isLive) { value signature }
  videoPlaybackAccessToken(id: $vodID, params: {platform: "web", playerBackend: "mediaplayer", playerType: $playerType}) @include(if: $isVod) { value signature }
}`;

async function accessToken(login: string, vodId: string): Promise<AccessToken> {
  const isVod = vodId !== "";
  let res: Awaited<ReturnType<typeof gql<Record<string, AccessToken | null>>>>;
  try {
    res = await gql<Record<string, AccessToken | null>>({
      operationName: "PlaybackAccessToken_Template",
      query: ACCESS_TOKEN_QUERY,
      variables: { login, isLive: !isVod, vodID: vodId, isVod, playerType: "embed" },
    });
  } catch (e) {
    throw new PlaybackError("network", String(e));
  }
  const token = isVod ? res.data?.videoPlaybackAccessToken : res.data?.streamPlaybackAccessToken;
  if (!token) throw new PlaybackError("not_found", isVod ? `VOD ${vodId} not found` : login);
  return token;
}

function usherUrl(path: string, token: AccessToken): string {
  const params = new URLSearchParams({
    sig: token.signature,
    token: token.value,
    allow_source: "true",
    allow_audio_only: "true",
    fast_bread: "true",
    playlist_include_framerate: "true",
    p: String(Math.floor(100000 + Math.random() * 900000)),
  });
  return `https://usher.ttvnw.net${path}?${params}`;
}

export async function getLiveStreamUrl(login: string): Promise<string> {
  const url = usherUrl(
    `/api/channel/hls/${login.toLowerCase()}.m3u8`,
    await accessToken(login, ""),
  );
  let status: number;
  try {
    status = (await httpRequest({ url, method: "GET" })).status;
  } catch (e) {
    throw new PlaybackError("network", String(e));
  }
  if (status === 404) throw new PlaybackError("offline", `${login} is offline`);
  if (status >= 400) throw new PlaybackError("network", `usher ${status}`);
  return url;
}

export async function getVodStreamUrl(videoId: string): Promise<string> {
  return usherUrl(`/vod/${videoId}.m3u8`, await accessToken("", videoId));
}

interface ClipData {
  clip: {
    playbackAccessToken: AccessToken;
    videoQualities: { quality: string; frameRate: number; sourceURL: string }[];
  } | null;
}

const CLIP_QUERY = `query VideoAccessToken_Clip($slug: ID!) {
  clip(slug: $slug) {
    playbackAccessToken(params: {platform: "web", playerBackend: "mediaplayer", playerType: "site"}) { value signature }
    videoQualities { quality frameRate sourceURL }
  }
}`;

/** A clip's mp4 URL (highest quality), signed with its playback token. */
export async function getClipUrl(slug: string): Promise<string> {
  let res: Awaited<ReturnType<typeof gql<ClipData>>>;
  try {
    res = await gql<ClipData>({
      operationName: "VideoAccessToken_Clip",
      query: CLIP_QUERY,
      variables: { slug },
    });
  } catch (e) {
    throw new PlaybackError("network", String(e));
  }
  const clip = res.data?.clip;
  const best = [...(clip?.videoQualities ?? [])].sort(
    (a, b) => Number(b.quality) - Number(a.quality) || b.frameRate - a.frameRate,
  )[0];
  if (!clip || !best) throw new PlaybackError("not_found", `clip ${slug} not found`);
  const url = new URL(best.sourceURL);
  url.searchParams.set("sig", clip.playbackAccessToken.signature);
  url.searchParams.set("token", clip.playbackAccessToken.value);
  return url.toString();
}
