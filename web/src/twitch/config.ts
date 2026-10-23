/** This app's Twitch registration (a Public client), used for OAuth and Helix. Not a secret. */
export const TWITCH_CLIENT_ID: string = import.meta.env?.VITE_TWITCH_CLIENT_ID ?? "";

/** Twitch's own web client id; only ever sent to gql.twitch.tv (unofficial playback API). */
export const GQL_CLIENT_ID = "kimne78kx3ncx6brgo4mv6wki5h1ko";

/** The only OAuth scope this app ever requests. */
export const OAUTH_SCOPES = "user:read:follows";
