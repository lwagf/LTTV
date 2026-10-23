import type { Clip, Stream, Video } from "../twitch/helix";
import type { StreamRef } from "./navStack";

export const liveRef = (s: Stream): StreamRef => ({
  kind: "live",
  login: s.userLogin,
  userId: s.userId,
  displayName: s.userName,
  gameName: s.gameName,
  startedAt: s.startedAt,
  title: s.title,
  thumbnailUrl: s.thumbnailUrl,
});

export const vodRef = (v: Video): StreamRef => ({
  kind: "vod",
  videoId: v.id,
  userId: v.userId,
  login: v.userLogin,
  displayName: v.userName,
  title: v.title,
  thumbnailUrl: v.thumbnailUrl,
});

export const clipRef = (c: Clip): StreamRef => ({
  kind: "clip",
  slug: c.slug,
  title: c.title,
  displayName: c.broadcasterName,
  viewCount: c.viewCount,
  thumbnailUrl: c.thumbnailUrl,
});
