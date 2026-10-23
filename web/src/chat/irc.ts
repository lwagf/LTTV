import { type ChatMessage, parseLine, toChatMessage } from "./parse";

interface Options {
  url?: string;
  WebSocketImpl?: typeof WebSocket;
  schedule?: (fn: () => void, ms: number) => void;
}

const BACKOFF_MS = [1000, 2000, 4000, 8000, 16000, 30000];

/**
 * Read-only Twitch chat over IRC WebSocket, logged in as an anonymous `justinfan` user.
 * It never authenticates and never sends PRIVMSG, so it cannot post to chat.
 */
export class AnonymousChat {
  private socket: WebSocket | null = null;
  private channel: string | null = null;
  private attempt = 0;
  private closed = false;
  private messageListeners = new Set<(m: ChatMessage) => void>();
  private clearListeners = new Set<() => void>();
  private readonly url: string;
  private readonly WS: typeof WebSocket;
  private readonly schedule: (fn: () => void, ms: number) => void;

  constructor(opts: Options = {}) {
    this.url = opts.url ?? "wss://irc-ws.chat.twitch.tv:443";
    this.WS = opts.WebSocketImpl ?? WebSocket;
    this.schedule = opts.schedule ?? ((fn, ms) => setTimeout(fn, ms));
  }

  join(login: string) {
    const next = login.toLowerCase();
    if (this.channel === next) return;
    if (this.channel && this.isOpen()) this.send(`PART #${this.channel}`);
    this.channel = next;
    if (!this.socket) this.connect();
    else if (this.isOpen()) this.send(`JOIN #${next}`);
  }

  leave() {
    if (this.channel && this.isOpen()) this.send(`PART #${this.channel}`);
    this.channel = null;
  }

  onMessage(cb: (m: ChatMessage) => void) {
    this.messageListeners.add(cb);
    return () => this.messageListeners.delete(cb);
  }

  onClear(cb: () => void) {
    this.clearListeners.add(cb);
    return () => this.clearListeners.delete(cb);
  }

  close() {
    this.closed = true;
    this.socket?.close();
    this.socket = null;
  }

  private isOpen() {
    return this.socket?.readyState === 1;
  }

  private send(line: string) {
    this.socket?.send(`${line}\r\n`);
  }

  private connect() {
    const ws = new this.WS(this.url);
    this.socket = ws;
    ws.onopen = () => {
      this.attempt = 0;
      const nick = `justinfan${Math.floor(10000 + Math.random() * 89990000)}`;
      this.send("CAP REQ :twitch.tv/tags twitch.tv/commands");
      this.send("PASS SCHMOOPIIE");
      this.send(`NICK ${nick}`);
      if (this.channel) this.send(`JOIN #${this.channel}`);
    };
    ws.onmessage = (e: MessageEvent | { data: string }) => {
      for (const raw of String(e.data).split("\r\n")) {
        if (raw) this.handle(raw);
      }
    };
    ws.onclose = () => {
      if (this.socket !== ws || this.closed) return;
      this.socket = null;
      const delay = BACKOFF_MS[Math.min(this.attempt++, BACKOFF_MS.length - 1)];
      this.schedule(() => {
        if (!this.closed && !this.socket) this.connect();
      }, delay);
    };
  }

  private handle(raw: string) {
    const line = parseLine(raw);
    switch (line.command) {
      case "PING":
        this.send(`PONG :${line.params[0] ?? "tmi.twitch.tv"}`);
        break;
      case "PRIVMSG": {
        const m = toChatMessage(line);
        if (m) for (const cb of [...this.messageListeners]) cb(m);
        break;
      }
      case "CLEARCHAT":
        if (line.params.length < 2) for (const cb of [...this.clearListeners]) cb();
        break;
      case "RECONNECT":
        this.socket?.close();
        break;
    }
  }
}
