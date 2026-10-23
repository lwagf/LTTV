import { expect, test } from "bun:test";
import { nextOffset } from "./Row";

// Viewport 1000 wide, tiles 300 wide with 20 gaps: lefts 0, 320, 640, 960...

test("stays put while the focused tile is fully visible", () => {
  expect(nextOffset(0, { left: 320, right: 620 }, 1000)).toBe(0);
});

test("slides left just enough to reveal a tile past the right edge", () => {
  expect(nextOffset(0, { left: 960, right: 1260 }, 1000)).toBe(260);
});

test("slides back when focus moves to a tile hidden on the left", () => {
  expect(nextOffset(260, { left: 0, right: 300 }, 1000)).toBe(0);
});
