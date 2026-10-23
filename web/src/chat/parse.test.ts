import { expect, test } from "bun:test";
import { parseLine, toChatMessage } from "./parse";

const line =
  "@badge-info=;color=#FF7F50;display-name=Kappa_King;emotes=25:0-4,12-16/1902:6-10;id=abc-1;" +
  "user-type= :kappa_king!kappa_king@kappa_king.tmi.twitch.tv PRIVMSG #lirik :Kappa Keepo Kappa";

test("parses tags, prefix, command, trailing", () => {
  const p = parseLine(line);
  expect(p.command).toBe("PRIVMSG");
  expect(p.params).toEqual(["#lirik", "Kappa Keepo Kappa"]);
  expect(p.prefix).toBe("kappa_king!kappa_king@kappa_king.tmi.twitch.tv");
  expect(p.tags["display-name"]).toBe("Kappa_King");
});

test("unescapes tag values", () => {
  const p = parseLine("@system-msg=hello\\sworld\\:\\\\ok :tmi.twitch.tv USERNOTICE #x");
  expect(p.tags["system-msg"]).toBe("hello world;\\ok");
});

test("emotes tag gives three ranges", () => {
  const m = toChatMessage(parseLine(line));
  expect(m?.twitchEmotes).toEqual([
    { id: "25", start: 0, end: 4 },
    { id: "25", start: 12, end: 16 },
    { id: "1902", start: 6, end: 10 },
  ]);
});

test("emote ranges are kept as code-point indexes", () => {
  const m = toChatMessage(
    parseLine("@emotes=25:2-6;display-name=A;id=1 :a!a@a PRIVMSG #x :😀 Kappa"),
  );
  expect(m?.text).toBe("😀 Kappa");
  expect(m?.twitchEmotes).toEqual([{ id: "25", start: 2, end: 6 }]);
});

test("missing color is null and login comes from prefix", () => {
  const m = toChatMessage(parseLine("@color=;display-name=Bob;id=2 :bob!bob@bob PRIVMSG #x :hi"));
  expect(m).toMatchObject({ login: "bob", displayName: "Bob", color: null, id: "2" });
});

test("non-PRIVMSG is not a chat message", () => {
  expect(toChatMessage(parseLine("PING :tmi.twitch.tv"))).toBeNull();
});

test("/me messages drop the ACTION wrapper so text and emote ranges line up", () => {
  const m = toChatMessage(
    parseLine(
      "@emotes=25:6-10;display-name=A;id=3 :a!a@a PRIVMSG #x :\u0001ACTION waves Kappa\u0001",
    ),
  );
  expect(m?.text).toBe("waves Kappa");
  expect(m?.action).toBe(true);
  expect(
    Array.from(m?.text ?? "")
      .slice(6, 11)
      .join(""),
  ).toBe("Kappa");
});

test("ordinary messages are not actions", () => {
  expect(toChatMessage(parseLine("@id=4 :a!a@a PRIVMSG #x :hello"))?.action).toBe(false);
});
