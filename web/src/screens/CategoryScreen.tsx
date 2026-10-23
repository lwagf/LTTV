import {
  doesFocusableExist,
  FocusContext,
  setFocus,
  useFocusable,
} from "@noriginmedia/norigin-spatial-navigation";
import { useEffect, useRef, useState } from "react";
import { push } from "../nav/navStack";
import type { Category } from "../twitch/helix";
import { type Section, useCategorySection } from "../twitch/queries";
import { isFailing, LOAD_FAILED } from "../twitch/queryClient";
import { Row } from "../ui/Row";
import { SortButton } from "../ui/SortButton";
import { useRowsScroll } from "../ui/scroll";
import { Tile } from "../ui/Tile";
import { DEFAULT_SORT, emptyText, SECTION_TITLES, SORTS, sectionTiles } from "./categorySections";
import "./CategoryScreen.css";

const MAX_TILES = 20;
const ORDER: Section[] = ["live", "videos", "clips"];

interface SectionProps {
  items: unknown[] | undefined;
  sort: string;
  onSort(v: string): void;
  failed?: boolean;
}

interface CategoryViewProps {
  category: Category;
  live: SectionProps;
  videos: SectionProps;
  clips: SectionProps;
}

export function SeeAll({
  focusKey,
  onSelect,
  onFocused,
}: {
  focusKey: string;
  onSelect(): void;
  /** Like a tile: lets the row slide this into view. */
  onFocused?(el: HTMLElement): void;
}) {
  const { ref, focused } = useFocusable<object, HTMLButtonElement>({
    focusKey,
    onEnterPress: onSelect,
    onFocus: () => {
      if (ref.current) onFocused?.(ref.current);
    },
  });
  return (
    <button
      ref={ref}
      type="button"
      className={`see-all${focused ? " focused" : ""}`}
      onClick={onSelect}
    >
      See all
    </button>
  );
}

export function CategoryView(props: CategoryViewProps) {
  const { category } = props;
  const { ref, focusKey } = useFocusable({ focusKey: "category", trackChildren: true });
  const { content, onFocusRow, style } = useRowsScroll();

  // First tile of the live row once it has loaded; else that row's sort button.
  const focused = useRef(false);
  const liveFirst = props.live.items?.[0] as { userId?: string } | undefined;
  useEffect(() => {
    if (focused.current || props.live.items === undefined) return;
    const key = liveFirst?.userId ? `cat-live-${liveFirst.userId}` : "cat-live-sort";
    const t = setTimeout(() => {
      if (!doesFocusableExist(key)) return;
      focused.current = true;
      setFocus(key);
    }, 0);
    return () => clearTimeout(t);
  }, [props.live.items, liveFirst?.userId]);

  return (
    <FocusContext.Provider value={focusKey}>
      <main ref={ref} className="screen category">
        <h1 className="screen-title">{category.name}</h1>
        <div ref={content} className="category-rows" style={style}>
          {ORDER.map((section) => {
            const s = props[section];
            const tiles = sectionTiles(section, s.items ?? []);
            const context = tiles.map((t) => t.ref);
            const status = s.items
              ? tiles.length
                ? null
                : emptyText(section, category.name)
              : s.failed
                ? LOAD_FAILED
                : "Loading…";
            return (
              <Row
                key={section}
                title={SECTION_TITLES[section]}
                focusKey={`cat-${section}`}
                onFocusRow={onFocusRow}
                action={
                  <SortButton
                    focusKey={`cat-${section}-sort`}
                    options={SORTS[section]}
                    value={s.sort}
                    onChange={s.onSort}
                  />
                }
              >
                {(onFocused) => [
                  status ? (
                    <p key="status" className="category-status">
                      {status}
                    </p>
                  ) : null,
                  ...tiles
                    .slice(0, MAX_TILES)
                    .map((t, i) => (
                      <Tile
                        key={t.id}
                        focusKey={`cat-${section}-${t.id}`}
                        image={t.image}
                        title={t.title}
                        subtitle={t.subtitle}
                        badge={t.badge}
                        aspect="16:9"
                        onFocused={(el) => onFocused(el)}
                        onSelect={() => push({ name: "player", ref: context[i], context })}
                      />
                    )),
                  tiles.length ? (
                    <SeeAll
                      key="all"
                      focusKey={`cat-${section}-all`}
                      onFocused={onFocused}
                      onSelect={() => push({ name: "section", category, section, sort: s.sort })}
                    />
                  ) : null,
                ]}
              </Row>
            );
          })}
        </div>
      </main>
    </FocusContext.Provider>
  );
}

/** Sort choices persist for the session (across categories). */
const sessionSorts: Record<Section, string> = { ...DEFAULT_SORT };

function useSection(category: Category, section: Section) {
  const [sort, setSort] = useState(sessionSorts[section]);
  const q = useCategorySection(category.id, section, sort);
  return {
    items: q.data?.items,
    sort,
    failed: isFailing(q),
    onSort: (v: string) => {
      sessionSorts[section] = v;
      setSort(v);
    },
  };
}

export function CategoryScreen({ category }: { category: Category }) {
  const live = useSection(category, "live");
  const videos = useSection(category, "videos");
  const clips = useSection(category, "clips");
  return <CategoryView category={category} live={live} videos={videos} clips={clips} />;
}
