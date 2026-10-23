import { afterEach, expect, test } from "bun:test";
import { cleanup, render, screen } from "@testing-library/react";
import { SideRail } from "./SideRail";

afterEach(cleanup);

test("the rail shows the LTTV wordmark", () => {
  render(<SideRail />);
  expect(screen.getByText("LTTV")).toBeTruthy();
});

test("the rail has a Help item that opens the remote guide", async () => {
  const { fireEvent } = await import("@testing-library/react");
  const { currentScreen, resetTo } = await import("./navStack");
  resetTo({ name: "home" });
  render(<SideRail />);
  fireEvent.click(screen.getByText("Help"));
  expect(currentScreen()).toEqual({ name: "help" });
});
