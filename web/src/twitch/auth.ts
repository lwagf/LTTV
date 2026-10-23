import { OAUTH_SCOPES, TWITCH_CLIENT_ID } from "./config";
import { httpRequest } from "./http";
import { type Tokens, tokenStore } from "./tokenStore";

export { subscribeAuth } from "./tokenStore";

export class AuthError extends Error {
  constructor(readonly reason: "expired" | "denied" | "revoked" | "network") {
    super(`auth ${reason}`);
  }
}

export interface DeviceFlow {
  userCode: string;
  verificationUri: string;
  deviceCode: string;
  intervalSec: number;
  expiresAt: number;
}

async function postForm(path: string, params: Record<string, string>) {
  const res = await httpRequest({
    url: `https://id.twitch.tv/oauth2/${path}`,
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params).toString(),
  });
  let json: Record<string, unknown> = {};
  try {
    json = JSON.parse(res.body);
  } catch {
    // Non-JSON error bodies are handled by status below.
  }
  return { status: res.status, json };
}

export async function startDeviceFlow(): Promise<DeviceFlow> {
  const { status, json } = await postForm("device", {
    client_id: TWITCH_CLIENT_ID,
    scopes: OAUTH_SCOPES,
  });
  if (status !== 200) throw new AuthError("network");
  return {
    userCode: json.user_code as string,
    verificationUri: json.verification_uri as string,
    deviceCode: json.device_code as string,
    intervalSec: json.interval as number,
    expiresAt: Date.now() + (json.expires_in as number) * 1000,
  };
}

async function fetchUser(accessToken: string) {
  const res = await httpRequest({
    url: "https://api.twitch.tv/helix/users",
    method: "GET",
    headers: { "Client-Id": TWITCH_CLIENT_ID, Authorization: `Bearer ${accessToken}` },
  });
  if (res.status !== 200) throw new AuthError("network");
  const user = (JSON.parse(res.body) as { data: { id: string; login: string }[] }).data[0];
  return { userId: user.id, login: user.login };
}

const sleepMs = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Polls until the user enters the code on their phone; stores and returns the tokens. */
export async function pollDeviceFlow(
  deviceCode: string,
  intervalSec: number,
  signal: AbortSignal,
  sleep: (ms: number) => Promise<void> = sleepMs,
): Promise<Tokens> {
  let interval = intervalSec;
  for (;;) {
    await sleep(interval * 1000);
    if (signal.aborted) throw new AuthError("expired");
    const { status, json } = await postForm("token", {
      client_id: TWITCH_CLIENT_ID,
      scopes: OAUTH_SCOPES,
      device_code: deviceCode,
      grant_type: "urn:ietf:params:oauth:grant-type:device_code",
    });
    if (status === 200) {
      const accessToken = json.access_token as string;
      const tokens: Tokens = {
        accessToken,
        refreshToken: json.refresh_token as string,
        expiresAt: Date.now() + (json.expires_in as number) * 1000,
        ...(await fetchUser(accessToken)),
      };
      tokenStore.save(tokens);
      return tokens;
    }
    const message = String(json.message ?? "");
    if (message === "authorization_pending") continue;
    if (message === "slow_down") {
      interval += 5;
      continue;
    }
    if (message === "expired_token") throw new AuthError("expired");
    throw new AuthError("denied");
  }
}

/** Public-client refresh tokens are single-use: always store the new one. */
export async function refreshTokens(t: Tokens): Promise<Tokens> {
  const { status, json } = await postForm("token", {
    client_id: TWITCH_CLIENT_ID,
    grant_type: "refresh_token",
    refresh_token: t.refreshToken,
  });
  if (status === 400 || status === 401) {
    tokenStore.clear();
    throw new AuthError("revoked");
  }
  if (status !== 200) throw new AuthError("network");
  const next: Tokens = {
    ...t,
    accessToken: json.access_token as string,
    refreshToken: json.refresh_token as string,
    expiresAt: Date.now() + (json.expires_in as number) * 1000,
  };
  tokenStore.save(next);
  return next;
}
