export interface Tokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  userId: string;
  login: string;
}

const KEY = "lttv.tokens";
const listeners = new Set<(t: Tokens | null) => void>();

function notify(t: Tokens | null) {
  for (const cb of [...listeners]) cb(t);
}

export const tokenStore = {
  load(): Tokens | null {
    try {
      const raw = localStorage.getItem(KEY);
      return raw ? (JSON.parse(raw) as Tokens) : null;
    } catch {
      return null;
    }
  },
  save(t: Tokens) {
    try {
      localStorage.setItem(KEY, JSON.stringify(t));
    } catch {
      // Storage unavailable: the session still works until the app closes.
    }
    notify(t);
  },
  clear() {
    try {
      localStorage.removeItem(KEY);
    } catch {
      // Nothing stored to clear.
    }
    notify(null);
  },
};

export function subscribeAuth(cb: (t: Tokens | null) => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
