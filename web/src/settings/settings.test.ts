import { beforeEach, expect, test } from "bun:test";
import { DEFAULT_SETTINGS, getSettings, updateSettings } from "./settings";

beforeEach(() => localStorage.clear());

test("defaults when empty", () => {
  expect(getSettings()).toEqual(DEFAULT_SETTINGS);
  expect(DEFAULT_SETTINGS).toMatchObject({
    defaultQuality: "auto",
    chatFadeSeconds: 6,
    chatMaxMessages: 5,
    chatTextSize: "m",
    chatOnByDefault: true,
  });
});

test("merges partial stored over defaults", () => {
  localStorage.setItem("lttv.settings", JSON.stringify({ chatTextSize: "l" }));
  expect(getSettings()).toEqual({ ...DEFAULT_SETTINGS, chatTextSize: "l" });
});

test("update persists and clamps out-of-range values", () => {
  expect(updateSettings({ chatFadeSeconds: 99, chatMaxMessages: 0 })).toMatchObject({
    chatFadeSeconds: 15,
    chatMaxMessages: 2,
  });
  expect(getSettings().chatFadeSeconds).toBe(15);
});

test("corrupt storage gives defaults", () => {
  localStorage.setItem("lttv.settings", "{nope");
  expect(getSettings()).toEqual(DEFAULT_SETTINGS);
});

test("clips auto-advance is on by default", () => {
  expect(getSettings().clipsAutoAdvance).toBe(true);
});
