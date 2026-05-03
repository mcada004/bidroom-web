import { NextRequest, NextResponse } from "next/server";
import {
  buildStoredStravaConnection,
  exchangeStravaAuthorizationCode,
  isStravaOAuthConfigured,
  sealStravaCookiePayload,
  unsealStravaCookiePayload,
} from "@/src/server/stravaOAuth";
import {
  getStravaCookieOptions,
  STRAVA_RESULT_COOKIE,
  STRAVA_STATE_COOKIE,
  type StravaOauthResultCookie,
  type StravaOauthStateCookie,
} from "@/src/server/stravaSession";

export const runtime = "nodejs";

function buildRedirectUrl(request: NextRequest, returnTo: string, params: Record<string, string>) {
  const url = new URL(returnTo, request.url);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return url;
}

export async function GET(request: NextRequest) {
  const fallbackRedirect = buildRedirectUrl(request, "/account", {
    strava: "error",
    message: "missing_state",
  });

  if (!isStravaOAuthConfigured()) {
    return NextResponse.redirect(
      buildRedirectUrl(request, "/account", {
        strava: "error",
        message: "missing_server_config",
      })
    );
  }

  const sealedState = request.cookies.get(STRAVA_STATE_COOKIE)?.value;
  if (!sealedState) {
    return NextResponse.redirect(fallbackRedirect);
  }

  let statePayload: StravaOauthStateCookie;
  try {
    statePayload = unsealStravaCookiePayload<StravaOauthStateCookie>(sealedState);
  } catch {
    const response = NextResponse.redirect(fallbackRedirect);
    response.cookies.delete(STRAVA_STATE_COOKIE);
    return response;
  }

  const returnTo = statePayload.returnTo || "/account";
  const clearAndRedirect = (params: Record<string, string>) => {
    const response = NextResponse.redirect(buildRedirectUrl(request, returnTo, params));
    response.cookies.delete(STRAVA_STATE_COOKIE);
    return response;
  };

  const incomingState = request.nextUrl.searchParams.get("state");
  if (!incomingState || incomingState !== statePayload.state) {
    return clearAndRedirect({
      strava: "error",
      message: "state_mismatch",
    });
  }

  const denied = request.nextUrl.searchParams.get("error");
  if (denied) {
    return clearAndRedirect({
      strava: "error",
      message: denied,
    });
  }

  const code = request.nextUrl.searchParams.get("code");
  if (!code) {
    return clearAndRedirect({
      strava: "error",
      message: "missing_code",
    });
  }

  try {
    const acceptedScope = request.nextUrl.searchParams.get("scope") ?? "";
    const scopes = acceptedScope
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
    const connectedAt = new Date().toISOString();
    const result = await exchangeStravaAuthorizationCode(code);
    const connection = buildStoredStravaConnection({
      athlete: result.athlete,
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      expiresAt: result.expiresAt,
      scopes,
      connectedAt,
    });

    const response = NextResponse.redirect(
      buildRedirectUrl(request, returnTo, {
        strava: "connected",
      })
    );
    response.cookies.delete(STRAVA_STATE_COOKIE);
    response.cookies.set(
      STRAVA_RESULT_COOKIE,
      sealStravaCookiePayload({
        uid: statePayload.uid,
        connection,
      } satisfies StravaOauthResultCookie),
      getStravaCookieOptions(15 * 60)
    );
    return response;
  } catch (error) {
    return clearAndRedirect({
      strava: "error",
      message: error instanceof Error ? error.message : "oauth_exchange_failed",
    });
  }
}
