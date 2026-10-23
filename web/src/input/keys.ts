import type { NativeBridge } from "../native/protocol";

export type RemoteKey =
  | "up"
  | "down"
  | "left"
  | "right"
  | "select"
  | "back"
  | "menu"
  | "playPause"
  | "rewind"
  | "fastForward";

const KEY_MAP: Record<string, RemoteKey> = {
  ArrowUp: "up",
  ArrowDown: "down",
  ArrowLeft: "left",
  ArrowRight: "right",
  Enter: "select",
  Escape: "back",
  GoBack: "back",
  BrowserBack: "back",
  Backspace: "back",
  MediaPlayPause: "playPause",
  MediaRewind: "rewind",
  MediaFastForward: "fastForward",
  ContextMenu: "menu",
};

export function fromKeyboardEvent(e: KeyboardEvent): RemoteKey | null {
  return KEY_MAP[e.key] ?? null;
}

export type KeyInfo = { repeat: boolean };
type Handler = (key: RemoteKey, info: KeyInfo) => boolean | undefined;
type UpHandler = (key: RemoteKey) => void;
const upHandlers = new Set<UpHandler>();
const stack: Handler[] = [];
const fallbacks: Handler[] = [];

/**
 * Register a key handler. Newest first; returning true stops older handlers seeing the key.
 * `fallback` handlers (e.g. the app-wide Back) only see keys every normal handler declined.
 */
export function onRemoteKey(h: Handler, opts: { fallback?: boolean } = {}): () => void {
  const list = opts.fallback ? fallbacks : stack;
  list.push(h);
  return () => {
    const i = list.lastIndexOf(h);
    if (i >= 0) list.splice(i, 1);
  };
}

/** Hear key releases (used to commit a held scrub). */
export function onRemoteKeyUp(h: UpHandler): () => void {
  upHandlers.add(h);
  return () => upHandlers.delete(h);
}

/** Returns true when some handler consumed the key. */
export function dispatchRemoteKey(key: RemoteKey, info: KeyInfo = { repeat: false }): boolean {
  for (const list of [stack, fallbacks]) {
    for (let i = list.length - 1; i >= 0; i--) {
      if (list[i](key, info) === true) return true;
    }
  }
  return false;
}

export function dispatchRemoteKeyUp(key: RemoteKey) {
  for (const h of [...upHandlers]) h(key);
}

/**
 * Feed DOM keydown and native `key` events into the handler stack. Listens in the capture
 * phase so handlers run before spatial navigation, and swallows keys a handler consumed so
 * one press can't both open a menu and activate the item it focuses.
 */
export function installKeySources(target: EventTarget, native: NativeBridge): () => void {
  const onKeyDown = (e: Event) => {
    const ke = e as KeyboardEvent;
    const key = fromKeyboardEvent(ke);
    if (key && dispatchRemoteKey(key, { repeat: ke.repeat })) {
      e.preventDefault();
      e.stopImmediatePropagation();
    }
  };
  const onKeyUp = (e: Event) => {
    const key = fromKeyboardEvent(e as KeyboardEvent);
    if (key) dispatchRemoteKeyUp(key);
  };
  target.addEventListener("keydown", onKeyDown, true);
  target.addEventListener("keyup", onKeyUp, true);
  const offs = [
    native.on("key", (d) => dispatchRemoteKey(d.key, { repeat: d.repeat ?? false })),
    native.on("keyUp", (d) => dispatchRemoteKeyUp(d.key)),
  ];
  return () => {
    target.removeEventListener("keydown", onKeyDown, true);
    target.removeEventListener("keyup", onKeyUp, true);
    for (const off of offs) off();
  };
}
