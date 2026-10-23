import { afterEach, expect, test } from "bun:test";
import { stubFetch, stubNativeHttp } from "../../test/helpers";
import { setNative } from "../native/bridge";
import { httpRequest } from "./http";

let restore = () => {};
afterEach(() => {
  restore();
  setNative(null);
});

test("gql host goes through native http.request", async () => {
  const native = stubNativeHttp(() => ({ status: 200, body: "ok" }));
  const f = stubFetch(() => ({ status: 500, body: "" }));
  restore = f.restore;
  const res = await httpRequest({ url: "https://gql.twitch.tv/gql", method: "POST", body: "{}" });
  expect(res).toEqual({ status: 200, body: "ok" });
  expect(native.callsOf("http.request")).toHaveLength(1);
  expect(f.calls).toHaveLength(0);
});

test("api.twitch.tv goes through fetch", async () => {
  const native = stubNativeHttp(() => ({ status: 500, body: "" }));
  const f = stubFetch(() => ({ status: 200, body: "helix" }));
  restore = f.restore;
  const res = await httpRequest({ url: "https://api.twitch.tv/helix/users", method: "GET" });
  expect(res).toEqual({ status: 200, body: "helix" });
  expect(native.callsOf("http.request")).toHaveLength(0);
});

test("usher goes through native http.request (200s lack CORS headers)", async () => {
  const native = stubNativeHttp(() => ({ status: 200, body: "#EXTM3U" }));
  const f = stubFetch(() => ({ status: 500, body: "" }));
  restore = f.restore;
  await httpRequest({ url: "https://usher.ttvnw.net/api/channel/hls/x.m3u8", method: "GET" });
  expect(native.callsOf("http.request")).toHaveLength(1);
  expect(f.calls).toHaveLength(0);
});
