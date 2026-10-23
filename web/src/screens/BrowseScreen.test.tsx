import { afterEach, beforeEach, expect, test } from "bun:test";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { category } from "../../test/fixtures";
import { currentScreen, resetTo } from "../nav/navStack";
import { BrowseView } from "./BrowseScreen";

beforeEach(() => resetTo({ name: "browse" }));
afterEach(cleanup);

test("browse renders category tiles and opens a category", () => {
  render(<BrowseView categories={[category(1), category(2)]} />);
  expect(screen.getByText("Game 1")).toBeTruthy();
  fireEvent.click(screen.getByText("Game 2"));
  expect(currentScreen()).toEqual({ name: "category", category: category(2) });
});

test("browse says when Twitch can't be reached", () => {
  render(<BrowseView categories={undefined} failed />);
  expect(screen.getByText("Couldn't reach Twitch. Try again in a moment.")).toBeTruthy();
});
