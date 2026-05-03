import { NextRequest, NextResponse } from "next/server";
import { patchUserFields } from "@/src/server/firestoreRest";
import { verifyBearerFirebaseUser } from "@/src/server/firebaseApiAuth";
import {
  getStravaConnectionMetadata,
  isStravaOAuthConfigured,
  unsealStravaCookiePayload,
} from "@/src/server/stravaOAuth";
import {
  STRAVA_RESULT_COOKIE,
  type StravaOauthResultCookie,
} from "@/src/server/stravaSession";

export const runtime = "nodejs";

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

  const sealedResult = request.cookies.get(STRAVA_RESULT_COOKIE)?.value;
  if (!sealedResult) {
    return NextResponse.json({ ok: true, finalized: false, reason: "no_pending_connection" });
  }

  let payload: StravaOauthResultCookie;
  try {
    payload = unsealStravaCookiePayload<StravaOauthResultCookie>(sealedResult);
  } catch {
    const response = NextResponse.json(
      { ok: false, error: "Pending Strava connection data is invalid." },
      { status: 400 }
    );
    response.cookies.delete(STRAVA_RESULT_COOKIE);
    return response;
  }

  if (payload.uid !== authContext.uid) {
    return NextResponse.json({ ok: false, error: "Pending Strava connection belongs to a different user." }, { status: 403 });
  }

  try {
    await patchUserFields({
      projectId: authContext.config.projectId,
      uid: authContext.uid,
      idToken: authContext.idToken,
      fields: {
        stravaConnection: payload.connection,
        updatedAt: new Date(),
      },
    });

    const response = NextResponse.json({
      ok: true,
      finalized: true,
      connection: getStravaConnectionMetadata(payload.connection),
    });
    response.cookies.delete(STRAVA_RESULT_COOKIE);
    return response;
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not save Strava connection." },
      { status: 500 }
    );
  }
}
