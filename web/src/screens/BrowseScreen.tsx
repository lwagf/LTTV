import { push } from "../nav/navStack";
import type { Category } from "../twitch/helix";
import { useTopCategories } from "../twitch/queries";
import { isFailing, LOAD_FAILED } from "../twitch/queryClient";
import { Grid } from "../ui/Grid";
import { Tile } from "../ui/Tile";

export function BrowseView({
  categories,
  failed = false,
}: {
  categories: Category[] | undefined;
  failed?: boolean;
}) {
  const list = categories ?? [];
  return (
    <main className="screen">
      <h1 className="screen-title">Browse</h1>
      <Grid
        focusKey="browse"
        columns={6}
        count={list.length}
        empty={categories ? "No categories" : failed ? LOAD_FAILED : "Loading…"}
      >
        {(onFocused) =>
          list.map((c, i) => (
            <Tile
              key={c.id}
              focusKey={`browse-${i}`}
              image={c.boxArtUrl}
              title={c.name}
              subtitle=""
              aspect="3:4"
              onFocused={onFocused}
              onSelect={() => push({ name: "category", category: c })}
            />
          ))
        }
      </Grid>
    </main>
  );
}

export function BrowseScreen() {
  const q = useTopCategories();
  return <BrowseView categories={q.data} failed={isFailing(q)} />;
}
