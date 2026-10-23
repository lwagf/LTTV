import { afterEach, expect, test } from "bun:test";
import { cleanup, render, screen } from "@testing-library/react";
import { BUTTONS, HelpScreen } from "./HelpScreen";

afterEach(cleanup);

test("every button LTTV uses has a numbered marker on the remote and an entry in the list", () => {
  const { container } = render(<HelpScreen />);
  const used = BUTTONS.filter((b) => b.browsing || b.watching);
  const markers = [...container.querySelectorAll("svg [data-marker]")].map((m) => m.textContent);
  expect(markers).toEqual(used.map((_, i) => String(i + 1)));
  for (const b of used) expect(screen.getByText(b.name)).toBeTruthy();
});

test("explains what each button does while browsing and while watching", () => {
  render(<HelpScreen />);
  expect(screen.getByText("Chat on/off")).toBeTruthy();
  expect(screen.getByText(/press the same way again to switch/)).toBeTruthy();
  expect(screen.getByText(/hold to speed up/)).toBeTruthy();
});

test("buttons LTTV leaves to Fire TV are marked as such", () => {
  render(<HelpScreen />);
  expect(screen.getByText(/Home, Alexa and volume/)).toBeTruthy();
});

test("the guide takes focus when it opens, so the side rail folds away", async () => {
  const { getCurrentFocusKey } = await import("@noriginmedia/norigin-spatial-navigation");
  const { waitFor } = await import("@testing-library/react");
  render(<HelpScreen />);
  await waitFor(() => expect(getCurrentFocusKey()).toBe("help-guide"));
});
