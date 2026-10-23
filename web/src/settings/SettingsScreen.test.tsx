import { afterEach, beforeEach, expect, test } from "bun:test";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { setNative } from "../native/bridge";
import { FakeNative } from "../native/fakeNative";
import { tokenStore } from "../twitch/tokenStore";
import { SettingsScreen } from "./SettingsScreen";
import { getSettings, updateSettings } from "./settings";

beforeEach(() => {
  localStorage.clear();
  const native = new FakeNative();
  native.respond("app.info", () => ({
    versionName: "0.1.0",
    webViewUserAgent: "Mozilla/5.0 (Linux; Android 9; AFTSSS) Chrome/138.0.7204.244 Mobile",
  }));
  setNative(native);
});
afterEach(() => {
  cleanup();
  setNative(null);
});

const row = (label: string) => screen.getByText(label).closest("button") as HTMLButtonElement;

test("select on default quality cycles Auto → 1080p → 720p …", () => {
  render(<SettingsScreen />);
  fireEvent.click(row("Default quality"));
  expect(getSettings().defaultQuality).toBe(1080);
  fireEvent.click(row("Default quality"));
  expect(getSettings().defaultQuality).toBe(720);
  expect(row("Default quality").textContent).toContain("720p");
});

test("chat fade goes up a second at a time and stops at 15", () => {
  updateSettings({ chatFadeSeconds: 14 });
  render(<SettingsScreen />);
  fireEvent.click(row("Chat fade"));
  fireEvent.click(row("Chat fade"));
  expect(getSettings().chatFadeSeconds).toBe(15);
});

test("toggles flip booleans", () => {
  render(<SettingsScreen />);
  fireEvent.click(row("Animated emotes"));
  expect(getSettings().animatedEmotes).toBe(false);
});

test("log out clears tokens", () => {
  tokenStore.save({ accessToken: "a", refreshToken: "r", expiresAt: 0, userId: "1", login: "l" });
  render(<SettingsScreen />);
  fireEvent.click(row("Log out"));
  expect(tokenStore.load()).toBeNull();
});

test("shows the app and WebView versions", async () => {
  render(<SettingsScreen />);
  expect(screen.getByText(/0\.0\.0-test/)).toBeTruthy();
  await waitFor(() => expect(screen.getByText(/Chromium 138/)).toBeTruthy());
});

test("the clips auto-advance row toggles it", () => {
  render(<SettingsScreen />);
  fireEvent.click(row("Clips auto-advance"));
  expect(getSettings().clipsAutoAdvance).toBe(false);
});
