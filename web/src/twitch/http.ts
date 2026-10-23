import { getNative } from "../native/bridge";

export interface HttpRequest {
  url: string;
  method: "GET" | "POST";
  headers?: Record<string, string>;
  body?: string;
}

export interface HttpResponse {
  status: number;
  body: string;
}

export class HttpError extends Error {
  constructor(readonly status: number) {
    super(`http ${status}`);
  }
}

/** Hosts reached through the native proxy (usher sends no CORS headers; the others to be safe). */
export const PROXIED_HOSTS = ["gql.twitch.tv", "id.twitch.tv", "usher.ttvnw.net"];

export async function httpRequest(req: HttpRequest): Promise<HttpResponse> {
  const headers = req.headers ?? {};
  if (PROXIED_HOSTS.includes(new URL(req.url).host)) {
    return getNative().call("http.request", { ...req, headers });
  }
  const res = await fetch(req.url, { method: req.method, headers, body: req.body });
  return { status: res.status, body: await res.text() };
}
