import { useEffect, useRef, useState } from "react";
import type { StreamRef } from "../nav/navStack";
import { fetchVodComments, type VodComment } from "../twitch/vodComments";
import type { ChatStore } from "./chatStore";
import { type EmoteMap, loadThirdPartyEmotes } from "./thirdPartyEmotes";
import { type Part, tokenize, twitchEmoteUrl } from "./tokenize";

type FetchPage = typeof fetchVodComments;

/** Seeks bigger than this restart replay from the new position. */
const SEEK_JUMP_MS = 15000;
/** On start or seek, replay this much chat from just before the playhead. */
const BACKFILL_S = 5;
/** Keep at least this much chat queued ahead of the playhead. */
const LOOKAHEAD_S = 30;

function toParts(c: VodComment, emotes: EmoteMap, animated: boolean): Part[] {
  return c.fragments.flatMap((f): Part[] => {
    if (f.emoteId) return [{ kind: "emote", code: f.text, url: twitchEmoteUrl(f.emoteId) }];
    const asMessage = {
      id: "",
      login: c.login,
      displayName: c.displayName,
      color: c.color,
      text: f.text,
      action: false,
      twitchEmotes: [],
    };
    return tokenize(asMessage, emotes, animated);
  });
}

/** Replays VOD chat into `store` in step with the playhead (`positionMs`). */
export function useVodChat(
  ref: StreamRef | null,
  positionMs: number,
  store: ChatStore,
  animated: boolean,
  fetchPage: FetchPage = fetchVodComments,
  /** An empty page means "nothing yet" (the broadcast VOD keeps growing): ask again after this. */
  retryEmptyMs = 15_000,
): { unavailable: boolean } {
  const [unavailable, setUnavailable] = useState(false);
  const videoId = ref?.kind === "vod" ? ref.videoId : null;
  const userId = ref?.kind === "vod" ? ref.userId : null;

  const r = useRef({
    queue: [] as VodComment[],
    nextOffset: 0,
    fetching: false,
    retryAt: 0,
    started: false,
    lastPos: 0,
    generation: 0,
    emotes: new Map() as EmoteMap,
  });

  // Reset when the video changes.
  // biome-ignore lint/correctness/useExhaustiveDependencies: a new videoId must reset replay state
  useEffect(() => {
    const s = r.current;
    s.queue = [];
    s.nextOffset = 0;
    s.retryAt = 0;
    s.started = false;
    s.generation++;
    s.emotes = new Map();
    setUnavailable(false);
    store.clear();
    if (!userId) return;
    let cancelled = false;
    void loadThirdPartyEmotes(userId).then((m) => {
      if (!cancelled) s.emotes = m;
    });
    return () => {
      cancelled = true;
    };
  }, [videoId, userId, store]);

  useEffect(() => {
    const s = r.current;
    if (!videoId || unavailable) return;
    const posS = positionMs / 1000;

    if (!s.started) {
      s.started = true;
      s.nextOffset = Math.max(0, Math.floor(posS - BACKFILL_S));
    } else if (Math.abs(positionMs - s.lastPos) > SEEK_JUMP_MS) {
      s.queue = [];
      s.nextOffset = Math.max(0, Math.floor(posS - BACKFILL_S));
      s.retryAt = 0;
      s.generation++;
      s.fetching = false;
      store.clear();
    }
    s.lastPos = positionMs;

    while (s.queue.length && s.queue[0].offsetSeconds <= posS) {
      const c = s.queue.shift() as VodComment;
      store.add({
        id: `${c.offsetSeconds}-${c.login}-${Math.random()}`,
        displayName: c.displayName,
        color: c.color,
        parts: toParts(c, s.emotes, animated),
      });
    }

    const queuedUntil = s.queue.length ? s.queue[s.queue.length - 1].offsetSeconds : posS;
    if (s.fetching || Date.now() < s.retryAt || queuedUntil > posS + LOOKAHEAD_S) return;
    s.fetching = true;
    const generation = s.generation;
    const offset = s.nextOffset;
    void fetchPage(videoId, offset).then((page) => {
      if (generation !== s.generation) return;
      s.fetching = false;
      if (page === "unavailable") {
        setUnavailable(true);
        return;
      }
      const fresh = page.comments.filter((c) => c.offsetSeconds >= offset);
      if (!fresh.length) {
        s.retryAt = Date.now() + retryEmptyMs;
        return;
      }
      s.queue.push(...fresh);
      s.nextOffset = Math.floor(fresh[fresh.length - 1].offsetSeconds) + 1;
      // Deliver anything already due without waiting for the next progress tick.
      setTick((n) => n + 1);
    });
  });

  // Forces the delivery effect to run once a page arrives.
  const [, setTick] = useState(0);
  return { unavailable };
}
