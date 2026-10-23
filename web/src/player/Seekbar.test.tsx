import { afterEach, expect, test } from "bun:test";
import { cleanup, render, screen } from "@testing-library/react";
import { formatClock, Seekbar } from "./Seekbar";

afterEach(cleanup);

const width = (c: HTMLElement, cls: string) => (c.querySelector(cls) as HTMLElement).style.width;
const fill = (c: HTMLElement) => width(c, ".seekbar-fill");

test("within 5 s of live reads LIVE with a full bar", () => {
  const { container } = render(
    <Seekbar isLive positionMs={236000} durationMs={240000} behindLiveMs={4000} />,
  );
  expect(screen.getByText("LIVE")).toBeTruthy();
  expect(fill(container)).toBe("100%");
});

test("live always spans the full 4-minute rewind allowance", () => {
  // Watching for 60 s, currently 30 s behind: playhead at 1 - 30/240.
  const { container } = render(
    <Seekbar isLive positionMs={30000} durationMs={60000} behindLiveMs={30000} />,
  );
  expect(screen.getByText("−0:30")).toBeTruthy();
  expect(fill(container)).toBe("88%");
  // Only the last 60 s (25%) can be reached so far; the other 75% is shaded.
  expect(width(container, ".seekbar-unavailable")).toBe("75%");
});

test("VOD shows position and duration", () => {
  render(<Seekbar isLive={false} positionMs={3723000} durationMs={11400000} behindLiveMs={null} />);
  expect(screen.getByText("1:02:03 / 3:10:00")).toBeTruthy();
});

test("formatClock pads minutes and seconds", () => {
  expect(formatClock(5000)).toBe("0:05");
  expect(formatClock(605000)).toBe("10:05");
  expect(formatClock(3723000)).toBe("1:02:03");
});

test("live span covers the whole broadcast and the label shows −h:mm:ss", () => {
  const { container } = render(
    <Seekbar
      isLive
      positionMs={0}
      durationMs={240000}
      behindLiveMs={3600_000}
      spanMs={4 * 3600_000}
      hasVod
    />,
  );
  expect(screen.getByText("−1:00:00")).toBeTruthy();
  expect(fill(container)).toBe("75%");
  expect(container.querySelector(".seekbar-unavailable")).toBeNull();
});

test("a scrub preview moves the playhead before any seek", () => {
  const { container } = render(
    <Seekbar
      isLive
      positionMs={0}
      durationMs={240000}
      behindLiveMs={2000}
      spanMs={4 * 3600_000}
      hasVod
      scrubBehindMs={2 * 3600_000}
    />,
  );
  expect(screen.getByText("−2:00:00")).toBeTruthy();
  expect(fill(container)).toBe("50%");
});

test("a VOD scrub preview shows the target position", () => {
  render(
    <Seekbar
      isLive={false}
      positionMs={60_000}
      durationMs={3600_000}
      behindLiveMs={null}
      scrubPositionMs={600_000}
    />,
  );
  expect(screen.getByText("10:00 / 1:00:00")).toBeTruthy();
});
