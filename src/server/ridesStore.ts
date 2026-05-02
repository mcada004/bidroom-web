import { buildRideDirectorySnapshot, type RideDirectorySnapshot } from "@/src/lib/groupRides";
import {
  getFirestoreProjectId,
  getFirestoreServiceAccessToken,
  isFirestoreServiceAccountConfigured,
} from "@/src/server/firestoreServiceAccount";

const RIDES_DOC_PATH = "siteData/rideDirectory";

function buildDocumentUrl(projectId: string) {
  return `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${RIDES_DOC_PATH}`;
}

function parseErrorMessage(payload: unknown) {
  const asObj = payload as Record<string, unknown> | null;
  const error = asObj?.error as Record<string, unknown> | undefined;
  const message = error?.message;
  return typeof message === "string" && message.trim() ? message : "Firestore request failed.";
}

function extractStringField(fields: Record<string, unknown> | undefined, fieldName: string) {
  const raw = fields?.[fieldName] as Record<string, unknown> | undefined;
  const value = raw?.stringValue;
  return typeof value === "string" ? value : null;
}

export async function getRideDirectorySnapshot() {
  const fallbackSnapshot = buildRideDirectorySnapshot();

  if (!isFirestoreServiceAccountConfigured()) {
    return fallbackSnapshot;
  }

  try {
    const accessToken = await getFirestoreServiceAccessToken();
    const projectId = getFirestoreProjectId();
    if (!projectId) return fallbackSnapshot;

    const response = await fetch(buildDocumentUrl(projectId), {
      method: "GET",
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    });

    if (response.status === 404) return fallbackSnapshot;

    const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    if (!response.ok) throw new Error(parseErrorMessage(payload));

    const fields = payload.fields as Record<string, unknown> | undefined;
    const payloadJson = extractStringField(fields, "payloadJson");
    if (!payloadJson) return fallbackSnapshot;

    const parsed = JSON.parse(payloadJson) as RideDirectorySnapshot;
    if (!parsed || !Array.isArray(parsed.rides) || !Array.isArray(parsed.regions)) {
      return fallbackSnapshot;
    }

    return parsed;
  } catch {
    return fallbackSnapshot;
  }
}

export async function syncRideDirectorySnapshot() {
  if (!isFirestoreServiceAccountConfigured()) {
    return {
      ok: false as const,
      reason: "missing_service_account",
      snapshot: buildRideDirectorySnapshot(),
    };
  }

  const snapshot = buildRideDirectorySnapshot();
  const accessToken = await getFirestoreServiceAccessToken();
  const projectId = getFirestoreProjectId();
  if (!projectId) {
    return {
      ok: false as const,
      reason: "missing_project_id",
      snapshot,
    };
  }

  const response = await fetch(buildDocumentUrl(projectId), {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      fields: {
        payloadJson: { stringValue: JSON.stringify(snapshot) },
        generatedAt: { timestampValue: snapshot.generatedAt },
        rideCount: { integerValue: String(snapshot.rides.length) },
        regionCount: { integerValue: String(snapshot.regions.length) },
      },
    }),
    cache: "no-store",
  });

  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    throw new Error(parseErrorMessage(payload));
  }

  return {
    ok: true as const,
    snapshot,
  };
}
