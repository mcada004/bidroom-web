import {
  buildRideDirectorySnapshot,
  type DerivedRideListing,
  type RideDirectorySnapshot,
  type RideSourceEvent,
  type RideSourceReport,
  type RideSyncSummary,
} from "@/src/lib/groupRides";
import { getRideSourceRegistry } from "@/src/lib/rideSources";
import {
  getFirestoreProjectId,
  getFirestoreServiceAccessToken,
  isFirestoreServiceAccountConfigured,
} from "@/src/server/firestoreServiceAccount";
import { fetchRideSourceReports } from "@/src/server/rideSourceParser";
import type { RideSourceRegistryEntry } from "@/src/lib/rideSources";
import {
  buildRideSyncStatusSnapshot,
  getRideSyncStatus,
  persistRideSyncStatus,
  type RideSyncTrigger,
} from "@/src/server/ridesSyncStatus";

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

function buildSyncSummary(
  generatedAt: string,
  reports: RideSourceReport[],
  sources: RideSourceRegistryEntry[],
  persisted: boolean
): RideSyncSummary {
  const successfulSourceCount = reports.filter((report) => report.status === "fetched" && report.ok).length;
  const failedSourceCount = reports.filter((report) => report.status === "failed").length;
  const skippedSourceCount = reports.filter((report) => report.status === "skipped").length;
  return {
    generatedAt,
    sourceCount: sources.length,
    crawledSourceCount: sources.filter((source) => source.syncMode === "crawl").length,
    integrationSourceCount: sources.filter((source) => Boolean(source.integration)).length,
    successfulSourceCount,
    failedSourceCount,
    skippedSourceCount,
    persisted,
  };
}

function parseDistanceRange(distance: string) {
  const rangeMatch = distance.match(/(\d{1,3})\s?(?:to|-)\s?(\d{1,3})\s+miles?/i);
  if (rangeMatch) {
    return {
      min: Number(rangeMatch[1]),
      max: Number(rangeMatch[2]),
    };
  }

  const singleMatch = distance.match(/(\d{1,3})\s+miles?/i);
  if (singleMatch) {
    const miles = Number(singleMatch[1]);
    return { min: miles, max: miles };
  }

  return null;
}

function shouldReplaceWithExtractedSchedule(schedule: string) {
  const normalized = schedule.toLowerCase();
  return normalized.includes("see") || normalized.includes("varies") || normalized.includes("check");
}

function shouldReplaceWithExtractedDropPolicy(dropPolicy: string) {
  const normalized = dropPolicy.toLowerCase();
  return normalized.includes("check") || normalized.includes("varies");
}

function getUpcomingSourceDates(report: RideSourceReport, generatedAt: string) {
  return report.detectedDates.filter((dateKey) => dateKey >= generatedAt.slice(0, 10)).slice(0, 12);
}

function formatOccurrenceLabel(dateKey: string) {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(new Date(`${dateKey}T12:00:00Z`));
}

function createSourceDerivedRide(event: RideSourceEvent, generatedAt: string): DerivedRideListing {
  return {
    id: event.id,
    title: event.title,
    organizer: event.organizer,
    regionSlug: event.regionSlug,
    metroArea: event.metroArea,
    sourceType: "Source-derived event",
    sourceLabel: event.sourceLabel,
    sourceUrl: event.sourceUrl,
    cadence: "One-off event",
    schedule: formatOccurrenceLabel(event.dateKey),
    distance: event.distanceLabel,
    distanceMinMiles: event.distanceMiles ? Math.round(event.distanceMiles) : null,
    distanceMaxMiles: event.distanceMiles ? Math.round(event.distanceMiles) : null,
    pace: "Check source",
    terrain: "Check source",
    dropPolicy: event.dropPolicy ?? "Check source",
    startLocation: event.startLocation ?? "Check source",
    access: "Check source",
    summary: event.summary ?? "Imported from a live ride source.",
    notes: "This listing was imported from a source event feed during the latest daily refresh.",
    tags: ["Source-derived", event.metroArea, "Live feed"],
    verifiedOn: generatedAt.slice(0, 10),
    recurrence: {
      kind: "specific-dates",
      dates: [event.dateKey],
    },
    latitude: event.latitude,
    longitude: event.longitude,
    locationPrecision: event.locationPrecision,
    nextOccurrenceDate: event.dateKey,
    nextOccurrenceLabel: formatOccurrenceLabel(event.dateKey),
    upcomingSourceDates: [event.dateKey],
  };
}

