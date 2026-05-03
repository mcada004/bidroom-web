import { NextRequest, NextResponse } from "next/server";
import { getUserFields, patchUserFields } from "@/src/server/firestoreRest";
import { verifyBearerFirebaseUser } from "@/src/server/firebaseApiAuth";
import {
  deauthorizeStravaConnection,
  ensureFreshStravaTokens,
  isStravaOAuthConfigured,
  parseStoredStravaConnection,
} from "@/src/server/stravaOAuth";
import { STRAVA_RESULT_COOKIE, STRAVA_STATE_COOKIE } from "@/src/server/stravaSession";

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

  try {
    const userFields = await getUserFields({
      projectId: authContext.config.projectId,
      uid: authContext.uid,
      idToken: authContext.idToken,
    });
    const connection = parseStoredStravaConnection(userFields?.stravaConnection ?? null);

    if (connection) {
      try {
        const tokenState = await ensureFreshStravaTokens(connection);
        await deauthorizeStravaConnection(tokenState.tokens.accessToken);
      } catch {
        // Best effort: clear the local connection even if Strava revocation fails.
      }
    }

    await patchUserFields({
      projectId: authContext.config.projectId,
      uid: authContext.uid,
      idToken: authContext.idToken,
      fields: {
        stravaConnection: null,
        updatedAt: new Date(),
      },
    });

    const response = NextResponse.json({ ok: true });
    response.cookies.delete(STRAVA_STATE_COOKIE);
    response.cookies.delete(STRAVA_RESULT_COOKIE);
    return response;
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not disconnect Strava." },
      { status: 500 }
    );
  }
}
