import type { StoredStravaConnection } from "@/src/server/stravaOAuth";

export const STRAVA_STATE_COOKIE = "bidroom_strava_state";
export const STRAVA_RESULT_COOKIE = "bidroom_strava_result";

export type StravaOauthStateCookie = {
  uid: string;
  state: string;
  returnTo: string;
  createdAt: string;
};

export type StravaOauthResultCookie = {
  uid: string;
  connection: StoredStravaConnection;
};

export function getStravaCookieOptions(maxAgeSeconds: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: maxAgeSeconds,
  };
}
