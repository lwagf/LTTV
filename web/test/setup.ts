import { GlobalRegistrator } from "@happy-dom/global-registrator";

GlobalRegistrator.register();

// Spatial navigation must be initialised before any useFocusable mounts (main.tsx does this
// in the app). Imported after the DOM exists because it touches window on load.
const { init } = await import("@noriginmedia/norigin-spatial-navigation");
init();

// Tests must never touch the network: unstubbed fetches fail fast and sockets never connect.
globalThis.fetch = (async (input: RequestInfo | URL) => {
  throw new Error(`unexpected network request in test: ${String(input)}`);
}) as unknown as typeof fetch;

class OfflineWebSocket {
  readyState = 0;
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  send() {}
  close() {
    this.readyState = 3;
  }
}
globalThis.WebSocket = OfflineWebSocket as unknown as typeof WebSocket;

// Vite injects this at build time (vite.config.ts `define`).
(globalThis as unknown as { __APP_VERSION__: string }).__APP_VERSION__ = "0.0.0-test";
