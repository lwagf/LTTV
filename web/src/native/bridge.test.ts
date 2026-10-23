import { afterEach, beforeEach, expect, test } from "bun:test";
import { createWindowBridge } from "./bridge";

let posted: { id?: number; cmd: string; args: unknown }[];

beforeEach(() => {
  posted = [];
  (window as unknown as { LTTVNative: unknown }).LTTVNative = {
    post: (json: string) => posted.push(JSON.parse(json)),
  };
});

afterEach(() => {
  delete (window as unknown as { LTTVNative?: unknown }).LTTVNative;
});

function deliver(msg: unknown) {
  window.__lttv?.onNative(JSON.stringify(msg));
}

test("call resolves with matching response id", async () => {
  const bridge = createWindowBridge();
  const p = bridge.call("app.info", {});
  expect(posted[0]).toMatchObject({ cmd: "app.info", args: {} });
  deliver({
    type: "response",
    id: posted[0].id,
    ok: true,
    result: { versionName: "0.1.0", webViewUserAgent: "x" },
  });
  expect(await p).toEqual({ versionName: "0.1.0", webViewUserAgent: "x" });
});

test("call rejects on ok:false", async () => {
  const bridge = createWindowBridge();
  const p = bridge.call("player.play", {});
  deliver({ type: "response", id: posted[0].id, ok: false, error: "boom" });
  await expect(p).rejects.toThrow("boom");
});

test("responses out of order resolve the right promises", async () => {
  const bridge = createWindowBridge();
  const a = bridge.call("http.request", { url: "https://a", method: "GET", headers: {} });
  const b = bridge.call("http.request", { url: "https://b", method: "GET", headers: {} });
  deliver({ type: "response", id: posted[1].id, ok: true, result: { status: 2, body: "b" } });
  deliver({ type: "response", id: posted[0].id, ok: true, result: { status: 1, body: "a" } });
  expect(await a).toEqual({ status: 1, body: "a" });
  expect(await b).toEqual({ status: 2, body: "b" });
});

test("on() receives events and unsubscribe stops them", () => {
  const bridge = createWindowBridge();
  const seen: string[] = [];
  const off = bridge.on("key", (d) => seen.push(d.key));
  deliver({ type: "event", event: "key", data: { key: "menu" } });
  off();
  deliver({ type: "event", event: "key", data: { key: "back" } });
  expect(seen).toEqual(["menu"]);
});
