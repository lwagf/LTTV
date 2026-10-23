import { push } from "../nav/navStack";
import type { Category } from "../twitch/helix";
import { type Section, useInfiniteSection } from "../twitch/queries";
import { isFailing, LOAD_FAILED } from "../twitch/queryClient";
import { Grid } from "../ui/Grid";
import { Tile } from "../ui/Tile";
import { emptyText, SECTION_TITLES, SORTS, sectionTiles } from "./categorySections";

const COLUMNS = 4;

interface SectionViewProps {
  category: Category;
  section: Section;
  sort: string;
  items: unknown[] | undefined;
  hasMore: boolean;
  onMore(): void;
  failed?: boolean;
}

/** "See all": one category section in one sort, as a grid that loads more as you go down. */
export function SectionView({
  category,
  section,
  sort,
  items,
  hasMore,
  onMore,
  failed,
}: SectionViewProps) {
  const tiles = sectionTiles(section, items ?? []);
  const context = tiles.map((t) => t.ref);
  const sortLabel = SORTS[section].find((o) => o.value === sort)?.label ?? "";
  return (
    <main className="screen">
      <h1 className="screen-title">
        {category.name} · {SECTION_TITLES[section]} · {sortLabel}
      </h1>
      <Grid
        focusKey="section"
        columns={COLUMNS}
        count={tiles.length}
        empty={items ? emptyText(section, category.name) : failed ? LOAD_FAILED : "Loading…"}
      >
        {(onFocused) =>
          tiles.map((t, i) => (
            <Tile
              key={t.id}
              focusKey={`section-${i}`}
              image={t.image}
              title={t.title}
              subtitle={t.subtitle}
              badge={t.badge}
              aspect="16:9"
              onFocused={(el) => {
                onFocused(el);
                // Within the last two rows: fetch the next page.
                if (hasMore && i >= tiles.length - 2 * COLUMNS) onMore();
              }}
              onSelect={() => push({ name: "player", ref: context[i], context })}
            />
          ))
        }
      </Grid>
    </main>
  );
}

export function SectionScreen(p: { category: Category; section: Section; sort: string }) {
  const q = useInfiniteSection(p.category.id, p.section, p.sort);
  return (
    <SectionView
      {...p}
      items={q.data?.pages.flatMap((page) => page.items)}
      hasMore={Boolean(q.hasNextPage)}
      onMore={() => {
        if (!q.isFetchingNextPage) void q.fetchNextPage();
      }}
      failed={isFailing(q)}
    />
  );
}
