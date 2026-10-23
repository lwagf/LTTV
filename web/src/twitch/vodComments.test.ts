import { afterEach, expect, test } from "bun:test";
import { stubNativeHttp } from "../../test/helpers";
import { setNative } from "../native/bridge";
import { fetchVodComments } from "./vodComments";

afterEach(() => setNative(null));

test("maps comment edges to a page", async () => {
  stubNativeHttp(() => ({
    status: 200,
    body: {
      data: {
        video: {
          comments: {
            edges: [
              {
                node: {
                  contentOffsetSeconds: 12,
                  commenter: { login: "mira", displayName: "Mira" },
                  message: {
                    userColor: "#FF0000",
                    fragments: [{ text: "hi " }, { text: "Kappa", emote: { emoteID: "25" } }],
                  },
                },
              },
            ],
          },
        },
      },
    },
  }));
  expect(await fetchVodComments("1", 0)).toEqual({
    comments: [
      {
        offsetSeconds: 12,
        login: "mira",
        displayName: "Mira",
        color: "#FF0000",
        fragments: [
          { text: "hi ", emoteId: null },
          { text: "Kappa", emoteId: "25" },
        ],
      },
    ],
  });
});

test("integrity errors mean unavailable", async () => {
  stubNativeHttp(() => ({
    status: 200,
    body: { errors: [{ message: "failed integrity check" }] },
  }));
  expect(await fetchVodComments("1", 0)).toBe("unavailable");
});
