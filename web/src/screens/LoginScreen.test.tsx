import { afterEach, expect, test } from "bun:test";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { AuthError, type DeviceFlow } from "../twitch/auth";
import type { Tokens } from "../twitch/tokenStore";
import { LoginScreen } from "./LoginScreen";

afterEach(cleanup);

const flow = (code: string): DeviceFlow => ({
  userCode: code,
  verificationUri: `https://www.twitch.tv/activate?device-code=${code}`,
  deviceCode: `dc-${code}`,
  intervalSec: 5,
  expiresAt: Date.now() + 1_800_000,
});

test("shows the user code and twitch.tv/activate", async () => {
  render(
    <LoginScreen
      auth={{
        startDeviceFlow: async () => flow("ABCD-EFGH"),
        pollDeviceFlow: () => new Promise<Tokens>(() => {}),
      }}
    />,
  );
  expect(await screen.findByText("ABCD-EFGH")).toBeTruthy();
  expect(screen.getByText(/twitch\.tv\/activate/)).toBeTruthy();
});

test("restarts the flow when the code expires", async () => {
  const codes = ["OLD1", "NEW2"];
  let polls = 0;
  render(
    <LoginScreen
      auth={{
        startDeviceFlow: async () => flow(codes.shift() ?? "X"),
        pollDeviceFlow: () =>
          ++polls === 1 ? Promise.reject(new AuthError("expired")) : new Promise<Tokens>(() => {}),
      }}
    />,
  );
  expect(await screen.findByText("NEW2")).toBeTruthy();
  await waitFor(() => expect(polls).toBe(2));
});
