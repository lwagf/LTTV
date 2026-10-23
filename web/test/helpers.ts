import { setNative } from "../src/native/bridge";
import { FakeNative } from "../src/native/fakeNative";

export interface FetchCall {
  url: string;
  init?: RequestInit;
}

/** Replace global fetch with a router; returns the recorded calls. */
export function stubFetch(
  route: (url: string, init?: RequestInit) => { status: number; body: unknown } | undefined,
) {
  const calls: FetchCall[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    const r = route(url, init) ?? { status: 404, body: "" };
    const text = typeof r.body === "string" ? r.body : JSON.stringify(r.body);
    return new Response(text, { status: r.status });
  }) as typeof fetch;
  return { calls, restore: () => (globalThis.fetch = original) };
}

/** Install a FakeNative whose http.request is answered by `route`. */
export function stubNativeHttp(
  route: (req: { url: string; body?: string; headers: Record<string, string> }) =>
    | { status: number; body: unknown }
    | undefined,
) {
  const native = new FakeNative();
  native.respond("http.request", (args) => {
    const r = route(args) ?? { status: 404, body: "" };
    return { status: r.status, body: typeof r.body === "string" ? r.body : JSON.stringify(r.body) };
  });
  setNative(native);
  return native;
}
