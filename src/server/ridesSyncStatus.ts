import type { RideSourceReport, RideSyncSummary } from "@/src/lib/groupRides";
import type { RideSourceIntegration, RideSourceRegistryEntry } from "@/src/lib/rideSources";
import {
  getFirestoreProjectId,
  getFirestoreServiceAccessToken,
  isFirestoreServiceAccountConfigured,
} from "@/src/server/firestoreServiceAccount";

const RIDE_SYNC_STATUS_DOC_PATH = "siteData/rideSyncStatus";

export type RideSyncTrigger = "cron" | "manual" | "unknown";
export type RideSyncRunResult = "success" | "partial" | "failure" | "preview";

export type RideIntegrationStatus = {
  provider: RideSourceIntegration["provider"];
  configuredSourceCount: number;
  fetchedSourceCount: number;
  failedSourceCount: number;
  skippedSourceCount: number;
  status: "ready" | "attention" | "not_configured";
  detail: string;
};

export type RideSyncStatusSnapshot = {
  generatedAt: string;
  lastAttemptedAt: string;
  lastSuccessfulAt: string | null;
  lastResult: RideSyncRunResult;
  trigger: RideSyncTrigger;
  lastError: string | null;
  syncSummary: RideSyncSummary | null;
  sourceReports: RideSourceReport[];
  integrationStatuses: RideIntegrationStatus[];
};

function buildDocumentUrl(projectId: string) {
  return `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${RIDE_SYNC_STATUS_DOC_PATH}`;
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

export function buildRideIntegrationStatuses(sources: RideSourceRegistryEntry[], reports: RideSourceReport[]) {
  const providers: RideSourceIntegration["provider"][] = ["meetup", "strava", "ridewithgps"];

  return providers.map((provider) => {
    const providerSources = sources.filter((source) => source.integration?.provider === provider);
    const providerReports = reports.filter((report) => report.integrationProvider === provider);
    const fetchedSourceCount = providerReports.filter((report) => report.status === "fetched").length;
    const failedSourceCount = providerReports.filter((report) => report.status === "failed").length;
    const skippedSourceCount = providerReports.filter((report) => report.status === "skipped").length;

    let status: RideIntegrationStatus["status"] = "not_configured";
    let detail = "No integration-backed sources are registered.";

    if (providerSources.length > 0) {
      if (fetchedSourceCount > 0 && failedSourceCount === 0) {
        status = "ready";
        detail = `${fetchedSourceCount} source${fetchedSourceCount === 1 ? "" : "s"} fetched successfully.`;
      } else if (fetchedSourceCount > 0 || failedSourceCount > 0) {
        status = "attention";
        detail = `${fetchedSourceCount} fetched, ${failedSourceCount} failed, ${skippedSourceCount} skipped.`;
      } else if (skippedSourceCount > 0) {
        status = "not_configured";
        detail = `${skippedSourceCount} source${skippedSourceCount === 1 ? "" : "s"} waiting on credentials or endpoint config.`;
      } else {
        detail = `${providerSources.length} source${providerSources.length === 1 ? "" : "s"} registered but not yet queried.`;
      }
    }

    return {
      provider,
      configuredSourceCount: providerSources.length,
      fetchedSourceCount,
      failedSourceCount,
      skippedSourceCount,
      status,
      detail,
    } satisfies RideIntegrationStatus;
  });
}

export function buildRideSyncStatusSnapshot(input: {
  generatedAt: string;
  lastAttemptedAt: string;
  lastSuccessfulAt: string | null;
  lastResult: RideSyncRunResult;
  trigger: RideSyncTrigger;
  lastError: string | null;
  syncSummary: RideSyncSummary | null;
  sourceReports: RideSourceReport[];
  sources: RideSourceRegistryEntry[];
}) {
  return {
    generatedAt: input.generatedAt,
    lastAttemptedAt: input.lastAttemptedAt,
    lastSuccessfulAt: input.lastSuccessfulAt,
    lastResult: input.lastResult,
    trigger: input.trigger,
    lastError: input.lastError,
    syncSummary: input.syncSummary,
    sourceReports: input.sourceReports,
    integrationStatuses: buildRideIntegrationStatuses(input.sources, input.sourceReports),
  } satisfies RideSyncStatusSnapshot;
}

export async function getRideSyncStatus() {
  if (!isFirestoreServiceAccountConfigured()) {
    return null;
  }

  try {
    const accessToken = await getFirestoreServiceAccessToken();
    const projectId = getFirestoreProjectId();
    if (!projectId) return null;

    const response = await fetch(buildDocumentUrl(projectId), {
      method: "GET",
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    });

    if (response.status === 404) return null;

    const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    if (!response.ok) throw new Error(parseErrorMessage(payload));

    const fields = payload.fields as Record<string, unknown> | undefined;
    const payloadJson = extractStringField(fields, "payloadJson");
    if (!payloadJson) return null;

    return JSON.parse(payloadJson) as RideSyncStatusSnapshot;
  } catch {
    return null;
  }
}

export async function persistRideSyncStatus(status: RideSyncStatusSnapshot) {
  if (!isFirestoreServiceAccountConfigured()) return false;

  const accessToken = await getFirestoreServiceAccessToken();
  const projectId = getFirestoreProjectId();
  if (!projectId) return false;

  const response = await fetch(buildDocumentUrl(projectId), {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      fields: {
        payloadJson: { stringValue: JSON.stringify(status) },
        generatedAt: { timestampValue: status.generatedAt },
        lastAttemptedAt: { timestampValue: status.lastAttemptedAt },
        lastSuccessfulAt: status.lastSuccessfulAt ? { timestampValue: status.lastSuccessfulAt } : { nullValue: null },
        lastResult: { stringValue: status.lastResult },
        trigger: { stringValue: status.trigger },
        lastError: status.lastError ? { stringValue: status.lastError } : { nullValue: null },
      },
    }),
    cache: "no-store",
  });

  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    throw new Error(parseErrorMessage(payload));
  }

  return true;
}

