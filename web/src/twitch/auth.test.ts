import { afterEach, beforeEach, expect, test } from "bun:test";
import { stubFetch, stubNativeHttp } from "../../test/helpers";
import { setNative } from "../native/bridge";
import { AuthError, pollDeviceFlow, refreshTokens, startDeviceFlow } from "./auth";
import { type Tokens, tokenStore } from "./tokenStore";

let restore = () => {};
beforeEach(() => localStorage.clear());
afterEach(() => {
  restore();
  setNative(null);
});

const helixUser = { data: [{ id: "42", login: "logan" }] };
const tokenBody = { access_token: "at", refresh_token: "rt", expires_in: 3600 };

function form(body?: string) {
  return new URLSearchParams(body ?? "");
}

test("device request sends client_id and exactly scope user:read:follows", async () => {
  const native = stubNativeHttp(() => ({
    status: 200,
    body: {
      device_code: "dc",
      user_code: "ABCD-EFGH",
      verification_uri: "https://www.twitch.tv/activate",
      interval: 5,
      expires_in: 1800,
    },
  }));
  const flow = await startDeviceFlow();
  const req = native.callsOf("http.request")[0].args as { url: string; body: string };
  expect(req.url).toBe("https://id.twitch.tv/oauth2/device");
  expect(form(req.body).get("scopes")).toBe("user:read:follows");
  expect(form(req.body).has("client_id")).toBe(true);
  expect(flow).toMatchObject({ userCode: "ABCD-EFGH", deviceCode: "dc", intervalSec: 5 });
});

test("poll keeps waiting on authorization_pending then resolves tokens", async () => {
  let polls = 0;
  stubNativeHttp(() =>
    ++polls < 3
      ? { status: 400, body: { status: 400, message: "authorization_pending" } }
      : { status: 200, body: tokenBody },
  );
  restore = stubFetch(() => ({ status: 200, body: helixUser })).restore;
  const sleeps: number[] = [];
  const tokens = await pollDeviceFlow("dc", 5, new AbortController().signal, async (ms) => {
    sleeps.push(ms);
  });
  expect(polls).toBe(3);
  expect(sleeps).toEqual([5000, 5000, 5000]);
  expect(tokens).toMatchObject({
    accessToken: "at",
    refreshToken: "rt",
    userId: "42",
    login: "logan",
  });
  expect(tokenStore.load()?.accessToken).toBe("at");
});

test("poll respects slow_down by adding 5 s to interval", async () => {
  let polls = 0;
  stubNativeHttp(() =>
    ++polls === 1
      ? { status: 400, body: { status: 400, message: "slow_down" } }
      : { status: 200, body: tokenBody },
  );
  restore = stubFetch(() => ({ status: 200, body: helixUser })).restore;
  const sleeps: number[] = [];
  await pollDeviceFlow("dc", 5, new AbortController().signal, async (ms) => {
    sleeps.push(ms);
  });
  expect(sleeps).toEqual([5000, 10000]);
});

test("poll rejects expired on expired_token", async () => {
  stubNativeHttp(() => ({ status: 400, body: { status: 400, message: "expired_token" } }));
  const err = await pollDeviceFlow("dc", 5, new AbortController().signal, async () => {}).catch(
    (e) => e,
  );
  expect(err).toBeInstanceOf(AuthError);
  expect(err.reason).toBe("expired");
});

const stored: Tokens = {
  accessToken: "old",
  refreshToken: "rt1",
  expiresAt: 0,
  userId: "42",
  login: "logan",
};

test("refresh stores the new single-use refresh token", async () => {
  const native = stubNativeHttp(() => ({
    status: 200,
    body: { access_token: "new", refresh_token: "rt2", expires_in: 3600 },
  }));
  tokenStore.save(stored);
  const t = await refreshTokens(stored);
  const req = native.callsOf("http.request")[0].args as { body: string };
  expect(form(req.body).get("grant_type")).toBe("refresh_token");
  expect(form(req.body).get("refresh_token")).toBe("rt1");
  expect(t).toMatchObject({ accessToken: "new", refreshToken: "rt2", userId: "42" });
  expect(tokenStore.load()?.refreshToken).toBe("rt2");
});

test("refresh 400 clears store and rejects revoked", async () => {
  stubNativeHttp(() => ({ status: 400, body: { status: 400, message: "Invalid refresh token" } }));
  tokenStore.save(stored);
  const err = await refreshTokens(stored).catch((e) => e);
  expect(err).toBeInstanceOf(AuthError);
  expect(err.reason).toBe("revoked");
  expect(tokenStore.load()).toBeNull();
});

test("tokenStore.load returns null on corrupt JSON", () => {
  localStorage.setItem("lttv.tokens", "{not json");
  expect(tokenStore.load()).toBeNull();
});

test("subscribeAuth hears save and clear", async () => {
  const { subscribeAuth } = await import("./tokenStore");
  const seen: (string | null)[] = [];
  const off = subscribeAuth((t) => seen.push(t?.accessToken ?? null));
  tokenStore.save(stored);
  tokenStore.clear();
  off();
  expect(seen).toEqual(["old", null]);
});
