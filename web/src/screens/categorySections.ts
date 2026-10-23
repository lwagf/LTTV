import type { StreamRef } from "../nav/navStack";
import { clipRef, liveRef, vodRef } from "../nav/refs";
import type { Clip, Stream, Video } from "../twitch/helix";
import type { Section } from "../twitch/queries";
import { formatViewers } from "../ui/format";
import type { SortOption } from "../ui/SortButton";

export const SORTS: Record<Section, SortOption[]> = {
  live: [
    { value: "viewers_desc", label: "Most viewers" },
    { value: "viewers_asc", label: "Fewest viewers" },
    { value: "recent", label: "Recently started" },
  ],
  videos: [
    { value: "time", label: "Most recent" },
    { value: "views", label: "Most viewed" },
  ],
  clips: [
    { value: "24h", label: "Top 24h" },
    { value: "7d", label: "7 days" },
    { value: "30d", label: "30 days" },
    { value: "all", label: "All time" },
  ],
};

export const DEFAULT_SORT: Record<Section, string> = {
  live: "viewers_desc",
  videos: "time",
  clips: "7d",
};

export const SECTION_TITLES: Record<Section, string> = {
  live: "Live channels",
  videos: "Videos",
  clips: "Clips",
};

export interface SectionTile {
  id: string;
  image: string;
  title: string;
  subtitle: string;
  badge?: string;
  ref: StreamRef;
}

/** How each section's items look as tiles, and what they open in the player. */
export function sectionTiles(section: Section, items: unknown[]): SectionTile[] {
  if (section === "live") {
    return (items as Stream[]).map((s) => ({
      id: s.userId,
      image: s.thumbnailUrl,
      title: s.userName,
      subtitle: `${formatViewers(s.viewerCount)} · ${s.title}`,
      badge: "LIVE",
      ref: liveRef(s),
    }));
  }
  if (section === "videos") {
    return (items as Video[]).map((v) => ({
      id: v.id,
      image: v.thumbnailUrl,
      title: v.title,
      subtitle: `${v.userName} · ${v.createdAt.slice(0, 10)}`,
      ref: vodRef(v),
    }));
  }
  return (items as Clip[]).map((c) => ({
    id: c.slug,
    image: c.thumbnailUrl,
    title: c.title,
    subtitle: `${c.broadcasterName} · ${formatViewers(c.viewCount)} views`,
    ref: clipRef(c),
  }));
}

export function emptyText(section: Section, categoryName: string): string {
  if (section === "live") return `Nobody is live in ${categoryName} right now`;
  return section === "videos" ? "No videos" : "No clips for this period";
}
