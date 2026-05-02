import type { RideSourceReport } from "../lib/groupRides.ts";
import type { RideSourceIntegration, RideSourceRegistryEntry } from "../lib/rideSources.ts";

const FETCH_TIMEOUT_MS = 12_000;

type JsonFetchResult =
  | {
      ok: true;
      status: number;
      finalUrl: string;
      payload: unknown;
    }
  | {
      ok: false;
      status: number | null;
      finalUrl: string;
      error: string;
    };

type IntegrationEvent = {
  title: string;
  url: string | null;
  description: string | null;
  dateKey: string | null;
  distanceMiles: number | null;
};

function getEnv(name: string) {
  const value = process.env[name];
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function clipText(value: string | null, maxLength = 260) {
  if (!value) return null;
  const collapsed = value.replace(/\s+/g, " ").trim();
  if (!collapsed) return null;
  return collapsed.slice(0, maxLength);
}

function toDateKey(value: string | null | undefined) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

function formatDistanceMiles(value: number | null) {
  if (value === null || !Number.isFinite(value)) return null;
  const rounded = Math.round(value * 10) / 10;
  return rounded % 1 === 0 ? `${rounded.toFixed(0)} miles` : `${rounded.toFixed(1)} miles`;
}

function summarizeUpcomingDates(dateKeys: string[]) {
  if (dateKeys.length === 0) return null;
  const formatted = dateKeys.slice(0, 3).map((dateKey) =>
    new Intl.DateTimeFormat("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
    }).format(new Date(`${dateKey}T12:00:00Z`))
  );
  return `Upcoming dates: ${formatted.join(", ")}`;
}

async function fetchJson(url: string, init: RequestInit) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      ...init,
      cache: "no-store",
      redirect: "follow",
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      return {
        ok: false as const,
        status: response.status,
        finalUrl: response.url || url,
        error: typeof payload === "object" && payload && "message" in payload ? String(payload.message) : `Remote server returned ${response.status}.`,
      } satisfies JsonFetchResult;
    }

    return {
      ok: true as const,
      status: response.status,
      finalUrl: response.url || url,
      payload,
    } satisfies JsonFetchResult;
  } catch (error) {
    return {
      ok: false as const,
      status: null,
      finalUrl: url,
      error: error instanceof Error ? error.message : "Request failed.",
    } satisfies JsonFetchResult;
  } finally {
    clearTimeout(timeout);
  }
}

function buildBaseReport(
  source: RideSourceRegistryEntry,
  fetchedAt: string,
  integrationProvider: RideSourceIntegration["provider"]
) {
  return {
    sourceId: source.id,
    rideId: source.rideId,
    label: source.label,
    url: source.url,
    finalUrl: null,
    parserType: source.parserType,
    parserStrategy: `${integrationProvider}-integration`,
    syncMode: source.syncMode,
    transport: "integration" as const,
    integrationProvider,
    fetchedAt,
    httpStatus: null,
    pageTitle: null,
    pageDescription: null,
    excerpt: null,
    extractedSchedule: null,
    extractedDistance: null,
    extractedDropPolicy: null,
    detectedEventCount: 0,
    detectedDates: [],
    contentHash: null,
    error: null,
    skippedReason: null,
  };
}

function buildSkippedReport(
  source: RideSourceRegistryEntry,
  fetchedAt: string,
  integrationProvider: RideSourceIntegration["provider"],
  reason: string
): RideSourceReport {
  return {
    ...buildBaseReport(source, fetchedAt, integrationProvider),
    status: "skipped",
    ok: true,
    skippedReason: reason,
  };
}

function buildFailureReport(
  source: RideSourceRegistryEntry,
  fetchedAt: string,
  integrationProvider: RideSourceIntegration["provider"],
  message: string,
  finalUrl: string,
  httpStatus: number | null
): RideSourceReport {
  return {
    ...buildBaseReport(source, fetchedAt, integrationProvider),
    finalUrl,
    httpStatus,
    status: "failed",
    ok: false,
    error: message,
  };
}

function buildSuccessReport(
  source: RideSourceRegistryEntry,
  fetchedAt: string,
  integrationProvider: RideSourceIntegration["provider"],
  finalUrl: string,
  httpStatus: number,
  pageTitle: string,
  pageDescription: string | null,
  events: IntegrationEvent[],
  excerpt: string | null
): RideSourceReport {
  const dateKeys = [...new Set(events.map((event) => event.dateKey).filter((dateKey): dateKey is string => Boolean(dateKey)))].sort();
  const firstDistance = events.find((event) => event.distanceMiles !== null)?.distanceMiles ?? null;

  return {
    ...buildBaseReport(source, fetchedAt, integrationProvider),
    finalUrl,
    httpStatus,
    status: "fetched",
    ok: true,
    pageTitle,
    pageDescription,
    excerpt,
    extractedSchedule: summarizeUpcomingDates(dateKeys),
    extractedDistance: formatDistanceMiles(firstDistance),
    detectedEventCount: events.length,
    detectedDates: dateKeys,
  };
}

