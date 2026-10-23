import { afterEach, expect, test } from "bun:test";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import type { StreamRef } from "../nav/navStack";
import type { VodComment, VodCommentPage } from "../twitch/vodComments";
import { createChatStore } from "./chatStore";
import { useVodChat } from "./useVodChat";

afterEach(cleanup);

const vod: StreamRef = {
  kind: "vod",
  videoId: "v1",
  userId: "u1",
  login: "a",
  displayName: "A",
  title: "t",
};

const comment = (offsetSeconds: number, text: string): VodComment => ({
  offsetSeconds,
  login: "x",
  displayName: "X",
  color: null,
  fragments: [{ text, emoteId: null }],
});

function pages(byOffset: Record<number, VodComment[]>) {
  const calls: number[] = [];
  const fetchPage = async (_id: string, offset: number): Promise<VodCommentPage> => {
    calls.push(offset);
    return { comments: byOffset[offset] ?? [] };
  };
  return { calls, fetchPage };
}

const texts = (store: ReturnType<typeof createChatStore>) =>
  store.visible().map((b) => b.parts.map((p) => (p.kind === "text" ? p.text : p.code)).join(""));

test("emits comments as the playhead passes their offset", async () => {
  const store = createChatStore(10, 60000);
  const { fetchPage } = pages({ 0: [comment(2, "early"), comment(8, "later")] });
  const { rerender } = renderHook(({ pos }) => useVodChat(vod, pos, store, true, fetchPage), {
    initialProps: { pos: 0 },
  });
  await waitFor(() => expect(texts(store)).toEqual([]));
  rerender({ pos: 3000 });
  await waitFor(() => expect(texts(store)).toEqual(["early"]));
  rerender({ pos: 9000 });
  await waitFor(() => expect(texts(store)).toEqual(["early", "later"]));
});

test("a seek of more than 15 s clears chat and refetches from 5 s before the new position", async () => {
  const store = createChatStore(10, 60000);
  const { calls, fetchPage } = pages({
    0: [comment(1, "start")],
    595: [comment(601, "after seek")],
  });
  const { rerender } = renderHook(({ pos }) => useVodChat(vod, pos, store, true, fetchPage), {
    initialProps: { pos: 2000 },
  });
  await waitFor(() => expect(texts(store)).toEqual(["start"]));
  rerender({ pos: 600500 });
  await waitFor(() => expect(calls).toContain(595));
  rerender({ pos: 601500 });
  await waitFor(() => expect(texts(store)).toEqual(["after seek"]));
});

test("starting mid-video shows the last few seconds of chat", async () => {
  const store = createChatStore(10, 60000);
  const { calls, fetchPage } = pages({ 5: [comment(7, "just before"), comment(20, "ahead")] });
  renderHook(() => useVodChat(vod, 10000, store, true, fetchPage));
  await waitFor(() => expect(texts(store)).toEqual(["just before"]));
  expect(calls[0]).toBe(5);
});

test("unavailable replay sets the flag", async () => {
  const store = createChatStore(10, 60000);
  const { result } = renderHook(() =>
    useVodChat(vod, 0, store, true, async () => "unavailable" as const),
  );
  await waitFor(() => expect(result.current.unavailable).toBe(true));
});

test("twitch emote fragments become emote parts", async () => {
  const store = createChatStore(10, 60000);
  const fetchPage = async (): Promise<VodCommentPage> => ({
    comments: [
      {
        ...comment(1, ""),
        fragments: [
          { text: "hi ", emoteId: null },
          { text: "Kappa", emoteId: "25" },
        ],
      },
    ],
  });
  renderHook(() => useVodChat(vod, 2000, store, true, fetchPage));
  await waitFor(() => expect(store.visible()).toHaveLength(1));
  expect(store.visible()[0].parts[1]).toMatchObject({ kind: "emote", code: "Kappa" });
});

test("an empty page near the end of a still-growing VOD is retried, not given up on", async () => {
  const store = createChatStore(10, 60000);
  let calls = 0;
  const fetchPage = async (): Promise<VodCommentPage> => {
    calls++;
    return { comments: calls === 1 ? [] : [comment(12, "new comment")] };
  };
  const { rerender } = renderHook(({ pos }) => useVodChat(vod, pos, store, true, fetchPage, 0), {
    initialProps: { pos: 10_000 },
  });
  await waitFor(() => expect(calls).toBe(1));
  rerender({ pos: 10_500 });
  rerender({ pos: 13_000 });
  await waitFor(() => expect(texts(store)).toEqual(["new comment"]));
});
