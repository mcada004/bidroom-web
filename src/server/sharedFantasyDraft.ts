import {
  getFirestoreProjectId,
  getFirestoreServiceAccessToken,
  isFirestoreServiceAccountConfigured,
} from "@/src/server/firestoreServiceAccount";
import {
  applySharedDraftMutation,
  emptySharedDraftState,
  normalizeSharedDraftState,
  SharedDraftError,
  type SharedDraftMutation,
  type SharedDraftState,
} from "@/src/lib/sharedFantasyDraftState";

export const SHARED_FANTASY_DRAFT_ID = "brian-2026-live";

type FirestoreDocument = {
  fields?: Record<string, unknown>;
  updateTime?: string;
};

type StoredDraft = {
  state: SharedDraftState;
  updateTime: string | null;
};

function parseErrorMessage(payload: unknown) {
  const error = (payload as { error?: { message?: unknown } } | null)?.error;
  return typeof error?.message === "string" && error.message.trim() ? error.message : "Firestore request failed.";
}

function parseErrorStatus(payload: unknown) {
  const error = (payload as { error?: { status?: unknown } } | null)?.error;
  return typeof error?.status === "string" ? error.status : null;
}

function extractStringField(fields: Record<string, unknown> | undefined, fieldName: string) {
  const field = fields?.[fieldName] as { stringValue?: unknown } | undefined;
  return typeof field?.stringValue === "string" ? field.stringValue : null;
}

function buildDocumentUrl(projectId: string) {
  return `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/fantasyDrafts/${SHARED_FANTASY_DRAFT_ID}`;
}

async function getStoreAccess() {
  if (!isFirestoreServiceAccountConfigured()) {
    throw new SharedDraftError("Shared draft storage is not configured.", 503);
  }
  const projectId = getFirestoreProjectId();
  if (!projectId) throw new SharedDraftError("Firebase project ID is not configured.", 503);
  return {
    projectId,
    accessToken: await getFirestoreServiceAccessToken(),
  };
}

async function readStoredDraft(accessToken: string, projectId: string): Promise<StoredDraft> {
  const response = await fetch(buildDocumentUrl(projectId), {
    method: "GET",
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });

  if (response.status === 404) return { state: emptySharedDraftState(), updateTime: null };
  const payload = (await response.json().catch(() => ({}))) as FirestoreDocument;
  if (!response.ok) throw new SharedDraftError(parseErrorMessage(payload), response.status);

  const stateJson = extractStringField(payload.fields, "stateJson");
  if (!stateJson) return { state: emptySharedDraftState(), updateTime: payload.updateTime ?? null };

  try {
    return { state: normalizeSharedDraftState(JSON.parse(stateJson)), updateTime: payload.updateTime ?? null };
  } catch {
    return { state: emptySharedDraftState(), updateTime: payload.updateTime ?? null };
  }
}

export async function getSharedDraftState() {
  const { accessToken, projectId } = await getStoreAccess();
  return (await readStoredDraft(accessToken, projectId)).state;
}

export async function mutateSharedDraftState(mutation: SharedDraftMutation) {
  const { accessToken, projectId } = await getStoreAccess();
  const url = buildDocumentUrl(projectId);

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const stored = await readStoredDraft(accessToken, projectId);
    const next = applySharedDraftMutation(stored.state, mutation);
    const writeUrl = new URL(url);
    writeUrl.searchParams.append("updateMask.fieldPaths", "stateJson");
    writeUrl.searchParams.append("updateMask.fieldPaths", "revision");
    writeUrl.searchParams.append("updateMask.fieldPaths", "updatedAt");
    if (stored.updateTime) writeUrl.searchParams.set("currentDocument.updateTime", stored.updateTime);
    else writeUrl.searchParams.set("currentDocument.exists", "false");

    const response = await fetch(writeUrl.toString(), {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        fields: {
          stateJson: { stringValue: JSON.stringify(next) },
          revision: { integerValue: String(next.revision) },
          updatedAt: { timestampValue: next.updatedAt },
        },
      }),
      cache: "no-store",
    });

    if (response.ok) return next;
    const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    const status = parseErrorStatus(payload);
    if (status === "FAILED_PRECONDITION" || status === "ABORTED" || response.status === 409 || response.status === 412) {
      continue;
    }
    throw new SharedDraftError(parseErrorMessage(payload), response.status);
  }

  throw new SharedDraftError("The board changed at the same moment. Try again.", 409);
}
