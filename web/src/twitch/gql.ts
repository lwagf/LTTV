import { GQL_CLIENT_ID } from "./config";
import { HttpError, httpRequest } from "./http";

export interface GqlResponse<T> {
  data?: T;
  errors?: { message: string }[];
}

/** The request worked but Twitch answered with GraphQL errors (e.g. a changed schema). */
export class GqlError extends Error {}

/** POST to Twitch's internal GraphQL API with its web client id. */
export async function gql<T>(body: unknown): Promise<GqlResponse<T>> {
  const res = await httpRequest({
    url: "https://gql.twitch.tv/gql",
    method: "POST",
    headers: { "Client-Id": GQL_CLIENT_ID, "Content-Type": "text/plain;charset=UTF-8" },
    body: JSON.stringify(body),
  });
  if (res.status >= 400) throw new HttpError(res.status);
  return JSON.parse(res.body) as GqlResponse<T>;
}
