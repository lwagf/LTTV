import type { Stream, Video } from "./helix";

/** Drop each live channel's in-progress broadcast from a VOD list (rewind the stream instead). */
export function withoutLiveBroadcasts(videos: Video[], live: Stream[]): Video[] {
  const startedAt = new Map(live.map((s) => [s.userId, Date.parse(s.startedAt)]));
  return videos.filter((v) => {
    const start = startedAt.get(v.userId);
    return start === undefined || Date.parse(v.createdAt) < start - 60_000;
  });
}
