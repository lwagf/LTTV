import { gql } from "./gql";

export interface VodComment {
  offsetSeconds: number;
  login: string;
  displayName: string;
  color: string | null;
  fragments: { text: string; emoteId: string | null }[];
}

export interface VodCommentPage {
  comments: VodComment[];
}

interface CommentsData {
  video: {
    comments: {
      edges: {
        node: {
          contentOffsetSeconds: number;
          commenter: { login: string; displayName: string } | null;
          message: {
            userColor: string | null;
            fragments: { text: string; emote?: { emoteID: string } | null }[];
          };
        };
      }[];
    } | null;
  } | null;
}

/** One page of replay chat from `offsetSeconds`, or "unavailable" if Twitch refuses the query. */
export async function fetchVodComments(
  videoId: string,
  offsetSeconds: number,
): Promise<VodCommentPage | "unavailable"> {
  let res: Awaited<ReturnType<typeof gql<CommentsData>>>;
  try {
    res = await gql<CommentsData>({
      operationName: "VideoCommentsByOffsetOrCursor",
      variables: { videoID: videoId, contentOffsetSeconds: Math.floor(offsetSeconds) },
      extensions: {
        persistedQuery: {
          version: 1,
          sha256Hash: "b70a3591ff0f4e0313d126c6a1502d79a1c02baebb288227c582044aa76adf6a",
        },
      },
    });
  } catch {
    return "unavailable";
  }
  const edges = res.data?.video?.comments?.edges;
  if (res.errors?.length || !edges) return "unavailable";
  return {
    comments: edges.map(({ node }) => ({
      offsetSeconds: node.contentOffsetSeconds,
      login: node.commenter?.login ?? "",
      displayName: node.commenter?.displayName ?? "",
      color: node.message.userColor ?? null,
      fragments: node.message.fragments.map((f) => ({
        text: f.text,
        emoteId: f.emote?.emoteID ?? null,
      })),
    })),
  };
}
