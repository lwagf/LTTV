import { afterEach, expect, test } from "bun:test";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { Tile } from "./Tile";

afterEach(cleanup);

const props = { title: "Xaryu", subtitle: "VOD", aspect: "16:9" as const, onSelect: () => {} };

test("no image url shows the placeholder instead of a broken image", () => {
  const { container } = render(<Tile {...props} image="" />);
  expect(container.querySelector("img")).toBeNull();
  expect(container.querySelector(".tile-placeholder")).toBeTruthy();
});

test("an image that fails to load is swapped for the placeholder", () => {
  const { container } = render(<Tile {...props} image="https://broken/x.jpg" />);
  const img = container.querySelector("img");
  if (!img) throw new Error("expected an img");
  fireEvent.error(img);
  expect(container.querySelector("img")).toBeNull();
  expect(container.querySelector(".tile-placeholder")).toBeTruthy();
});
