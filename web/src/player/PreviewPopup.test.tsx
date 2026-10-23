import { afterEach, expect, test } from "bun:test";
import { cleanup, render, screen } from "@testing-library/react";
import { stream } from "../../test/fixtures";
import { liveRef } from "../nav/refs";
import { PreviewPopup } from "./PreviewPopup";

afterEach(cleanup);

test("the preview shows the next stream's thumbnail, name and title", () => {
  const { container } = render(
    <PreviewPopup streamRef={liveRef(stream(2, { title: "Ranked grind" }))} dir={1} />,
  );
  expect(container.querySelector("img")?.getAttribute("src")).toBe("https://thumb/2.jpg");
  expect(screen.getByText("User2")).toBeTruthy();
  expect(screen.getByText("Ranked grind")).toBeTruthy();
});
