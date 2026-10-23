import { expect, test } from "bun:test";
import { AuthError } from "./auth";
import { GqlError } from "./gql";
import { HttpError } from "./http";
import { createQueryClient, MAX_RETRIES, retryDelay, shouldRetry } from "./queryClient";

test("network and server failures retry, but only a few times", () => {
  expect(shouldRetry(0, new HttpError(503))).toBe(true);
  expect(shouldRetry(0, new Error("fetch failed"))).toBe(true);
  expect(shouldRetry(MAX_RETRIES - 1, new Error("fetch failed"))).toBe(true);
  expect(shouldRetry(MAX_RETRIES, new Error("fetch failed"))).toBe(false);
});

test("client errors and GQL errors never retry", () => {
  expect(shouldRetry(0, new HttpError(400))).toBe(false);
  expect(shouldRetry(0, new HttpError(404))).toBe(false);
  expect(shouldRetry(0, new GqlError("Cannot query field"))).toBe(false);
});

test("rate limiting retries, waiting at least 15 s", () => {
  expect(shouldRetry(0, new HttpError(429))).toBe(true);
  expect(retryDelay(0, new HttpError(429))).toBe(15000);
  expect(retryDelay(5, new HttpError(429))).toBe(30000);
});

test("a network blip while refreshing the login retries; a revoked login doesn't", () => {
  expect(shouldRetry(0, new AuthError("network"))).toBe(true);
  expect(shouldRetry(0, new AuthError("revoked"))).toBe(false);
});

test("backoff doubles from 1 s and caps at 30 s", () => {
  expect(retryDelay(0, new Error())).toBe(1000);
  expect(retryDelay(3, new Error())).toBe(8000);
  expect(retryDelay(10, new Error())).toBe(30000);
});

test("cached data outlives the longest staleTime, so returning to a screen doesn't refetch it", () => {
  const { gcTime } = createQueryClient().getDefaultOptions().queries ?? {};
  expect(gcTime).toBeGreaterThanOrEqual(30 * 60_000);
});
