import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import {
  getCategoryStreamsSorted,
  getCategoryVideosSorted,
  type LiveSort,
  type VideoSort,
} from "./directory";
import {
  type Clip,
  type ClipPeriod,
  getCategoryClipsPage,
  getCategoryStreamsPage,
  getChannelVideos,
  getFollowedStreams,
  getRecentFollowedVideos,
  getStreamsByUserIds,
  getTopCategories,
  type Page,
  type Stream,
  searchCategories,
  searchChannels,
  type Video,
} from "./helix";
import { tokenStore } from "./tokenStore";

const FIVE_MIN = 5 * 60_000;

function userId(): string {
  return tokenStore.load()?.userId ?? "";
}

export function useFollowedStreams() {
  const id = userId();
  return useQuery({
    queryKey: ["followedStreams", id],
    queryFn: () => getFollowedStreams(id),
    enabled: id !== "",
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
}

export function useRecentFollowedVideos() {
  const id = userId();
  return useQuery({
    queryKey: ["recentFollowedVideos", id],
    queryFn: () => getRecentFollowedVideos(id),
    enabled: id !== "",
    staleTime: 10 * 60_000,
  });
}

export function useTopCategories() {
  return useQuery({ queryKey: ["topCategories"], queryFn: getTopCategories, staleTime: FIVE_MIN });
}

export function useSearch(q: string) {
  const query = q.trim();
  return useQuery({
    queryKey: ["search", query],
    queryFn: async () => {
      const [channels, categories] = await Promise.all([
        searchChannels(query),
        searchCategories(query),
      ]);
      return { channels, categories };
    },
    enabled: query.length >= 2,
    staleTime: FIVE_MIN,
  });
}

export function useChannelVideos(channelId: string) {
  return useQuery({
    queryKey: ["channelVideos", channelId],
    queryFn: () => getChannelVideos(channelId),
    staleTime: FIVE_MIN,
  });
}

export function useChannelStream(channelId: string) {
  return useQuery({
    queryKey: ["channelStream", channelId],
    queryFn: async () => (await getStreamsByUserIds([channelId]))[0] ?? null,
    staleTime: 30_000,
  });
}

function livePage(gameId: string, sort: LiveSort, cursor?: string) {
  return sort === "viewers_desc"
    ? getCategoryStreamsPage(gameId, cursor)
    : getCategoryStreamsSorted(gameId, sort, cursor);
}

export type Section = "live" | "videos" | "clips";

export type SectionItem = Stream | Video | Clip;

function sectionPage(
  gameId: string,
  section: Section,
  sort: string,
  cursor?: string,
): Promise<Page<SectionItem>> {
  if (section === "live") return livePage(gameId, sort as LiveSort, cursor);
  if (section === "videos") return getCategoryVideosSorted(gameId, sort as VideoSort, cursor);
  return getCategoryClipsPage(gameId, sort as ClipPeriod, cursor);
}

/** First page of one category section in the given sort (the category page rows). */
export function useCategorySection(gameId: string, section: Section, sort: string) {
  return useQuery({
    queryKey: ["categorySection", gameId, section, sort],
    queryFn: () => sectionPage(gameId, section, sort),
    staleTime: section === "live" ? 60_000 : FIVE_MIN,
  });
}

/** All pages of one category section, loaded on demand ("See all"). */
export function useInfiniteSection(gameId: string, section: Section, sort: string) {
  return useInfiniteQuery({
    queryKey: ["categorySectionAll", gameId, section, sort],
    queryFn: ({ pageParam }) => sectionPage(gameId, section, sort, pageParam ?? undefined),
    initialPageParam: null as string | null,
    getNextPageParam: (last: Page<unknown>) => last.cursor,
    staleTime: FIVE_MIN,
  });
}
