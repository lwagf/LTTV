import { afterEach, expect, test } from "bun:test";
import { cleanup, render } from "@testing-library/react";
import { ChatOverlay } from "./ChatOverlay";
import { createChatStore } from "./chatStore";

afterEach(cleanup);

test("renders one bubble per message with inline emote images", () => {
  const bubbles = [
    {
      id: "1",
      displayName: "Mira",
      color: "#ff0000",
      addedAt: 0,
      parts: [
        { kind: "text" as const, text: "hi " },
        { kind: "emote" as const, code: "Kappa", url: "https://e/kappa" },
      ],
    },
  ];
  const { container } = render(<ChatOverlay bubbles={bubbles} fadeMs={6000} textSize="m" />);
  expect(container.querySelectorAll("[data-bubble]")).toHaveLength(1);
  const img = container.querySelector("img");
  expect(img?.getAttribute("src")).toBe("https://e/kappa");
  expect(img?.getAttribute("alt")).toBe("Kappa");
  expect(container.textContent).toContain("Mira");
});

test("bubble count in the DOM never exceeds maxMessages", () => {
  const store = createChatStore(5, 6000);
  for (let i = 0; i < 50; i++) {
    store.add({
      id: `m${i}`,
      displayName: "x",
      color: null,
      parts: [{ kind: "text", text: "spam" }],
    });
  }
  const { container } = render(
    <ChatOverlay bubbles={store.visible()} fadeMs={6000} textSize="m" />,
  );
  expect(container.querySelectorAll("[data-bubble]")).toHaveLength(5);
});

test("a missing colour falls back to the accent colour", () => {
  const { container } = render(
    <ChatOverlay
      bubbles={[{ id: "1", displayName: "Bob", color: null, addedAt: 0, parts: [] }]}
      fadeMs={6000}
      textSize="m"
    />,
  );
  expect((container.querySelector(".bubble-name") as HTMLElement).style.color).toBe(
    "var(--accent)",
  );
});

test("/me messages render in italics", () => {
  const { container } = render(
    <ChatOverlay
      bubbles={[{ id: "1", displayName: "A", color: null, addedAt: 0, action: true, parts: [] }]}
      fadeMs={6000}
      textSize="m"
    />,
  );
  expect(container.querySelector(".bubble.action")).toBeTruthy();
});
