import { NextRequest, NextResponse } from "next/server";
import {
  getTripCreatedByUid,
  patchTripFields,
  verifyFirebaseIdToken,
} from "@/src/server/firestoreRest";
import { fetchListingPreview } from "@/src/server/listingPreview";

export const runtime = "nodejs";

type RequestBody = {
  tripId?: unknown;
  listingUrl?: unknown;
};

function getBearerToken(authHeader: string | null): string | null {
  if (!authHeader) return null;
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match?.[1]) return null;
  return match[1].trim() || null;
}

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function getConfig() {
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const firebaseApiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  const searchApiKey = process.env.SEARCHAPI_API_KEY;
  const searchApiBaseUrl = process.env.SEARCHAPI_BASE_URL;

  if (!projectId) throw new Error("Missing NEXT_PUBLIC_FIREBASE_PROJECT_ID.");
  if (!firebaseApiKey) throw new Error("Missing NEXT_PUBLIC_FIREBASE_API_KEY.");
  if (!searchApiKey) throw new Error("Missing SEARCHAPI_API_KEY.");

  return {
    projectId,
    firebaseApiKey,
    searchApiKey,
    searchApiBaseUrl,
  };
}

export async function POST(request: NextRequest) {
  const token = getBearerToken(request.headers.get("authorization"));
  if (!token) {
    return NextResponse.json({ error: "Missing Authorization bearer token." }, { status: 401 });
  }

  let body: RequestBody;
  try {
    body = (await request.json()) as RequestBody;
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const tripId = asNonEmptyString(body.tripId);
  const listingUrl = asNonEmptyString(body.listingUrl);
  if (!tripId) return NextResponse.json({ error: "tripId is required." }, { status: 400 });
  if (!listingUrl) return NextResponse.json({ error: "listingUrl is required." }, { status: 400 });

  let config: ReturnType<typeof getConfig>;
  try {
    config = getConfig();
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Server is missing required configuration." },
      { status: 500 }
    );
  }

  let uid: string;
  try {
    uid = await verifyFirebaseIdToken(token, config.firebaseApiKey);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to verify auth token." },
      { status: 401 }
    );
  }

  const ownerUid = await getTripCreatedByUid(config.projectId, tripId);
  if (!ownerUid) {
    return NextResponse.json({ error: "Trip not found." }, { status: 404 });
  }
  if (uid !== ownerUid) {
    return NextResponse.json(
      { error: "Only the trip manager can refresh listing preview data." },
      { status: 403 }
    );
  }

  try {
    const preview = await fetchListingPreview({
      listingUrl,
      searchApiKey: config.searchApiKey,
      searchApiBaseUrl: config.searchApiBaseUrl,
    });

    await patchTripFields({
      projectId: config.projectId,
      tripId,
      idToken: token,
      fields: {
        listingUrl: preview.listingUrl,
        listingPreview: preview,
        listingTitle: preview.title,
        listingImageUrl: preview.primaryPhotoUrl,
        listingBedrooms: preview.bedrooms,
        listingBeds: preview.beds,
        listingBaths: preview.bathrooms,
        listingPreviewUpdatedAt: new Date().toISOString(),
        listingPreviewError: null,
      },
    });

    return NextResponse.json({ ok: true, preview });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Listing preview refresh failed.";

    try {
      await patchTripFields({
        projectId: config.projectId,
        tripId,
        idToken: token,
        fields: {
          listingPreviewError: message,
          listingPreviewUpdatedAt: new Date().toISOString(),
        },
      });
    } catch {
      // Best effort: keep the original provider error in the API response.
    }

    return NextResponse.json({ error: message }, { status: 422 });
  }
}
