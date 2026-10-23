import { afterEach, beforeEach, expect, test } from "bun:test";
import { getCurrentFocusKey } from "@noriginmedia/norigin-spatial-navigation";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { stream, video } from "../../test/fixtures";
import { currentScreen, resetTo } from "../nav/navStack";
import { ChannelView } from "./ChannelScreen";

beforeEach(() => resetTo({ name: "search" }));
afterEach(cleanup);

test("a live channel shows Watch live, which opens just that stream", () => {
  render(<ChannelView displayName="User1" stream={stream(1)} videos={[]} />);
  expect(screen.getByText("LIVE · Just Chatting")).toBeTruthy();
  fireEvent.click(screen.getByText("Watch live"));
  const s = currentScreen();
  expect(s.name).toBe("player");
  if (s.name !== "player") return;
  expect(s.ref).toMatchObject({ kind: "live", login: "user1" });
  expect(s.context).toHaveLength(1);
});

test("an offline channel hides Watch live", () => {
  render(<ChannelView displayName="User1" stream={null} videos={[video(1)]} />);
  expect(screen.queryByText("Watch live")).toBeNull();
});

test("selecting a video opens it in the player", () => {
  render(<ChannelView displayName="User1" stream={null} videos={[video(4)]} />);
  fireEvent.click(screen.getByText("Video 4"));
  const s = currentScreen();
  expect(s.name).toBe("player");
  if (s.name !== "player") return;
  expect(s.ref).toMatchObject({ kind: "vod", videoId: "v4" });
});

test("offline with no videos says so", () => {
  render(<ChannelView displayName="User1" stream={null} videos={[]} />);
  expect(screen.getByText("No recent videos")).toBeTruthy();
});

test("a failing load says so", () => {
  render(<ChannelView displayName="User1" stream={undefined} videos={undefined} failed />);
  expect(screen.getByText("Couldn't reach Twitch. Try again in a moment.")).toBeTruthy();
});

test("offline with no videos puts focus on the side rail so the remote still works", async () => {
  render(<ChannelView displayName="User1" stream={null} videos={[]} />);
  await waitFor(() => expect(getCurrentFocusKey()).toBe("rail-search"));
});

test("selecting a video passes the channel's videos as context", () => {
  render(<ChannelView displayName="User1" stream={null} videos={[video(4), video(5)]} />);
  fireEvent.click(screen.getByText("Video 5"));
  const s = currentScreen();
  expect(s.name).toBe("player");
  if (s.name !== "player") return;
  expect(s.context.map((r) => (r.kind === "vod" ? r.videoId : ""))).toEqual(["v4", "v5"]);
});
