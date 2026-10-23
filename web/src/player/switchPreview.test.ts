import { expect, test } from "bun:test";
import { previewPress } from "./switchPreview";

test("first press previews the next item without switching", () => {
  expect(previewPress(null, 2, 1, 5, 1000)).toEqual({
    preview: { index: 3, dir: 1, until: 4000 },
    switchTo: null,
  });
});

test("a second press in the same direction within 3 s switches", () => {
  const first = previewPress(null, 2, 1, 5, 1000).preview;
  expect(previewPress(first, 2, 1, 5, 2500)).toEqual({ preview: null, switchTo: 3 });
});

test("a second press after 3 s starts a new preview instead", () => {
  const first = previewPress(null, 2, 1, 5, 1000).preview;
  expect(previewPress(first, 2, 1, 5, 4500)).toEqual({
    preview: { index: 3, dir: 1, until: 7500 },
    switchTo: null,
  });
});

test("the opposite direction steps the preview back; reaching what's playing closes it", () => {
  const first = previewPress(null, 2, 1, 5, 1000).preview;
  expect(previewPress(first, 2, -1, 5, 1500)).toEqual({ preview: null, switchTo: null });
  // Opened two away (by pressing past it), stepping back lands on the nearer one.
  const far = { index: 4, dir: 1 as const, until: 4000 };
  expect(previewPress(far, 2, -1, 5, 1500)).toEqual({
    preview: { index: 3, dir: -1, until: 4500 },
    switchTo: null,
  });
});

test("nothing to preview past either end", () => {
  expect(previewPress(null, 4, 1, 5, 0)).toEqual({ preview: null, switchTo: null });
  expect(previewPress(null, 0, -1, 5, 0)).toEqual({ preview: null, switchTo: null });
});
