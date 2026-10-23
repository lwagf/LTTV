import { afterEach, beforeEach, expect, test } from "bun:test";
import { getCurrentFocusKey, setFocus } from "@noriginmedia/norigin-spatial-navigation";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { category, clip, stream, video } from "../../test/fixtures";
import { currentScreen, resetTo } from "../nav/navStack";
import { LOAD_FAILED } from "../twitch/queryClient";
import { CategoryView, SeeAll } from "./CategoryScreen";
import { SectionView } from "./SectionScreen";

beforeEach(() => resetTo({ name: "browse" }));
afterEach(cleanup);

const noop = () => {};
const sections = (over: Partial<Parameters<typeof CategoryView>[0]> = {}) => ({
  category: category(1),
  live: { items: [stream(3), stream(1)], sort: "viewers_desc", onSort: noop },
  videos: { items: [video(4)], sort: "time", onSort: noop },
  clips: { items: [clip(5), clip(6)], sort: "7d", onSort: noop },
  ...over,
});

test("renders Live channels, Videos and Clips rows in order, each with a sort button", () => {
  render(<CategoryView {...sections()} />);
  const titles = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
  expect(titles).toEqual(["Live channels", "Videos", "Clips"]);
  expect(screen.getByText("Sort: Most viewers")).toBeTruthy();
  expect(screen.getByText("Sort: Most recent")).toBeTruthy();
  expect(screen.getByText("Sort: 7 days")).toBeTruthy();
});

test("changing a sort calls onSort with the next option", () => {
  const seen: string[] = [];
  render(
    <CategoryView
      {...sections({ live: { items: [], sort: "viewers_desc", onSort: (v) => seen.push(v) } })}
    />,
  );
  fireEvent.click(screen.getByText("Sort: Most viewers"));
  expect(seen).toEqual(["viewers_asc"]);
});

test("See all opens the section with the row's current sort", () => {
  render(
    <CategoryView {...sections({ clips: { items: [clip(5)], sort: "30d", onSort: noop } })} />,
  );
  fireEvent.click(screen.getAllByText("See all")[2]);
  expect(currentScreen()).toEqual({
    name: "section",
    category: category(1),
    section: "clips",
    sort: "30d",
  });
});

test("selecting a clip opens the player with the clip row as context", () => {
  render(<CategoryView {...sections()} />);
  fireEvent.click(screen.getByText("Clip 6"));
  const s = currentScreen();
  expect(s.name).toBe("player");
  if (s.name !== "player") return;
  expect(s.ref).toMatchObject({ kind: "clip", slug: "Slug6" });
  expect(s.context.map((r) => (r.kind === "clip" ? r.slug : ""))).toEqual(["Slug5", "Slug6"]);
});

test("selecting a live channel keeps that row's sort order as context", () => {
  render(<CategoryView {...sections()} />);
  fireEvent.click(screen.getByText("User1"));
  const s = currentScreen();
  if (s.name !== "player") throw new Error("expected player");
  expect(s.context.map((r) => (r.kind === "live" ? r.login : ""))).toEqual(["user3", "user1"]);
});

test("a failed row says Twitch can't be reached", () => {
  render(
    <CategoryView
      {...sections({ videos: { items: undefined, sort: "time", onSort: noop, failed: true } })}
    />,
  );
  expect(screen.getByText(LOAD_FAILED)).toBeTruthy();
});

test("an empty row still shows its sort button", () => {
  render(<CategoryView {...sections({ live: { items: [], sort: "recent", onSort: noop } })} />);
  expect(screen.getByText("Sort: Recently started")).toBeTruthy();
  expect(screen.getByText("Nobody is live in Game 1 right now")).toBeTruthy();
});

test("focus starts on the first live channel", async () => {
  render(<CategoryView {...sections()} />);
  await waitFor(() => expect(getCurrentFocusKey()).toBe("cat-live-u3"));
});

test("the See all grid loads the next page when focus nears the end", async () => {
  let more = 0;
  // 16 items in 4 columns: the first tile is far from the end; tile 12 is in the last two rows.
  const items = Array.from({ length: 16 }, (_, n) => clip(n + 1));
  render(
    <SectionView
      category={category(1)}
      section="clips"
      sort="7d"
      items={items}
      hasMore
      onMore={() => more++}
    />,
  );
  await waitFor(() => expect(getCurrentFocusKey()).toBe("section-0"));
  expect(more).toBe(0);
  setFocus("section-12");
  await waitFor(() => expect(more).toBeGreaterThan(0));
});

test("a focused See all tile keeps itself in view like a normal tile", async () => {
  const seen: HTMLElement[] = [];
  render(<SeeAll focusKey="test-all" onSelect={() => {}} onFocused={(el) => seen.push(el)} />);
  setFocus("test-all");
  await waitFor(() => expect(seen).toHaveLength(1));
  expect(seen[0].textContent).toBe("See all");
});
