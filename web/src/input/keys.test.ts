import { afterEach, expect, test } from "bun:test";
import { FakeNative } from "../native/fakeNative";
import {
  dispatchRemoteKey,
  fromKeyboardEvent,
  installKeySources,
  onRemoteKey,
  onRemoteKeyUp,
} from "./keys";

const cleanups: (() => void)[] = [];
afterEach(() => {
  while (cleanups.length) cleanups.pop()?.();
});

function key(k: string) {
  return new KeyboardEvent("keydown", { key: k });
}

test("maps keyboard events to remote keys", () => {
  expect(fromKeyboardEvent(key("ArrowUp"))).toBe("up");
  expect(fromKeyboardEvent(key("ArrowDown"))).toBe("down");
  expect(fromKeyboardEvent(key("ArrowLeft"))).toBe("left");
  expect(fromKeyboardEvent(key("ArrowRight"))).toBe("right");
  expect(fromKeyboardEvent(key("Enter"))).toBe("select");
  expect(fromKeyboardEvent(key("Escape"))).toBe("back");
  expect(fromKeyboardEvent(key("GoBack"))).toBe("back");
  expect(fromKeyboardEvent(key("BrowserBack"))).toBe("back");
  expect(fromKeyboardEvent(key("MediaPlayPause"))).toBe("playPause");
  expect(fromKeyboardEvent(key("KeyA"))).toBeNull();
});

test("newest handler wins and true stops propagation", () => {
  const seen: string[] = [];
  cleanups.push(onRemoteKey((k) => void seen.push(`old:${k}`)));
  cleanups.push(
    onRemoteKey((k) => {
      seen.push(`new:${k}`);
      return k === "menu";
    }),
  );
  dispatchRemoteKey("menu");
  dispatchRemoteKey("up");
  expect(seen).toEqual(["new:menu", "new:up", "old:up"]);
});

test("native key events reach the handler stack", () => {
  const native = new FakeNative();
  cleanups.push(installKeySources(window, native));
  const seen: string[] = [];
  cleanups.push(onRemoteKey((k) => void seen.push(k)));
  native.emit("key", { key: "menu", repeat: false });
  window.dispatchEvent(key("ArrowLeft"));
  expect(seen).toEqual(["menu", "left"]);
});

test("fallback handlers run only after every normal handler declines", () => {
  const seen: string[] = [];
  // App registers its fallback after screens mount (parent effects run after child effects).
  cleanups.push(
    onRemoteKey((k) => {
      if (k !== "back") return undefined;
      seen.push("screen:back");
      return true;
    }),
  );
  cleanups.push(
    onRemoteKey(
      (k) => {
        seen.push(`fallback:${k}`);
        return true;
      },
      { fallback: true },
    ),
  );
  dispatchRemoteKey("back");
  dispatchRemoteKey("menu");
  expect(seen).toEqual(["screen:back", "fallback:menu"]);
});

test("a consumed key never reaches other keydown listeners (e.g. spatial navigation)", () => {
  const native = new FakeNative();
  const later: string[] = [];
  const spatialNav = (e: Event) => later.push((e as KeyboardEvent).key);
  // Registered before ours, like norigin's listener installed by init() in main.tsx.
  window.addEventListener("keydown", spatialNav);
  cleanups.push(() => window.removeEventListener("keydown", spatialNav));
  cleanups.push(installKeySources(window, native));
  cleanups.push(onRemoteKey((k) => (k === "select" ? true : undefined)));
  document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }));
  expect(later).toEqual(["ArrowLeft"]);
});

test("DOM repeat keydown reaches handlers with repeat true", () => {
  const native = new FakeNative();
  cleanups.push(installKeySources(window, native));
  const seen: string[] = [];
  cleanups.push(onRemoteKey((k, info) => void seen.push(`${k}:${info.repeat}`)));
  window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft" }));
  window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", repeat: true }));
  expect(seen).toEqual(["left:false", "left:true"]);
});

test("native key repeat flag is passed through", () => {
  const native = new FakeNative();
  cleanups.push(installKeySources(window, native));
  const seen: string[] = [];
  cleanups.push(onRemoteKey((k, info) => void seen.push(`${k}:${info.repeat}`)));
  native.emit("key", { key: "rewind", repeat: true });
  expect(seen).toEqual(["rewind:true"]);
});

test("onRemoteKeyUp hears DOM keyup and native keyUp", () => {
  const native = new FakeNative();
  cleanups.push(installKeySources(window, native));
  const ups: string[] = [];
  cleanups.push(onRemoteKeyUp((k) => void ups.push(k)));
  window.dispatchEvent(new KeyboardEvent("keyup", { key: "ArrowRight" }));
  native.emit("keyUp", { key: "fastForward" });
  expect(ups).toEqual(["right", "fastForward"]);
});
