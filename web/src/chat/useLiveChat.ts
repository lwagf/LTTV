import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { StreamRef } from "../nav/navStack";
import { createBatcher } from "./batcher";
import { type Bubble, type BubbleInput, type ChatStore, createChatStore } from "./chatStore";
import { AnonymousChat } from "./irc";
import { type EmoteMap, loadThirdPartyEmotes } from "./thirdPartyEmotes";
import { tokenize } from "./tokenize";

interface ChatSettings {
  chatMaxMessages: number;
  chatFadeSeconds: number;
  animatedEmotes: boolean;
}

/** One chat store per player screen, sized and timed from settings. */
export function useChatStore(settings: ChatSettings): ChatStore {
  const store = useRef<ChatStore | null>(null);
  if (!store.current) {
    store.current = createChatStore(settings.chatMaxMessages, settings.chatFadeSeconds * 1000);
  }
  const s = store.current;
  useEffect(() => {
    s.setLimits(settings.chatMaxMessages, settings.chatFadeSeconds * 1000);
  }, [s, settings.chatMaxMessages, settings.chatFadeSeconds]);
  return s;
}

/** The store's bubbles, pruning expired ones every 500 ms while any are showing. */
export function useBubbles(store: ChatStore): Bubble[] {
  const bubbles = useSyncExternalStore(store.subscribe, store.visible);
  const showing = bubbles.length > 0;
  useEffect(() => {
    if (!showing) return;
    const t = setInterval(() => store.prune(), 500);
    return () => clearInterval(t);
  }, [store, showing]);
  return bubbles;
}

/** Anonymous read-only chat for a live stream, rendered into `store`. */
export function useLiveChat(ref: StreamRef | null, store: ChatStore, animatedEmotes: boolean) {
  const [chat] = useState(() => new AnonymousChat());
  const emotes = useRef<EmoteMap>(new Map());
  const animated = useRef(animatedEmotes);
  animated.current = animatedEmotes;

  useEffect(() => () => chat.close(), [chat]);

  useEffect(() => {
    // Busy chats arrive far faster than anyone can read; deliver a few batches per second.
    const batcher = createBatcher<BubbleInput>(
      (items) => {
        for (const item of items) store.add(item);
      },
      200,
      () => store.maxMessages(),
    );
    const offMessage = chat.onMessage((m) =>
      batcher.push({
        id: m.id,
        displayName: m.displayName,
        color: m.color,
        action: m.action,
        parts: tokenize(m, emotes.current, animated.current),
      }),
    );
    const offClear = chat.onClear(() => {
      batcher.clear();
      store.clear();
    });
    return () => {
      offMessage();
      offClear();
      batcher.clear();
    };
  }, [chat, store]);

  const login = ref?.kind === "live" ? ref.login : null;
  const userId = ref?.kind === "live" ? ref.userId : null;
  useEffect(() => {
    store.clear();
    emotes.current = new Map();
    if (!login || !userId) {
      chat.leave();
      return;
    }
    let cancelled = false;
    void loadThirdPartyEmotes(userId).then((map) => {
      if (!cancelled) emotes.current = map;
    });
    chat.join(login);
    return () => {
      cancelled = true;
    };
  }, [chat, store, login, userId]);
}
