import { expect, test } from "bun:test";
import { AnonymousChat } from "./irc";

class FakeSocket {
  static instances: FakeSocket[] = [];
  sent: string[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  readyState = 0;
  constructor(readonly url: string) {
    FakeSocket.instances.push(this);
  }
  send(data: string) {
    this.sent.push(data);
  }
  close() {
    this.readyState = 3;
    this.onclose?.();
  }
  open() {
    this.readyState = 1;
    this.onopen?.();
  }
  receive(data: string) {
    this.onmessage?.({ data });
  }
  lines() {
    return this.sent.flatMap((s) => s.split("\r\n").filter(Boolean));
  }
}

function setup() {
  FakeSocket.instances = [];
  const delays: number[] = [];
  const chat = new AnonymousChat({
    WebSocketImpl: FakeSocket as unknown as typeof WebSocket,
    schedule: (fn, ms) => {
      delays.push(ms);
      fn();
    },
  });
  return { chat, delays, sock: () => FakeSocket.instances[FakeSocket.instances.length - 1] };
}

test("sends handshake with justinfan nick and no token", () => {
  const { chat, sock } = setup();
  chat.join("lirik");
  sock().open();
  const lines = sock().lines();
  expect(lines[0]).toBe("CAP REQ :twitch.tv/tags twitch.tv/commands");
  expect(lines).toContain("PASS SCHMOOPIIE");
  expect(lines.find((l) => l.startsWith("NICK "))).toMatch(/^NICK justinfan\d{5,8}$/);
  expect(lines).toContain("JOIN #lirik");
  expect(lines.filter((l) => l.startsWith("PASS"))).toEqual(["PASS SCHMOOPIIE"]);
});

test("PING gets PONG", () => {
  const { chat, sock } = setup();
  chat.join("lirik");
  sock().open();
  sock().receive("PING :tmi.twitch.tv\r\n");
  expect(sock().lines()).toContain("PONG :tmi.twitch.tv");
});

test("delivers PRIVMSG to listeners", () => {
  const { chat, sock } = setup();
  const got: string[] = [];
  chat.onMessage((m) => got.push(`${m.displayName}: ${m.text}`));
  chat.join("lirik");
  sock().open();
  sock().receive(
    "@display-name=A;id=1 :a!a@a PRIVMSG #lirik :hello\r\n@display-name=B;id=2 :b!b@b PRIVMSG #lirik :yo\r\n",
  );
  expect(got).toEqual(["A: hello", "B: yo"]);
});

test("CLEARCHAT without target fires onClear", () => {
  const { chat, sock } = setup();
  let cleared = 0;
  chat.onClear(() => cleared++);
  chat.join("lirik");
  sock().open();
  sock().receive(":tmi.twitch.tv CLEARCHAT #lirik\r\n");
  sock().receive(":tmi.twitch.tv CLEARCHAT #lirik :someuser\r\n");
  expect(cleared).toBe(1);
});

test("reconnects with backoff and rejoins after close", () => {
  const { chat, delays, sock } = setup();
  chat.join("lirik");
  const first = sock();
  first.open();
  first.close();
  const second = sock();
  expect(second).not.toBe(first);
  second.close();
  expect(delays.slice(0, 2)).toEqual([1000, 2000]);
  sock().open();
  expect(sock().lines()).toContain("JOIN #lirik");
});

test("switching channel parts the old one", () => {
  const { chat, sock } = setup();
  chat.join("lirik");
  sock().open();
  chat.join("shroud");
  expect(sock().lines()).toContain("PART #lirik");
  expect(sock().lines()).toContain("JOIN #shroud");
});

test("never sends PRIVMSG", () => {
  const { chat, sock } = setup();
  chat.join("lirik");
  sock().open();
  sock().receive("PING :x\r\n");
  chat.join("other");
  chat.leave();
  chat.close();
  for (const s of FakeSocket.instances) {
    expect(s.lines().some((l) => l.includes("PRIVMSG"))).toBe(false);
  }
});
