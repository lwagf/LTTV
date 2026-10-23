import { expect, test } from "bun:test";
import { createChatStore } from "./chatStore";

const msg = (n: number) => ({
  id: `m${n}`,
  displayName: `user${n}`,
  color: null,
  parts: [{ kind: "text" as const, text: `hello ${n}` }],
});

test("keeps at most maxMessages, dropping the oldest", () => {
  const store = createChatStore(3, 6000);
  for (let i = 1; i <= 5; i++) store.add(msg(i));
  expect(store.visible().map((b) => b.id)).toEqual(["m3", "m4", "m5"]);
});

test("1000 rapid adds leave maxMessages bubbles", () => {
  const store = createChatStore(5, 6000);
  for (let i = 0; i < 1000; i++) store.add(msg(i));
  expect(store.visible()).toHaveLength(5);
});

test("prune removes bubbles older than the fade time", () => {
  let now = 0;
  const store = createChatStore(5, 6000, () => now);
  store.add(msg(1));
  now = 4000;
  store.add(msg(2));
  now = 6500;
  store.prune();
  expect(store.visible().map((b) => b.id)).toEqual(["m2"]);
});

test("clear empties and notifies subscribers", () => {
  const store = createChatStore(5, 6000);
  let calls = 0;
  store.subscribe(() => calls++);
  store.add(msg(1));
  store.clear();
  expect(store.visible()).toEqual([]);
  expect(calls).toBe(2);
});

test("setLimits applies new max and fade immediately", () => {
  const store = createChatStore(5, 6000);
  for (let i = 1; i <= 5; i++) store.add(msg(i));
  store.setLimits(2, 3000);
  expect(store.visible().map((b) => b.id)).toEqual(["m4", "m5"]);
});
