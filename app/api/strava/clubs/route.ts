import { NextRequest, NextResponse } from "next/server";
import { getUserFields, patchUserFields } from "@/src/server/firestoreRest";
import { verifyBearerFirebaseUser } from "@/src/server/firebaseApiAuth";
import {
  ensureFreshStravaTokens,
  fetchStravaAthleteClubs,
  fetchStravaClubActivities,
  getStravaConnectionMetadata,
  isStravaOAuthConfigured,
  parseStoredStravaConnection,
} from "@/src/server/stravaOAuth";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
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
    if (!connection) {
      return NextResponse.json({ error: "No Strava connection found for this user." }, { status: 404 });
    }

    const tokenState = await ensureFreshStravaTokens(connection);
    if (tokenState.refreshed) {
      await patchUserFields({
        projectId: authContext.config.projectId,
        uid: authContext.uid,
        idToken: authContext.idToken,
        fields: {
          stravaConnection: tokenState.nextConnection,
          updatedAt: new Date(),
        },
      });
    }

    const clubs = await fetchStravaAthleteClubs(tokenState.tokens.accessToken, 12);
    const clubsWithActivities = await Promise.all(
      clubs.slice(0, 6).map(async (club) => {
        try {
          const activities = await fetchStravaClubActivities(tokenState.tokens.accessToken, club.id, 3);
          return { ...club, activities };
        } catch {
          return { ...club, activities: [] };
        }
      })
    );

    return NextResponse.json({
      ok: true,
      connection: getStravaConnectionMetadata(tokenState.nextConnection),
      clubs: clubsWithActivities,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not load Strava club data." },
      { status: 500 }
    );
  }
}
