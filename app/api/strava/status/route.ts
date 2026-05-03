import { NextRequest, NextResponse } from "next/server";
import { getUserFields } from "@/src/server/firestoreRest";
import { verifyBearerFirebaseUser } from "@/src/server/firebaseApiAuth";
import {
  getStravaConnectionMetadata,
  isStravaOAuthConfigured,
  parseStoredStravaConnection,
} from "@/src/server/stravaOAuth";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  if (!isStravaOAuthConfigured()) {
    return NextResponse.json({
      configured: false,
      connected: false,
      message: "Strava OAuth env vars are not fully configured.",
    });
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

    return NextResponse.json({
      configured: true,
      connected: Boolean(connection),
      connection: connection ? getStravaConnectionMetadata(connection) : null,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not load Strava status." },
      { status: 500 }
    );
  }
}
