import { EventHub } from "./events";
import { FakeNative } from "./fakeNative";
import type { Command, CommandArgs, CommandResult, NativeBridge, NativeMessage } from "./protocol";

declare global {
  interface Window {
    LTTVNative?: { post(json: string): void };
    __lttv?: { onNative(json: string): void };
  }
}

/** Bridge over the `LTTVNative` object that MainActivity injects into the WebView. */
export function createWindowBridge(): NativeBridge {
  const hub = new EventHub();
  const pending = new Map<number, { resolve(v: unknown): void; reject(e: Error): void }>();
  let nextId = 1;

  window.__lttv = {
    onNative(json: string) {
      const msg = JSON.parse(json) as NativeMessage;
      if (msg.type === "event") {
        hub.emit(msg.event, msg.data);
        return;
      }
      const p = pending.get(msg.id);
      if (!p) return;
      pending.delete(msg.id);
      if (msg.ok) p.resolve(msg.result);
      else p.reject(new Error(msg.error));
    },
  };

  return {
    call<C extends Command>(cmd: C, args: CommandArgs<C>) {
      const id = nextId++;
      return new Promise<CommandResult<C>>((resolve, reject) => {
        pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
        window.LTTVNative?.post(JSON.stringify({ id, cmd, args }));
      });
    },
    on: (event, handler) => hub.on(event, handler),
  };
}

let instance: NativeBridge | null = null;

/** The real bridge on the device, an in-memory fake in tests and desktop dev. */
export function getNative(): NativeBridge {
  if (!instance) instance = window.LTTVNative ? createWindowBridge() : new FakeNative();
  return instance;
}

/** Test hook: swap the shared bridge. */
export function setNative(bridge: NativeBridge | null) {
  instance = bridge;
}
