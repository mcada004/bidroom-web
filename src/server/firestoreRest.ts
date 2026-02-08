type FirestoreValue =
  | { nullValue: null }
  | { stringValue: string }
  | { booleanValue: boolean }
  | { integerValue: string }
  | { doubleValue: number }
  | { timestampValue: string }
  | { arrayValue: { values: FirestoreValue[] } }
  | { mapValue: { fields: Record<string, FirestoreValue> } };

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

export function toFirestoreValue(value: unknown): FirestoreValue {
  if (value === null) return { nullValue: null };
  if (typeof value === "string") return { stringValue: value };
  if (typeof value === "boolean") return { booleanValue: value };
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error("Cannot encode non-finite number for Firestore.");
    }
    return Number.isInteger(value)
      ? { integerValue: String(value) }
      : { doubleValue: value };
  }
  if (value instanceof Date) return { timestampValue: value.toISOString() };
  if (Array.isArray(value)) {
    return { arrayValue: { values: value.map((item) => toFirestoreValue(item)) } };
  }
  if (isPlainObject(value)) {
    const fields: Record<string, FirestoreValue> = {};
    for (const [key, nested] of Object.entries(value)) {
      if (nested === undefined) continue;
      fields[key] = toFirestoreValue(nested);
    }
    return { mapValue: { fields } };
  }

  throw new Error("Unsupported value type for Firestore encoding.");
}

function buildTripDocumentPath(projectId: string, tripId: string): string {
  return `projects/${projectId}/databases/(default)/documents/trips/${tripId}`;
}

function parseErrorMessage(payload: unknown): string {
  const asObj = payload as Record<string, unknown> | null;
  const error = asObj?.error as Record<string, unknown> | undefined;
  const message = error?.message;
  return typeof message === "string" && message.trim() ? message : "Firestore request failed.";
}

export async function verifyFirebaseIdToken(
  idToken: string,
  firebaseApiKey: string
): Promise<string> {
  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(
      firebaseApiKey
    )}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken }),
      cache: "no-store",
    }
  );

  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    const message =
      (payload?.error as Record<string, unknown> | undefined)?.message ??
      "Unable to verify authentication token.";
    throw new Error(typeof message === "string" ? message : "Unable to verify authentication token.");
  }

  const users = payload.users;
  if (!Array.isArray(users) || users.length === 0 || !users[0] || typeof users[0] !== "object") {
    throw new Error("Auth token did not map to a Firebase user.");
  }

  const uid = (users[0] as Record<string, unknown>).localId;
  if (typeof uid !== "string" || !uid.trim()) {
    throw new Error("Unable to resolve user ID from auth token.");
  }

  return uid;
}

export async function getTripCreatedByUid(projectId: string, tripId: string): Promise<string | null> {
  const documentPath = buildTripDocumentPath(projectId, tripId);
  const url = `https://firestore.googleapis.com/v1/${documentPath}`;
  const response = await fetch(url, { method: "GET", cache: "no-store" });

  if (response.status === 404) return null;

  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) throw new Error(parseErrorMessage(payload));

  const fields = payload.fields as Record<string, unknown> | undefined;
  const createdByUid = (fields?.createdByUid as Record<string, unknown> | undefined)?.stringValue;
  return typeof createdByUid === "string" ? createdByUid : null;
}

export async function patchTripFields(input: {
  projectId: string;
  tripId: string;
  idToken: string;
  fields: Record<string, unknown>;
}): Promise<void> {
  const documentPath = buildTripDocumentPath(input.projectId, input.tripId);
  const url = new URL(`https://firestore.googleapis.com/v1/${documentPath}`);

  const firestoreFields: Record<string, FirestoreValue> = {};
  for (const [fieldPath, rawValue] of Object.entries(input.fields)) {
    if (rawValue === undefined) continue;
    url.searchParams.append("updateMask.fieldPaths", fieldPath);
    firestoreFields[fieldPath] = toFirestoreValue(rawValue);
  }

  const response = await fetch(url.toString(), {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${input.idToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ fields: firestoreFields }),
    cache: "no-store",
  });

  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    throw new Error(parseErrorMessage(payload));
  }
}
