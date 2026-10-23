import { GqlError, gql } from "./gql";
import type { Page, Stream, Video } from "./helix";

export type LiveSort = "viewers_desc" | "viewers_asc" | "recent";

interface DirectoryData {
  game: {
    streams: {
      edges: {
        cursor: string;
        node: {
          id: string;
          title: string;
          viewersCount: number;
          createdAt: string;
          previewImageURL: string;
          broadcaster: { id: string; login: string; displayName: string } | null;
          game: { id: string; name: string } | null;
        };
      }[];
      pageInfo: { hasNextPage: boolean };
    } | null;
  } | null;
}

const QUERY = `query LTTVDirectory($id: ID!, $after: Cursor, $sort: StreamSort) {
  game(id: $id) {
    streams(first: 20, after: $after, options: { sort: $sort }) {
      edges { cursor node { id title viewersCount createdAt previewImageURL(width: 640, height: 360)
        broadcaster { id login displayName } game { id name } } }
      pageInfo { hasNextPage }
    }
  }
}`;

/**
 * Category streams in the sorts Helix can't do (fewest viewers, recently started), via Twitch's
 * unofficial web GraphQL API. Most viewers uses Helix (`getCategoryStreamsPage`).
 */
export async function getCategoryStreamsSorted(
  gameId: string,
  sort: "viewers_asc" | "recent",
  cursor?: string,
): Promise<Page<Stream>> {
  const res = await gql<DirectoryData>({
    operationName: "LTTVDirectory",
    query: QUERY,
    variables: {
      id: gameId,
      after: cursor ?? null,
      sort: sort === "viewers_asc" ? "VIEWER_COUNT_ASC" : "RECENT",
    },
  });
  const streams = res.data?.game?.streams;
  if (!streams) throw new GqlError(res.errors?.[0]?.message ?? "directory unavailable");
  const items = streams.edges
    .filter((e) => e.node.broadcaster)
    .map(({ node }) => ({
      userId: node.broadcaster?.id ?? "",
      userLogin: node.broadcaster?.login ?? "",
      userName: node.broadcaster?.displayName ?? "",
      gameId: node.game?.id ?? gameId,
      gameName: node.game?.name ?? "",
      title: node.title,
      viewerCount: node.viewersCount,
      startedAt: node.createdAt,
      thumbnailUrl: node.previewImageURL,
    }));
  const last = streams.edges[streams.edges.length - 1];
  return { items, cursor: streams.pageInfo.hasNextPage && last ? last.cursor : null };
}

export type VideoSort = "time" | "views";

interface VideosData {
  game: {
    videos: {
      edges: {
        cursor: string;
        node: {
          id: string;
          title: string;
          viewCount: number;
          createdAt: string;
          lengthSeconds: number;
          previewThumbnailURL: string;
          owner: { id: string; login: string; displayName: string } | null;
        };
      }[];
      pageInfo: { hasNextPage: boolean };
    } | null;
  } | null;
}

const VIDEOS_QUERY = `query LTTVCategoryVideos($id: ID!, $after: Cursor, $sort: VideoSort) {
  game(id: $id) {
    videos(first: 20, after: $after, sort: $sort, types: [ARCHIVE]) {
      edges { cursor node { id title viewCount createdAt lengthSeconds
        previewThumbnailURL(width: 640, height: 360) owner { id login displayName } } }
      pageInfo { hasNextPage }
    }
  }
}`;

/** 3725 → "1h2m5s" (Helix's duration format, which the rest of the app uses). */
function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${h ? `${h}h` : ""}${h || m ? `${m}m` : ""}${s}s`;
}

/** A category's past broadcasts, via GQL because Helix `/videos?game_id=` returns nothing. */
export async function getCategoryVideosSorted(
  gameId: string,
  sort: VideoSort,
  cursor?: string,
): Promise<Page<Video>> {
  const res = await gql<VideosData>({
    operationName: "LTTVCategoryVideos",
    query: VIDEOS_QUERY,
    variables: { id: gameId, after: cursor ?? null, sort: sort === "views" ? "VIEWS" : "TIME" },
  });
  const videos = res.data?.game?.videos;
  if (!videos) throw new GqlError(res.errors?.[0]?.message ?? "videos unavailable");
  const items = videos.edges
    .filter((e) => e.node.owner)
    .map(({ node }) => ({
      id: node.id,
      userId: node.owner?.id ?? "",
      userLogin: node.owner?.login ?? "",
      userName: node.owner?.displayName ?? "",
      title: node.title,
      createdAt: node.createdAt,
      duration: formatDuration(node.lengthSeconds),
      thumbnailUrl: node.previewThumbnailURL,
    }));
  const last = videos.edges[videos.edges.length - 1];
  return { items, cursor: videos.pageInfo.hasNextPage && last ? last.cursor : null };
}
