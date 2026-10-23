import { expect, test } from "bun:test";
import {
  commitsOnRelease,
  IDLE_SCRUB,
  scrubKeyUp,
  scrubPress,
  scrubRelease,
  scrubStepMs,
} from "./scrub";

const wide = { backMs: 10 * 3600_000, forwardMs: 10 * 3600_000 };

test("steps are 10 s, then 30 s, 60 s and 300 s as the hold continues", () => {
  expect(scrubStepMs(0)).toBe(10_000);
  expect(scrubStepMs(999)).toBe(10_000);
  expect(scrubStepMs(1000)).toBe(30_000);
  expect(scrubStepMs(2500)).toBe(60_000);
  expect(scrubStepMs(5000)).toBe(300_000);
});

test("a tap is one 10 s step", () => {
  const s = scrubPress(IDLE_SCRUB, -1, 1000, wide);
  expect(s).toMatchObject({ active: true, deltaMs: -10_000 });
  expect(scrubRelease(s)).toEqual({ scrub: IDLE_SCRUB, commitMs: -10_000 });
});

test("two hours back takes under 10 s of holding (repeats every 100 ms)", () => {
  let s = IDLE_SCRUB;
  let t = 0;
  while (s.deltaMs > -2 * 3600_000) {
    s = scrubPress(s, -1, t, wide);
    t += 100;
  }
  expect(t).toBeLessThan(10_000);
});

test("clamps at the broadcast start", () => {
  let s = IDLE_SCRUB;
  for (let t = 0; t < 8000; t += 100) s = scrubPress(s, -1, t, { backMs: 90_000, forwardMs: 0 });
  expect(s.deltaMs).toBe(-90_000);
});

test("forward clamps at live", () => {
  let s = IDLE_SCRUB;
  for (let t = 0; t < 3000; t += 100) s = scrubPress(s, 1, t, { backMs: 0, forwardMs: 45_000 });
  expect(s.deltaMs).toBe(45_000);
});

test("reversing direction restarts the slow steps from the current point", () => {
  let s = IDLE_SCRUB;
  for (let t = 0; t <= 3000; t += 100) s = scrubPress(s, -1, t, wide);
  const before = s.deltaMs;
  s = scrubPress(s, 1, 3100, wide);
  expect(s.deltaMs).toBe(before + 10_000);
});

test("separate taps add 10 s each, even when they come quickly after a long hold", () => {
  let s = IDLE_SCRUB;
  for (let t = 0; t <= 3000; t += 100) s = scrubPress(s, -1, t, wide); // long hold
  const afterHold = s.deltaMs;
  s = scrubKeyUp(s);
  s = scrubPress(s, -1, 3200, wide); // a fresh tap
  expect(s.deltaMs).toBe(afterHold - 10_000);
});

test("a long press commits on release; a quick tap waits for more taps", () => {
  const tap = scrubKeyUp(scrubPress(IDLE_SCRUB, -1, 0, wide));
  expect(commitsOnRelease(tap, 150)).toBe(false);
  let hold = IDLE_SCRUB;
  for (let t = 0; t <= 600; t += 100) hold = scrubPress(hold, -1, t, wide);
  expect(commitsOnRelease(scrubKeyUp(hold), 650)).toBe(true);
});
