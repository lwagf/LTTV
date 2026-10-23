import { afterEach, beforeEach, expect, test } from "bun:test";
import { getCurrentFocusKey } from "@noriginmedia/norigin-spatial-navigation";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { category, stream, video } from "../../test/fixtures";
import { currentScreen, resetTo } from "../nav/navStack";
import { forgetHomeFocus, HomeView } from "./HomeScreen";

beforeEach(() => {
  resetTo({ name: "home" });
  forgetHomeFocus();
});
afterEach(cleanup);

const data = {
  live: [stream(2), stream(1)],
  videos: [video(9)],
  categories: [category(1), category(2)],
};

test("renders the three rows in order", () => {
  render(<HomeView {...data} />);
  const titles = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
  expect(titles).toEqual(["Live now · Following", "Recent videos · Following", "Top categories"]);
});

test("first live tile has initial focus", async () => {
  render(<HomeView {...data} />);
  await waitFor(() => expect(getCurrentFocusKey()).toBe("home-live-u2"));
});

test("nobody live shows a message and focus starts on the next row", async () => {
  render(<HomeView {...data} live={[]} />);
  expect(screen.getByText("Nobody you follow is live")).toBeTruthy();
  await waitFor(() => expect(getCurrentFocusKey()).toBe("home-vod-v9"));
});

test("selecting a live tile opens the player with all followed live channels as context", () => {
  render(<HomeView {...data} />);
  fireEvent.click(screen.getByText("User1"));
  const s = currentScreen();
  expect(s.name).toBe("player");
  if (s.name !== "player") return;
  expect(s.ref).toMatchObject({ kind: "live", login: "user1" });
  expect(s.context.map((r) => (r.kind === "live" ? r.login : ""))).toEqual(["user2", "user1"]);
});

test("selecting a category opens it", () => {
  render(<HomeView {...data} />);
  fireEvent.click(screen.getByText("Game 2"));
  expect(currentScreen()).toEqual({ name: "category", category: category(2) });
});

test("live tile subtitle shows game and viewers", () => {
  render(<HomeView {...data} live={[stream(1, { viewerCount: 24100 })]} />);
  expect(screen.getByText("Just Chatting · 24.1k")).toBeTruthy();
});

test("scrolling stops once the last row reaches the bottom (no empty space below)", async () => {
  const { homeScroll } = await import("../ui/scroll");
  // Rows at 0, 400, 800; content 1100 tall; screen shows 700.
  expect(homeScroll(0, 1100, 700)).toBe(0);
  expect(homeScroll(400, 1100, 700)).toBe(400);
  expect(homeScroll(800, 1100, 700)).toBe(400);
  // Content shorter than the screen never scrolls.
  expect(homeScroll(400, 600, 700)).toBe(0);
});

test("the refresh re-sorting channels keeps focus on the same channel", async () => {
  const { rerender } = render(<HomeView {...data} />);
  await waitFor(() => expect(getCurrentFocusKey()).toBe("home-live-u2"));
  rerender(<HomeView {...data} live={[stream(1, { viewerCount: 99999 }), stream(2)]} />);
  await new Promise((r) => setTimeout(r, 20));
  expect(getCurrentFocusKey()).toBe("home-live-u2");
});

test("focus lands once any row has loaded, even if the first rows are empty or slow", async () => {
  const { rerender } = render(<HomeView live={[]} videos={undefined} categories={undefined} />);
  await new Promise((r) => setTimeout(r, 20));
  rerender(<HomeView live={[]} videos={undefined} categories={[category(1)]} />);
  await waitFor(() => expect(getCurrentFocusKey()).toBe("home-cat-c1"));
});

test("a failing load says so instead of Loading forever", () => {
  render(<HomeView live={undefined} videos={undefined} categories={undefined} failed />);
  expect(screen.getAllByText("Couldn't reach Twitch. Try again in a moment.")).toHaveLength(3);
});

test("the current broadcast of a live channel is left out of Recent videos", async () => {
  const { withoutLiveBroadcasts } = await import("../twitch/liveBroadcasts");
  const live = [stream(1, { startedAt: "2026-10-23T10:00:00Z" })];
  const current = { ...video(1), id: "now", createdAt: "2026-10-23T10:00:05Z" };
  const yesterday = { ...video(1), id: "old", createdAt: "2026-10-22T10:00:00Z" };
  const other = { ...video(2), id: "other", createdAt: "2026-10-23T10:00:05Z" };
  expect(withoutLiveBroadcasts([current, yesterday, other], live).map((v) => v.id)).toEqual([
    "old",
    "other",
  ]);
});

test("selecting a recent video passes the whole row as context", () => {
  render(<HomeView {...data} videos={[video(8), video(9)]} />);
  fireEvent.click(screen.getByText("Video 9"));
  const s = currentScreen();
  expect(s.name).toBe("player");
  if (s.name !== "player") return;
  expect(s.context.map((r) => (r.kind === "vod" ? r.videoId : ""))).toEqual(["v8", "v9"]);
});