async function fetchMeetupReport(source: RideSourceRegistryEntry, integration: Extract<RideSourceIntegration, { provider: "meetup" }>, fetchedAt: string) {
  const accessToken = getEnv(integration.accessTokenEnv);
  const networkUrlname = getEnv(integration.networkUrlnameEnv);

  if (!accessToken || !networkUrlname) {
    return buildSkippedReport(
      source,
      fetchedAt,
      "meetup",
      "Meetup integration is configured in code but requires a Pro network urlname and access token env var."
    );
  }

  const query = `
    query ($urlname: ID!, $itemsNum: Int!) {
      proNetwork(urlname: $urlname) {
        name
        eventsSearch(input: { first: $itemsNum, filter: { status: "UPCOMING" } }) {
          edges {
            node {
              id
              title
              eventUrl
              description
              dateTime
            }
          }
        }
      }
    }
  `;

  const response = await fetchJson("https://api.meetup.com/gql-ext", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query,
      variables: {
        urlname: networkUrlname,
        itemsNum: integration.maxEvents ?? 8,
      },
    }),
  });

  if (!response.ok) {
    return buildFailureReport(source, fetchedAt, "meetup", response.error, response.finalUrl, response.status);
  }

  const payload = response.payload as Record<string, unknown> | null;
  const data = payload?.data as Record<string, unknown> | undefined;
  const proNetwork = data?.proNetwork as Record<string, unknown> | undefined;
  const eventsSearch = proNetwork?.eventsSearch as Record<string, unknown> | undefined;
  const edges = Array.isArray(eventsSearch?.edges) ? eventsSearch.edges : [];
  const events = edges
    .map((edge): IntegrationEvent | null => {
      const node = (edge as Record<string, unknown>)?.node as Record<string, unknown> | undefined;
      if (!node) return null;
      return {
        title: typeof node.title === "string" ? node.title : source.label,
        url: typeof node.eventUrl === "string" ? node.eventUrl : null,
        description: typeof node.description === "string" ? clipText(node.description, 220) : null,
        dateKey: toDateKey(typeof node.dateTime === "string" ? node.dateTime : null),
        distanceMiles: null,
      } satisfies IntegrationEvent;
    })
    .filter((event): event is IntegrationEvent => Boolean(event));

  return buildSuccessReport(
    source,
    fetchedAt,
    "meetup",
    response.finalUrl,
    response.status,
    typeof proNetwork?.name === "string" ? `${proNetwork.name} via Meetup API` : `${source.label} via Meetup API`,
    "Authenticated Meetup Pro network events feed.",
    events,
    clipText(events[0]?.description ?? source.notes ?? "Authenticated Meetup events feed.")
  );
}

async function fetchStravaReport(source: RideSourceRegistryEntry, integration: Extract<RideSourceIntegration, { provider: "strava" }>, fetchedAt: string) {
  const accessToken = getEnv(integration.accessTokenEnv);
  const clubId = getEnv(integration.clubIdEnv);

  if (!accessToken || !clubId) {
    return buildSkippedReport(
      source,
      fetchedAt,
      "strava",
      "Strava integration requires a club id env var and an OAuth access token."
    );
  }

  const headers = {
    Authorization: `Bearer ${accessToken}`,
  };

  const [clubResponse, activitiesResponse] = await Promise.all([
    fetchJson(`https://www.strava.com/api/v3/clubs/${clubId}`, { headers }),
    fetchJson(`https://www.strava.com/api/v3/clubs/${clubId}/activities?per_page=${integration.maxActivities ?? 8}`, {
      headers,
    }),
  ]);

  if (!clubResponse.ok) {
    return buildFailureReport(source, fetchedAt, "strava", clubResponse.error, clubResponse.finalUrl, clubResponse.status);
  }

  if (!activitiesResponse.ok) {
    return buildFailureReport(
      source,
      fetchedAt,
      "strava",
      activitiesResponse.error,
      activitiesResponse.finalUrl,
      activitiesResponse.status
    );
  }

  const club = clubResponse.payload as Record<string, unknown> | null;
  const activities = Array.isArray(activitiesResponse.payload) ? activitiesResponse.payload : [];
  const events: IntegrationEvent[] = activities
    .map((entry) => {
      const activity = entry as Record<string, unknown>;
      const distanceMeters = typeof activity.distance === "number" ? activity.distance : null;
      return {
        title: typeof activity.name === "string" ? activity.name : source.label,
        url: typeof activity.id === "number" ? `https://www.strava.com/activities/${activity.id}` : null,
        description: typeof activity.sport_type === "string" ? `${activity.sport_type} activity` : "Recent club activity",
        dateKey: toDateKey(
          typeof activity.start_date_local === "string"
            ? activity.start_date_local
            : typeof activity.start_date === "string"
              ? activity.start_date
              : null
        ),
        distanceMiles: distanceMeters === null ? null : distanceMeters / 1609.344,
      } satisfies IntegrationEvent;
    })
    .filter((event) => Boolean(event.dateKey));

  return buildSuccessReport(
    source,
    fetchedAt,
    "strava",
    clubResponse.finalUrl,
    clubResponse.status,
    typeof club?.name === "string" ? `${club.name} via Strava API` : `${source.label} via Strava API`,
    typeof club?.description === "string" ? clipText(club.description) : "Authenticated Strava club feed.",
    events,
    clipText(typeof club?.description === "string" ? club.description : source.notes ?? "Authenticated Strava club feed.")
  );
}