function appendSourceDerivedRides(snapshot: RideDirectorySnapshot, reports: RideSourceReport[], generatedAt: string) {
  const existingIds = new Set(snapshot.rides.map((ride) => ride.id));
  const sourceDerivedRides: DerivedRideListing[] = [];

  for (const report of reports) {
    if (report.status !== "fetched" || report.sourceEvents.length === 0) continue;
    for (const event of report.sourceEvents) {
      if (existingIds.has(event.id)) continue;
      existingIds.add(event.id);
      sourceDerivedRides.push(createSourceDerivedRide(event, generatedAt));
    }
  }

  if (sourceDerivedRides.length === 0) {
    return snapshot;
  }

  const regions = snapshot.regions.map((region) => ({
    ...region,
    rides: [
      ...region.rides,
      ...sourceDerivedRides.filter((ride) => ride.regionSlug === region.slug),
    ],
  }));

  return {
    ...snapshot,
    regions,
    rides: [...snapshot.rides, ...sourceDerivedRides],
  };
}

function applySourceReports(snapshot: RideDirectorySnapshot, reports: RideSourceReport[], generatedAt: string) {
  const reportByRideId = new Map<string, RideSourceReport>();
  for (const report of reports) {
    if (!report.rideId || !report.ok || report.status !== "fetched") continue;
    reportByRideId.set(report.rideId, report);
  }

  const verifiedOn = generatedAt.slice(0, 10);

  const rides = snapshot.rides.map((ride) => {
    const report = reportByRideId.get(ride.id);
    if (!report) return ride;

    const nextRide = { ...ride } satisfies DerivedRideListing;
    nextRide.verifiedOn = verifiedOn;
    nextRide.upcomingSourceDates = getUpcomingSourceDates(report, generatedAt);

    if ((!ride.distance || ride.distance.toLowerCase() === "varies") && report.extractedDistance) {
      nextRide.distance = report.extractedDistance;
      const range = parseDistanceRange(report.extractedDistance);
      nextRide.distanceMinMiles = range?.min ?? ride.distanceMinMiles;
      nextRide.distanceMaxMiles = range?.max ?? ride.distanceMaxMiles;
    }

    if (shouldReplaceWithExtractedSchedule(ride.schedule) && report.extractedSchedule) {
      nextRide.schedule = report.extractedSchedule;
    }

    if (shouldReplaceWithExtractedDropPolicy(ride.dropPolicy) && report.extractedDropPolicy) {
      nextRide.dropPolicy = report.extractedDropPolicy;
    }

    if (report.pageTitle && report.pageTitle.length <= 120) {
      nextRide.sourceLabel = report.pageTitle;
    }

    if (nextRide.upcomingSourceDates.length > 0) {
      nextRide.nextOccurrenceDate = nextRide.upcomingSourceDates[0] ?? ride.nextOccurrenceDate;
      nextRide.nextOccurrenceLabel = new Intl.DateTimeFormat("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
      }).format(new Date(`${nextRide.nextOccurrenceDate}T12:00:00Z`));
    }

    if (report.excerpt && ride.notes.length < 140) {
      nextRide.notes = `${ride.notes} Latest source excerpt: ${report.excerpt}`.slice(0, 420);
    }

    return nextRide;
  });

  const enrichedSnapshot = {
    ...snapshot,
    rides,
  };

  return appendSourceDerivedRides(enrichedSnapshot, reports, generatedAt);
}

