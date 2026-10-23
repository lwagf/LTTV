import { expect, test } from "bun:test";
import type { ChatMessage } from "./parse";
import type { EmoteMap } from "./thirdPartyEmotes";
import { tokenize, twitchEmoteUrl } from "./tokenize";

function msg(text: string, twitchEmotes: ChatMessage["twitchEmotes"] = []): ChatMessage {
  return { id: "1", login: "a", displayName: "A", color: null, text, action: false, twitchEmotes };
}

const third: EmoteMap = new Map([
  ["pepeD", { url: "https://a/pepeD.webp", staticUrl: "https://a/pepeD_s.webp", animated: true }],
  ["LUL", { url: "https://a/LUL.webp", staticUrl: "https://a/LUL.webp", animated: false }],
]);

test("twitch emote after emoji lands on the right word", () => {
  expect(tokenize(msg("😀 Kappa hi", [{ id: "25", start: 2, end: 6 }]), new Map(), true)).toEqual([
    { kind: "text", text: "😀 " },
    { kind: "emote", code: "Kappa", url: twitchEmoteUrl("25") },
    { kind: "text", text: " hi" },
  ]);
});

test("third-party match is whole-word and case-sensitive", () => {
  expect(tokenize(msg("pepeD pepeDance lul LUL"), third, true)).toEqual([
    { kind: "emote", code: "pepeD", url: "https://a/pepeD.webp" },
    { kind: "text", text: " pepeDance lul " },
    { kind: "emote", code: "LUL", url: "https://a/LUL.webp" },
  ]);
});

test("animated=false uses staticUrl", () => {
  expect(tokenize(msg("pepeD"), third, false)).toEqual([
    { kind: "emote", code: "pepeD", url: "https://a/pepeD_s.webp" },
  ]);
});

test("third-party words inside twitch-emote gaps still match", () => {
  expect(tokenize(msg("Kappa pepeD", [{ id: "25", start: 0, end: 4 }]), third, true)).toEqual([
    { kind: "emote", code: "Kappa", url: twitchEmoteUrl("25") },
    { kind: "text", text: " " },
    { kind: "emote", code: "pepeD", url: "https://a/pepeD.webp" },
  ]);
});

test("plain text stays one part", () => {
  expect(tokenize(msg("hello there"), third, true)).toEqual([
    { kind: "text", text: "hello there" },
  ]);
});
