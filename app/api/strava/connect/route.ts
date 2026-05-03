import { NextRequest, NextResponse } from "next/server";
import { verifyBearerFirebaseUser } from "@/src/server/firebaseApiAuth";
import {
  buildStravaAuthorizeUrl,
  createStravaState,
  isStravaOAuthConfigured,
  sealStravaCookiePayload,
} from "@/src/server/stravaOAuth";
import {
  getStravaCookieOptions,
  STRAVA_STATE_COOKIE,
  type StravaOauthStateCookie,
} from "@/src/server/stravaSession";

export const runtime = "nodejs";

type RequestBody = {
  returnTo?: unknown;
};

function getReturnTo(value: unknown) {
  return typeof value === "string" && value.startsWith("/") ? value : "/account";
}

export async function POST(request: NextRequest) {
  if (!isStravaOAuthConfigured()) {
    return NextResponse.json(
      { error: "Strava OAuth is not fully configured on the server." },
      { status: 500 }
    );
  }

  let authContext;
  try {
    authContext = await verifyBearerFirebaseUser(request.headers.get("authorization"));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to verify auth token." },
      { status: 401 }
    );
  }

  let body: RequestBody = {};
  try {
    body = (await request.json()) as RequestBody;
  } catch {
    body = {};
  }

  const state = createStravaState();
  const payload: StravaOauthStateCookie = {
    uid: authContext.uid,
    state,
    returnTo: getReturnTo(body.returnTo),
    createdAt: new Date().toISOString(),
  };

  const response = NextResponse.json({
    ok: true,
    authUrl: buildStravaAuthorizeUrl(state),
  });

  response.cookies.set(
    STRAVA_STATE_COOKIE,
    sealStravaCookiePayload(payload),
    getStravaCookieOptions(15 * 60)
  );

  return response;
}
