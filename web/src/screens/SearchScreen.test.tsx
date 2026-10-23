import { afterEach, beforeEach, expect, test } from "bun:test";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { category } from "../../test/fixtures";
import { currentScreen, resetTo } from "../nav/navStack";
import type { Channel } from "../twitch/helix";
import { SearchView } from "./SearchScreen";

beforeEach(() => resetTo({ name: "search" }));
afterEach(cleanup);

const channel = (n: number, isLive: boolean): Channel => ({
  id: `c${n}`,
  login: `chan${n}`,
  displayName: `Chan${n}`,
  isLive,
  gameName: "Game",
});

function type(...keys: string[]) {
  for (const k of keys) fireEvent.click(screen.getByRole("button", { name: k }));
}

test("typing letters builds the query", () => {
  const seen: string[] = [];
  render(<SearchView results={undefined} onQuery={(q) => seen.push(q)} />);
  type("l", "i", "r");
  expect(screen.getByTestId("search-query").textContent).toBe("lir");
  expect(seen[seen.length - 1]).toBe("lir");
});

test("backspace and clear", () => {
  render(<SearchView results={undefined} onQuery={() => {}} />);
  type("a", "b", "c", "⌫");
  expect(screen.getByTestId("search-query").textContent).toBe("ab");
  type("Clear");
  expect(screen.getByTestId("search-query").textContent).toBe("");
});

test("asks for at least 2 letters", () => {
  render(<SearchView results={undefined} onQuery={() => {}} />);
  type("a");
  expect(screen.getByText("Type at least 2 letters")).toBeTruthy();
});

test("lists live channels first, and selecting one opens its channel page", () => {
  render(
    <SearchView
      results={{ channels: [channel(1, false), channel(2, true)], categories: [category(5)] }}
      onQuery={() => {}}
      initialQuery="chan"
    />,
  );
  const names = screen.getAllByTestId("channel-result").map((el) => el.textContent);
  expect(names[0]).toContain("Chan2");
  fireEvent.click(screen.getByText("Chan1"));
  expect(currentScreen()).toEqual({
    name: "channel",
    login: "chan1",
    userId: "c1",
    displayName: "Chan1",
  });
});

test("selecting a category result opens the category", () => {
  render(
    <SearchView
      results={{ channels: [], categories: [category(5)] }}
      onQuery={() => {}}
      initialQuery="game"
    />,
  );
  fireEvent.click(screen.getByText("Game 5"));
  expect(currentScreen()).toEqual({ name: "category", category: category(5) });
});

test("no results says so", () => {
  render(<SearchView results={{ channels: [], categories: [] }} onQuery={() => {}} />);
  type("z", "z");
  expect(screen.getByText("No results")).toBeTruthy();
});

test("presses that arrive before a re-render are not lost", () => {
  const seen: string[] = [];
  render(<SearchView results={undefined} onQuery={(q) => seen.push(q)} />);
  const key = (k: string) => screen.getByRole("button", { name: k });
  act(() => {
    key("x").click();
    key("q").click();
    key("c").click();
  });
  expect(screen.getByTestId("search-query").textContent).toBe("xqc");
  expect(seen[seen.length - 1]).toBe("xqc");
});

test("a failing search says so instead of Searching forever", () => {
  render(<SearchView results={undefined} onQuery={() => {}} initialQuery="xqc" failed />);
  expect(screen.getByText("Couldn't reach Twitch. Try again in a moment.")).toBeTruthy();
});
