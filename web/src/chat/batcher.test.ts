import { expect, test } from "bun:test";
import { createBatcher } from "./batcher";

function manualTimer() {
  let pending: (() => void) | null = null;
  return {
    schedule: (fn: () => void) => {
      pending = fn;
    },
    fire: () => {
      const fn = pending;
      pending = null;
      fn?.();
    },
    get armed() {
      return pending !== null;
    },
  };
}

test("a burst inside one interval flushes once, keeping only the newest items", () => {
  const timer = manualTimer();
  const flushed: number[][] = [];
  const b = createBatcher<number>(
    (items) => flushed.push(items),
    200,
    () => 3,
    timer.schedule,
  );
  for (let i = 0; i < 100; i++) b.push(i);
  expect(flushed).toEqual([]);
  timer.fire();
  expect(flushed).toEqual([[97, 98, 99]]);
});

test("items after a flush start a new batch; idle means no timer", () => {
  const timer = manualTimer();
  const flushed: number[][] = [];
  const b = createBatcher<number>(
    (items) => flushed.push(items),
    200,
    () => 5,
    timer.schedule,
  );
  expect(timer.armed).toBe(false);
  b.push(1);
  timer.fire();
  b.push(2);
  timer.fire();
  expect(flushed).toEqual([[1], [2]]);
  expect(timer.armed).toBe(false);
});

test("clear drops anything pending", () => {
  const timer = manualTimer();
  const flushed: number[][] = [];
  const b = createBatcher<number>(
    (items) => flushed.push(items),
    200,
    () => 5,
    timer.schedule,
  );
  b.push(1);
  b.clear();
  timer.fire();
  expect(flushed).toEqual([]);
});
