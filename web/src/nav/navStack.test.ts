import { beforeEach, expect, test } from "bun:test";
import { currentScreen, pop, push, replace, resetTo, stackDepth } from "./navStack";

beforeEach(() => resetTo({ name: "home" }));

test("push, pop, replace and resetTo", () => {
  push({ name: "browse" });
  push({ name: "search" });
  expect(currentScreen()).toEqual({ name: "search" });
  replace({ name: "settings" });
  expect(currentScreen()).toEqual({ name: "settings" });
  expect(stackDepth()).toBe(3);
  expect(pop()).toBe(true);
  expect(currentScreen()).toEqual({ name: "browse" });
  resetTo({ name: "search" });
  expect(stackDepth()).toBe(1);
});

test("pop at root returns false and keeps the root", () => {
  expect(pop()).toBe(false);
  expect(currentScreen()).toEqual({ name: "home" });
});
