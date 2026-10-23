import { afterEach, expect, test } from "bun:test";
import { stubNativeHttp } from "../../test/helpers";
import { setNative } from "../native/bridge";
import { getCategoryStreamsSorted, getCategoryVideosSorted } from "./directory";

afterEach(() => setNative(null));

const edge = (n: number) => ({
  cursor: `c${n}`,
  node: {
    id: `s${n}`,
    title: `Stream ${n}`,
    viewersCount: n,
    createdAt: "2026-10-23T10:00:00Z",
    previewImageURL: `https://thumb/${n}.jpg`,
    broadcaster: { id: `u${n}`, login: `user${n}`, displayName: `User${n}` },
    game: { id: "g1", name: "Just Chatting" },
  },
});

test("maps GQL edges to Stream and returns the last cursor", async () => {
  stubNativeHttp(() => ({
    status: 200,
    body: {
      data: { game: { streams: { edges: [edge(1), edge(2)], pageInfo: { hasNextPage: true } } } },
    },
  }));
  const page = await getCategoryStreamsSorted("g1", "viewers_asc");
  expect(page.cursor).toBe("c2");
  expect(page.items[0]).toEqual({
    userId: "u1",
    userLogin: "user1",
    userName: "User1",
    gameId: "g1",
    gameName: "Just Chatting",
    title: "Stream 1",
    viewerCount: 1,
    startedAt: "2026-10-23T10:00:00Z",
    thumbnailUrl: "https://thumb/1.jpg",
  });
});

test("uses VIEWER_COUNT_ASC for fewest viewers and RECENT for recently started", async () => {
  const bodies: string[] = [];
  stubNativeHttp((req) => {
    bodies.push(req.body ?? "");
    return {
      status: 200,
      body: { data: { game: { streams: { edges: [], pageInfo: { hasNextPage: false } } } } },
    };
  });
  await getCategoryStreamsSorted("g1", "viewers_asc");
  await getCategoryStreamsSorted("g1", "recent", "abc");
  expect(bodies[0]).toContain("VIEWER_COUNT_ASC");
  expect(bodies[1]).toContain("RECENT");
  expect(JSON.parse(bodies[1]).variables).toMatchObject({ id: "g1", after: "abc" });
});

test("no next page means a null cursor", async () => {
  stubNativeHttp(() => ({
    status: 200,
    body: { data: { game: { streams: { edges: [edge(1)], pageInfo: { hasNextPage: false } } } } },
  }));
  expect((await getCategoryStreamsSorted("g1", "recent")).cursor).toBeNull();
});

test("category videos come from GQL with the chosen sort, mapped to Video", async () => {
  const bodies: string[] = [];
  stubNativeHttp((req) => {
    bodies.push(req.body ?? "");
    return {
      status: 200,
      body: {
        data: {
          game: {
            videos: {
              edges: [
                {
                  cursor: "v1c",
                  node: {
                    id: "123",
                    title: "Big match",
                    viewCount: 5000,
                    createdAt: "2026-10-20T10:00:00Z",
                    lengthSeconds: 3600,
                    previewThumbnailURL: "https://vthumb/123.jpg",
                    owner: { id: "u9", login: "caster", displayName: "Caster" },
                  },
                },
              ],
              pageInfo: { hasNextPage: false },
            },
          },
        },
      },
    };
  });
  const page = await getCategoryVideosSorted("g1", "views");
  expect(JSON.parse(bodies[0]).variables).toMatchObject({ id: "g1", sort: "VIEWS" });
  expect(page).toEqual({
    items: [
      {
        id: "123",
        userId: "u9",
        userLogin: "caster",
        userName: "Caster",
        title: "Big match",
        createdAt: "2026-10-20T10:00:00Z",
        duration: "1h0m0s",
        thumbnailUrl: "https://vthumb/123.jpg",
      },
    ],
    cursor: null,
  });
});
