export interface IrcLine {
  command: string;
  params: string[];
  tags: Record<string, string>;
  prefix: string | null;
}

export interface ChatMessage {
  id: string;
  login: string;
  displayName: string;
  color: string | null;
  text: string;
  /** A /me message (shown in italics). */
  action: boolean;
  /** Inclusive Unicode code-point ranges into `text`, as Twitch sends them. */
  twitchEmotes: { id: string; start: number; end: number }[];
}

const ESCAPES: Record<string, string> = { s: " ", ":": ";", "\\": "\\", r: "\r", n: "\n" };

function unescapeTag(v: string): string {
  return v.replace(/\\(.)?/g, (_, c: string | undefined) => (c ? (ESCAPES[c] ?? c) : ""));
}

export function parseLine(line: string): IrcLine {
  let rest = line;
  const tags: Record<string, string> = {};
  if (rest.startsWith("@")) {
    const end = rest.indexOf(" ");
    for (const pair of rest.slice(1, end).split(";")) {
      const eq = pair.indexOf("=");
      if (eq < 0) tags[pair] = "";
      else tags[pair.slice(0, eq)] = unescapeTag(pair.slice(eq + 1));
    }
    rest = rest.slice(end + 1);
  }
  let prefix: string | null = null;
  if (rest.startsWith(":")) {
    const end = rest.indexOf(" ");
    prefix = rest.slice(1, end);
    rest = rest.slice(end + 1);
  }
  const params: string[] = [];
  const trailingAt = rest.indexOf(" :");
  const head = trailingAt >= 0 ? rest.slice(0, trailingAt) : rest;
  const [command, ...middle] = head.split(" ").filter(Boolean);
  params.push(...middle);
  if (trailingAt >= 0) params.push(rest.slice(trailingAt + 2));
  else if (rest.startsWith(":")) params.push(rest.slice(1));
  return { command: command ?? "", params, tags, prefix };
}

function parseEmotes(tag: string | undefined): ChatMessage["twitchEmotes"] {
  if (!tag) return [];
  return tag.split("/").flatMap((group) => {
    const [id, ranges] = group.split(":");
    if (!id || !ranges) return [];
    return ranges.split(",").map((r) => {
      const [start, end] = r.split("-").map(Number);
      return { id, start, end };
    });
  });
}

export function toChatMessage(p: IrcLine): ChatMessage | null {
  if (p.command !== "PRIVMSG") return null;
  const login = p.prefix?.split("!")[0] ?? "";
  // /me arrives as "\x01ACTION text\x01"; Twitch's emote ranges index the unwrapped text.
  const raw = p.params[1] ?? "";
  const action = raw.startsWith("\u0001ACTION ") && raw.endsWith("\u0001");
  return {
    id: p.tags.id || `${login}-${Date.now()}-${Math.random()}`,
    login,
    displayName: p.tags["display-name"] || login,
    color: p.tags.color || null,
    text: action ? raw.slice(8, -1) : raw,
    action,
    twitchEmotes: parseEmotes(p.tags.emotes),
  };
}
