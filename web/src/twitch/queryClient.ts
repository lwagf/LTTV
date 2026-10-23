import { QueryClient, type UseQueryResult } from "@tanstack/react-query";
import { AuthError } from "./auth";
import { GqlError } from "./gql";
import { HttpError } from "./http";

export const MAX_RETRIES = 5;

/**
 * Retry what might recover by itself (network failures, 5xx, rate limiting), a few times. Anything
 * else (bad requests, GQL errors, a revoked login) fails straight away; revoked logins go to login.
 */
export function shouldRetry(failures: number, error: unknown): boolean {
  if (failures >= MAX_RETRIES) return false;
  if (error instanceof AuthError) return error.reason === "network";
  if (error instanceof HttpError) return error.status >= 500 || error.status === 429;
  return !(error instanceof GqlError);
}

/** 1 s, 2 s, 4 s … capped at 30 s; at least 15 s when rate limited (Helix resets each minute). */
export function retryDelay(attempt: number, error: unknown): number {
  const backoff = Math.min(1000 * 2 ** attempt, 30000);
  return error instanceof HttpError && error.status === 429 ? Math.max(backoff, 15000) : backoff;
}

export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: shouldRetry,
        retryDelay,
        refetchOnWindowFocus: false,
        // Only the top screen is mounted, so keep data around while the player is open.
        gcTime: 30 * 60_000,
      },
    },
  });
}

export const LOAD_FAILED = "Couldn't reach Twitch. Try again in a moment.";

/** True while a query has no data and its last attempt failed. */
export const isFailing = (q: Pick<UseQueryResult, "data" | "isError" | "failureCount">) =>
  q.data === undefined && (q.isError || q.failureCount > 0);
