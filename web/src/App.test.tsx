import { afterEach, beforeEach, expect, test } from "bun:test";
import { act, cleanup, render, screen } from "@testing-library/react";
import { App } from "./App";
import { dispatchRemoteKey } from "./input/keys";
import { setNative } from "./native/bridge";
import { FakeNative } from "./native/fakeNative";
import { currentScreen, push, resetTo } from "./nav/navStack";
import { tokenStore } from "./twitch/tokenStore";

let native: FakeNative;
beforeEach(() => {
  localStorage.clear();
  native = new FakeNative();
  native.respond("http.request", () => new Promise(() => {}));
  setNative(native);
  resetTo({ name: "settings" });
});
afterEach(() => {
  cleanup();
  setNative(null);
});

const tokens = {
  accessToken: "a",
  refreshToken: "r",
  expiresAt: Date.now() + 3_600_000,
  userId: "1",
  login: "logan",
};

test("renders app root", () => {
  render(<App />);
  expect(screen.getByTestId("app-root")).toBeTruthy();
});

test("shows login when signed out and the side rail when signed in", () => {
  render(<App />);
  expect(screen.getByText(/Getting a login code/)).toBeTruthy();
  act(() => tokenStore.save(tokens));
  expect(screen.getByTestId("side-rail")).toBeTruthy();
});

test("back pops screens, goes Home from a top-level section, and exits only from Home", () => {
  tokenStore.save(tokens);
  push({ name: "search" });
  render(<App />);
  const back = () =>
    act(() => {
      dispatchRemoteKey("back");
    });
  back();
  expect(currentScreen()).toEqual({ name: "settings" });
  back();
  expect(currentScreen()).toEqual({ name: "home" });
  expect(native.callsOf("app.exit")).toHaveLength(0);
  back();
  expect(native.callsOf("app.exit")).toHaveLength(1);
});

test("revoked auth returns to login", () => {
  tokenStore.save(tokens);
  render(<App />);
  act(() => tokenStore.clear());
  expect(screen.getByText(/Getting a login code/)).toBeTruthy();
});
