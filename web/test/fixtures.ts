import type { Category, Stream, Video } from "../src/twitch/helix";

export const stream = (n: number, over: Partial<Stream> = {}): Stream => ({
  userId: `u${n}`,
  userLogin: `user${n}`,
  userName: `User${n}`,
  gameId: "g1",
  gameName: "Just Chatting",
  title: `Stream ${n}`,
  viewerCount: 1000 * n,
  startedAt: "2026-10-23T10:00:00Z",
  thumbnailUrl: `https://thumb/${n}.jpg`,
  ...over,
});

export const video = (n: number): Video => ({
  id: `v${n}`,
  userId: `u${n}`,
  userLogin: `user${n}`,
  userName: `User${n}`,
  title: `Video ${n}`,
  createdAt: "2026-10-22T10:00:00Z",
  duration: "3h2m1s",
  thumbnailUrl: `https://vthumb/${n}.jpg`,
});

export const category = (n: number): Category => ({
  id: `c${n}`,
  name: `Game ${n}`,
  boxArtUrl: `https://box/${n}.jpg`,
});

export const clip = (n: number): import("../src/twitch/helix").Clip => ({
  id: `Slug${n}`,
  slug: `Slug${n}`,
  title: `Clip ${n}`,
  broadcasterId: `b${n}`,
  broadcasterName: `Streamer${n}`,
  viewCount: 1000 * n,
  createdAt: "2026-10-23T09:00:00Z",
  durationS: 30,
  thumbnailUrl: `https://clip/${n}.jpg`,
  gameId: "c1",
});