function collectRwgpsEvents(value: unknown): IntegrationEvent[] {
  if (Array.isArray(value)) {
    return value.flatMap((entry) => collectRwgpsEvents(entry));
  }

  if (!value || typeof value !== "object") return [];
  const record = value as Record<string, unknown>;

  const nestedKeys = ["events", "data", "results", "items"];
  for (const key of nestedKeys) {
    if (key in record) {
      const nested = collectRwgpsEvents(record[key]);
      if (nested.length > 0) return nested;
    }
  }

  const candidateTitle =
    typeof record.title === "string"
      ? record.title
      : typeof record.name === "string"
        ? record.name
        : null;
  const candidateDate =
    toDateKey(typeof record.date === "string" ? record.date : null) ??
    toDateKey(typeof record.start_date === "string" ? record.start_date : null) ??
    toDateKey(typeof record.starts_at === "string" ? record.starts_at : null) ??
    toDateKey(typeof record.start_at === "string" ? record.start_at : null) ??
    toDateKey(typeof record.begins_at === "string" ? record.begins_at : null);

  if (candidateTitle || candidateDate) {
    return [
      {
        title: candidateTitle ?? "Ride with GPS event",
        url:
          typeof record.url === "string"
            ? record.url
            : typeof record.event_url === "string"
              ? record.event_url
              : typeof record.id === "number"
                ? `https://ridewithgps.com/events/${record.id}`
                : null,
        description:
          typeof record.description === "string"
            ? clipText(record.description, 220)
            : typeof record.summary === "string"
              ? clipText(record.summary, 220)
              : null,
        dateKey: candidateDate,
        distanceMiles:
          typeof record.distance_miles === "number"
            ? record.distance_miles
            : typeof record.distance === "number"
              ? record.distance
              : null,
      },
    ];
  }

  return [];
}

async function fetchRwgpsReport(source: RideSourceRegistryEntry, integration: Extract<RideSourceIntegration, { provider: "ridewithgps" }>, fetchedAt: string) {
  const apiKey = getEnv(integration.apiKeyEnv);
  const eventsUrl = getEnv(integration.eventsUrlEnv);
  const accessToken = integration.accessTokenEnv ? getEnv(integration.accessTokenEnv) : null;
  const authToken = integration.authTokenEnv ? getEnv(integration.authTokenEnv) : null;

  if (!apiKey || !eventsUrl || (!accessToken && !authToken)) {
    return buildSkippedReport(
      source,
      fetchedAt,
      "ridewithgps",
      "Ride with GPS integration requires an API key, a live events endpoint URL, and either a bearer token or auth token."
    );
  }

  const headers: Record<string, string> = {
    "x-rwgps-api-key": apiKey,
    Accept: "application/json",
  };

  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  } else if (authToken) {
    headers["x-rwgps-auth-token"] = authToken;
  }

  const response = await fetchJson(eventsUrl, { headers });
  if (!response.ok) {
    return buildFailureReport(
      source,
      fetchedAt,
      "ridewithgps",
      response.error,
      response.finalUrl,
      response.status
    );
  }

  const events = collectRwgpsEvents(response.payload).slice(0, integration.maxEvents ?? 10);
  return buildSuccessReport(
    source,
    fetchedAt,
    "ridewithgps",
    response.finalUrl,
    response.status,
    `${source.label} via Ride with GPS API`,
    "Authenticated Ride with GPS events feed.",
    events,
    clipText(events[0]?.description ?? source.notes ?? "Authenticated Ride with GPS events feed.")
  );
}

export async function fetchIntegrationRideSourceReport(source: RideSourceRegistryEntry): Promise<RideSourceReport | null> {
  if (!source.integration) return null;

  const fetchedAt = new Date().toISOString();

  switch (source.integration.provider) {
    case "meetup":
      return fetchMeetupReport(source, source.integration, fetchedAt);
    case "strava":
      return fetchStravaReport(source, source.integration, fetchedAt);
    case "ridewithgps":
      return fetchRwgpsReport(source, source.integration, fetchedAt);
    default:
      return null;
  }
}