async function buildLiveSnapshot() {
  const generatedAt = new Date().toISOString();
  const sources = getRideSourceRegistry();
  const reports = await fetchRideSourceReports(sources);

  const provisionalSnapshot = buildRideDirectorySnapshot(new Date(generatedAt), {
    generatedAt,
    sourceReports: reports,
    syncSummary: buildSyncSummary(generatedAt, reports, sources, false),
  });

  const enrichedSnapshot = applySourceReports(provisionalSnapshot, reports, generatedAt);

  return {
    generatedAt,
    reports,
    sources,
    snapshot: enrichedSnapshot,
  };
}

export async function getRideDirectorySnapshot() {
  const fallbackSnapshot = buildRideDirectorySnapshot();

  if (!isFirestoreServiceAccountConfigured()) {
    try {
      const live = await buildLiveSnapshot();
      return live.snapshot;
    } catch {
      return fallbackSnapshot;
    }
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

export async function syncRideDirectorySnapshot(trigger: RideSyncTrigger = "unknown") {
  const live = await buildLiveSnapshot();
  const existingStatus = await getRideSyncStatus();
  const lastAttemptedAt = live.generatedAt;

  if (!isFirestoreServiceAccountConfigured()) {
    return {
      ok: false as const,
      reason: "missing_service_account",
      snapshot: live.snapshot,
    };
  }

  const accessToken = await getFirestoreServiceAccessToken();
  const projectId = getFirestoreProjectId();
  if (!projectId) {
    return {
      ok: false as const,
      reason: "missing_project_id",
      snapshot: live.snapshot,
    };
  }

  const persistedSnapshot: RideDirectorySnapshot = {
    ...live.snapshot,
    syncSummary: buildSyncSummary(live.generatedAt, live.reports, live.sources, true),
  };

  try {
    const response = await fetch(buildDocumentUrl(projectId), {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        fields: {
          payloadJson: { stringValue: JSON.stringify(persistedSnapshot) },
          generatedAt: { timestampValue: live.generatedAt },
          rideCount: { integerValue: String(persistedSnapshot.rides.length) },
          regionCount: { integerValue: String(persistedSnapshot.regions.length) },
          sourceCount: { integerValue: String(live.sources.length) },
          crawledSourceCount: {
            integerValue: String(persistedSnapshot.syncSummary?.crawledSourceCount ?? 0),
          },
          integrationSourceCount: {
            integerValue: String(persistedSnapshot.syncSummary?.integrationSourceCount ?? 0),
          },
          successfulSourceCount: {
            integerValue: String(persistedSnapshot.syncSummary?.successfulSourceCount ?? 0),
          },
          failedSourceCount: {
            integerValue: String(persistedSnapshot.syncSummary?.failedSourceCount ?? 0),
          },
          skippedSourceCount: {
            integerValue: String(persistedSnapshot.syncSummary?.skippedSourceCount ?? 0),
          },
        },
      }),
      cache: "no-store",
    });

    const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    if (!response.ok) {
      throw new Error(parseErrorMessage(payload));
    }

    await persistRideSyncStatus(
      buildRideSyncStatusSnapshot({
        generatedAt: live.generatedAt,
        lastAttemptedAt,
        lastSuccessfulAt: live.generatedAt,
        lastResult: persistedSnapshot.syncSummary && persistedSnapshot.syncSummary.failedSourceCount > 0 ? "partial" : "success",
        trigger,
        lastError: null,
        syncSummary: persistedSnapshot.syncSummary ?? null,
        sourceReports: live.reports,
        sources: live.sources,
      })
    );
  } catch (error) {
    await persistRideSyncStatus(
      buildRideSyncStatusSnapshot({
        generatedAt: new Date().toISOString(),
        lastAttemptedAt,
        lastSuccessfulAt: existingStatus?.lastSuccessfulAt ?? null,
        lastResult: "failure",
        trigger,
        lastError: error instanceof Error ? error.message : "Ride sync failed.",
        syncSummary: live.snapshot.syncSummary ?? null,
        sourceReports: live.reports,
        sources: live.sources,
      })
    ).catch(() => undefined);

    throw error;
  }

  return {
    ok: true as const,
    snapshot: persistedSnapshot,
  };
}
