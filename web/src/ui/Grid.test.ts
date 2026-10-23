import { expect, test } from "bun:test";
import { gridOffset } from "./Grid";

// Viewport 540 tall with 16 px padding top and bottom: 508 px of grid are visible.

test("a tile below the visible area scrolls up until its caption clears the padding", () => {
  // Tile (art + caption) spans 400–600 in the grid.
  expect(gridOffset(0, { top: 400, bottom: 600 }, 540, 16, 16)).toBe(600 + 8 - 508);
});

test("a fully visible tile doesn't scroll", () => {
  expect(gridOffset(0, { top: 0, bottom: 300 }, 540, 16, 16)).toBe(0);
});

test("a tile above the visible area scrolls back down to it", () => {
  expect(gridOffset(400, { top: 200, bottom: 400 }, 540, 16, 16)).toBe(200);
});
