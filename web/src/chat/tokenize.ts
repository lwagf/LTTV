import type { ChatMessage } from "./parse";
import type { EmoteMap } from "./thirdPartyEmotes";

export type Part = { kind: "text"; text: string } | { kind: "emote"; code: string; url: string };

export function twitchEmoteUrl(id: string): string {
  return `https://static-cdn.jtvnw.net/emoticons/v2/${id}/default/dark/1.0`;
}

function pushText(parts: Part[], text: string) {
  if (!text) return;
  const last = parts[parts.length - 1];
  if (last?.kind === "text") last.text += text;
  else parts.push({ kind: "text", text });
}

function splitThirdParty(parts: Part[], text: string, emotes: EmoteMap, animated: boolean) {
  // Split on spaces but keep them, so whole words can be swapped for emotes.
  for (const piece of text.split(/( +)/)) {
    const emote = emotes.get(piece);
    if (emote)
      parts.push({ kind: "emote", code: piece, url: animated ? emote.url : emote.staticUrl });
    else pushText(parts, piece);
  }
}

/** Message text → text and emote parts. Twitch ranges index Unicode code points, not UTF-16. */
export function tokenize(msg: ChatMessage, thirdParty: EmoteMap, animated: boolean): Part[] {
  const chars = Array.from(msg.text);
  const ranges = [...msg.twitchEmotes].sort((a, b) => a.start - b.start);
  const parts: Part[] = [];
  let cursor = 0;
  for (const r of ranges) {
    if (r.start < cursor || r.end >= chars.length) continue;
    splitThirdParty(parts, chars.slice(cursor, r.start).join(""), thirdParty, animated);
    parts.push({
      kind: "emote",
      code: chars.slice(r.start, r.end + 1).join(""),
      url: twitchEmoteUrl(r.id),
    });
    cursor = r.end + 1;
  }
  splitThirdParty(parts, chars.slice(cursor).join(""), thirdParty, animated);
  return parts;
}
