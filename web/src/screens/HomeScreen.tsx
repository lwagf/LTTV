import {
  doesFocusableExist,
  FocusContext,
  setFocus,
  useFocusable,
} from "@noriginmedia/norigin-spatial-navigation";
import { useEffect, useRef } from "react";
import { push } from "../nav/navStack";
import { liveRef, vodRef } from "../nav/refs";
import type { Category, Stream, Video } from "../twitch/helix";
import { withoutLiveBroadcasts } from "../twitch/liveBroadcasts";
import { useFollowedStreams, useRecentFollowedVideos, useTopCategories } from "../twitch/queries";
import { isFailing, LOAD_FAILED } from "../twitch/queryClient";
import { formatViewers } from "../ui/format";
import { Row } from "../ui/Row";
import { useRowsScroll } from "../ui/scroll";
import { Tile } from "../ui/Tile";
import "./HomeScreen.css";

interface HomeViewProps {
  live: Stream[] | undefined;
  videos: Video[] | undefined;
  categories: Category[] | undefined;
  failed?: boolean;
}

const MAX_TILES = 20;

/** Remembered across visits so Back from the player lands on the tile you left. */
let lastFocusKey: string | null = null;

/** Test hook: start without a remembered tile. */
export function forgetHomeFocus() {
  lastFocusKey = null;
}

export function HomeView({ live, videos, categories, failed = false }: HomeViewProps) {
  const loading = failed ? LOAD_FAILED : "Loading…";
  const { ref, focusKey } = useFocusable({ focusKey: "home", trackChildren: true });
  const { content, onFocusRow, style: rowsStyle } = useRowsScroll();
  const focusedOnce = useRef(false);
  // The tile remembered from the previous visit, captured on mount (not focus events since).
  const remembered = useRef(lastFocusKey);

  // Focus the first tile once one exists, waiting for the live row so focus starts at the top.
  useEffect(() => {
    if (focusedOnce.current || !live) return;
    let target: string | null = null;
    if (live.length) target = `home-live-${live[0].userId}`;
    else if (videos?.length) target = `home-vod-${videos[0].id}`;
    else if (categories?.length) target = `home-cat-${categories[0].id}`;
    if (!target) return;
    const first = target;
    // Next tick, once tiles have registered; the remembered tile may be gone (channel offline).
    const t = setTimeout(() => {
      const prev = remembered.current;
      const key = prev && doesFocusableExist(prev) ? prev : first;
      if (!doesFocusableExist(key)) return;
      focusedOnce.current = true;
      setFocus(key);
    }, 0);
    return () => clearTimeout(t);
  }, [live, videos, categories]);

  const remember = (key: string) => {
    lastFocusKey = key;
  };

  const liveRefs = (live ?? []).map(liveRef);
  return (
    <FocusContext.Provider value={focusKey}>
      <main ref={ref} className="screen home">
        <div ref={content} className="home-rows" style={rowsStyle}>
          <Row
            title="Live now · Following"
            focusKey="home-live"
            empty={live ? "Nobody you follow is live" : loading}
            onFocusRow={onFocusRow}
          >
            {(onFocused) =>
              (live ?? []).slice(0, MAX_TILES).map((s, i) => (
                <Tile
                  key={s.userId}
                  focusKey={`home-live-${s.userId}`}
                  image={s.thumbnailUrl}
                  title={s.userName}
                  subtitle={`${s.gameName} · ${formatViewers(s.viewerCount)}`}
                  badge="LIVE"
                  aspect="16:9"
                  onFocused={(el, key) => {
                    remember(key);
                    onFocused(el);
                  }}
                  onSelect={() => push({ name: "player", ref: liveRefs[i], context: liveRefs })}
                />
              ))
            }
          </Row>
          <Row
            title="Recent videos · Following"
            focusKey="home-vod"
            empty={videos ? "No recent videos" : loading}
            onFocusRow={onFocusRow}
          >
            {(onFocused) =>
              (videos ?? []).slice(0, MAX_TILES).map((v) => (
                <Tile
                  key={v.id}
                  focusKey={`home-vod-${v.id}`}
                  image={v.thumbnailUrl}
                  title={v.userName}
                  subtitle={v.title}
                  aspect="16:9"
                  onFocused={(el, key) => {
                    remember(key);
                    onFocused(el);
                  }}
                  onSelect={() =>
                    push({ name: "player", ref: vodRef(v), context: (videos ?? []).map(vodRef) })
                  }
                />
              ))
            }
          </Row>
          <Row
            title="Top categories"
            focusKey="home-cat"
            empty={categories ? "No categories" : loading}
            onFocusRow={onFocusRow}
          >
            {(onFocused) =>
              (categories ?? []).slice(0, MAX_TILES).map((c) => (
                <Tile
                  key={c.id}
                  focusKey={`home-cat-${c.id}`}
                  image={c.boxArtUrl}
                  title={c.name}
                  subtitle=""
                  aspect="3:4"
                  onFocused={(el, key) => {
                    remember(key);
                    onFocused(el);
                  }}
                  onSelect={() => push({ name: "category", category: c })}
                />
              ))
            }
          </Row>
        </div>
      </main>
    </FocusContext.Provider>
  );
}

export function HomeScreen() {
  const live = useFollowedStreams();
  const videos = useRecentFollowedVideos();
  const categories = useTopCategories();
  return (
    <HomeView
      live={live.data}
      videos={videos.data && withoutLiveBroadcasts(videos.data, live.data ?? [])}
      categories={categories.data}
      failed={isFailing(live) || isFailing(videos) || isFailing(categories)}
    />
  );
}
