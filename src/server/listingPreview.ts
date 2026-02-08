export type ListingPlatform = "airbnb" | "vrbo";

export type ParsedListingUrl = {
  platform: ListingPlatform;
  canonicalUrl: string;
  listingId: string | null;
};

export type ListingPreview = {
  provider: "searchapi";
  platform: ListingPlatform;
  listingId: string | null;
  listingUrl: string;
  sourceUrl: string | null;
  title: string | null;
  bedrooms: number | null;
  beds: number | null;
  bathrooms: number | null;
  primaryPhotoUrl: string | null;
  refreshedAt: string;
};

type FetchLike = typeof fetch;

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const matched = value.match(/-?\d+(\.\d+)?/);
    if (!matched) return null;
    const parsed = Number(matched[0]);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function normalizeUrl(input: string): string {
  const parsed = new URL(input);
  parsed.hash = "";
  return parsed.toString();
}

function parseAirbnbListingId(parsed: URL): string | null {
  const fromQuery = parsed.searchParams.get("listing_id");
  if (fromQuery && /^\d+$/.test(fromQuery)) return fromQuery;

  const roomMatch = parsed.pathname.match(/\/rooms\/(\d+)/i);
  if (roomMatch?.[1]) return roomMatch[1];

  return null;
}

function parseVrboListingId(parsed: URL): string | null {
  const queryKeys = ["unitId", "propertyId", "listingId", "pid"];
  for (const key of queryKeys) {
    const value = parsed.searchParams.get(key);
    if (value && /^\d+$/.test(value)) return value;
  }

  const haMatch = parsed.pathname.match(/\/(\d+)(?:\.ha|ha)(?:\/|$)/i);
  if (haMatch?.[1]) return haMatch[1];

  const segments = parsed.pathname.split("/").filter(Boolean);
  for (let i = segments.length - 1; i >= 0; i -= 1) {
    const segment = segments[i];
    if (/^\d+$/.test(segment)) return segment;
  }

  return null;
}

export function parseListingUrl(listingUrl: string): ParsedListingUrl {
  let parsed: URL;
  try {
    parsed = new URL(listingUrl);
  } catch {
    throw new Error("Listing URL must be a valid http(s) URL.");
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Listing URL must start with http:// or https://.");
  }

  const host = parsed.hostname.toLowerCase();
  if (host.includes("airbnb.")) {
    return {
      platform: "airbnb",
      canonicalUrl: normalizeUrl(parsed.toString()),
      listingId: parseAirbnbListingId(parsed),
    };
  }

  if (host.includes("vrbo.")) {
    return {
      platform: "vrbo",
      canonicalUrl: normalizeUrl(parsed.toString()),
      listingId: parseVrboListingId(parsed),
    };
  }

  throw new Error("Only Airbnb and Vrbo listing URLs are currently supported.");
}

function pickPrimaryPhoto(value: unknown): string | null {
  if (Array.isArray(value)) {
    for (const item of value) {
      const asString = asNonEmptyString(item);
      if (asString) return asString;
      if (item && typeof item === "object") {
        const candidate =
          asNonEmptyString((item as Record<string, unknown>).url) ??
          asNonEmptyString((item as Record<string, unknown>).image) ??
          asNonEmptyString((item as Record<string, unknown>).src);
        if (candidate) return candidate;
      }
    }
  }
  return asNonEmptyString(value);
}

function pickVrboProperty(properties: unknown[], parsed: ParsedListingUrl): Record<string, unknown> | null {
  const normalizedInputUrl = parsed.canonicalUrl.replace(/\/$/, "").toLowerCase();

  for (const row of properties) {
    if (!row || typeof row !== "object") continue;
    const obj = row as Record<string, unknown>;
    const link =
      asNonEmptyString(obj.link) ??
      asNonEmptyString(obj.url) ??
      asNonEmptyString(obj.property_url) ??
      asNonEmptyString(obj.listing_url);
    if (!link) continue;

    if (parsed.listingId && link.includes(parsed.listingId)) return obj;

    const normalizedLink = link.replace(/\/$/, "").toLowerCase();
    if (normalizedLink === normalizedInputUrl) return obj;
  }

  for (const row of properties) {
    if (row && typeof row === "object") return row as Record<string, unknown>;
  }

  return null;
}

function toPreviewBase(parsed: ParsedListingUrl): Omit<ListingPreview, "title" | "bedrooms" | "beds" | "bathrooms" | "primaryPhotoUrl" | "sourceUrl"> {
  return {
    provider: "searchapi",
    platform: parsed.platform,
    listingId: parsed.listingId,
    listingUrl: parsed.canonicalUrl,
    refreshedAt: new Date().toISOString(),
  };
}

export function extractAirbnbPreviewFromResponse(
  payload: unknown,
  parsed: ParsedListingUrl
): ListingPreview {
  const asObj = payload as Record<string, unknown> | null;
  const details =
    (asObj?.property_details as Record<string, unknown> | undefined) ??
    ((asObj?.data as Record<string, unknown> | undefined)?.property_details as
      | Record<string, unknown>
      | undefined);

  if (!details) {
    throw new Error("SearchAPI Airbnb response did not include property_details.");
  }

  const images = details.images;
  const preview: ListingPreview = {
    ...toPreviewBase(parsed),
    sourceUrl:
      asNonEmptyString(details.link) ??
      asNonEmptyString(details.url) ??
      parsed.canonicalUrl,
    title: asNonEmptyString(details.name) ?? asNonEmptyString(details.title),
    bedrooms: asNumber(details.number_of_bedrooms) ?? asNumber(details.bedrooms),
    beds: asNumber(details.number_of_beds) ?? asNumber(details.beds),
    bathrooms: asNumber(details.number_of_bathrooms) ?? asNumber(details.bathrooms),
    primaryPhotoUrl:
      pickPrimaryPhoto(images) ??
      asNonEmptyString(details.image) ??
      asNonEmptyString(details.thumbnail),
  };

  return preview;
}

export function extractVrboPreviewFromResponse(
  payload: unknown,
  parsed: ParsedListingUrl
): ListingPreview {
  const asObj = payload as Record<string, unknown> | null;
  const rows =
    (Array.isArray(asObj?.properties) ? asObj?.properties : null) ??
    (Array.isArray(asObj?.results) ? asObj?.results : null) ??
    (Array.isArray((asObj?.data as Record<string, unknown> | undefined)?.properties)
      ? ((asObj?.data as Record<string, unknown> | undefined)?.properties as unknown[])
      : null);

  if (!rows || rows.length === 0) {
    throw new Error("SearchAPI Vrbo response did not include any properties.");
  }

  const selected = pickVrboProperty(rows, parsed);
  if (!selected) {
    throw new Error("Unable to choose a Vrbo property from SearchAPI results.");
  }

  const preview: ListingPreview = {
    ...toPreviewBase(parsed),
    sourceUrl:
      asNonEmptyString(selected.link) ??
      asNonEmptyString(selected.url) ??
      asNonEmptyString(selected.property_url) ??
      parsed.canonicalUrl,
    title: asNonEmptyString(selected.name) ?? asNonEmptyString(selected.title),
    bedrooms: asNumber(selected.bedrooms),
    beds: asNumber(selected.beds),
    bathrooms: asNumber(selected.bathrooms),
    primaryPhotoUrl:
      pickPrimaryPhoto(selected.images) ??
      asNonEmptyString(selected.image) ??
      asNonEmptyString(selected.thumbnail),
  };

  return preview;
}

async function searchApiGet(
  fetchImpl: FetchLike,
  baseUrl: string,
  apiKey: string,
  params: Record<string, string>
): Promise<Record<string, unknown>> {
  const url = new URL("/api/v1/search", baseUrl);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  url.searchParams.set("api_key", apiKey);

  const response = await fetchImpl(url.toString(), {
    method: "GET",
    headers: { Accept: "application/json" },
    cache: "no-store",
  });

  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    const errorMessage = asNonEmptyString(payload.error) ?? `SearchAPI request failed (${response.status}).`;
    throw new Error(errorMessage);
  }

  if (asNonEmptyString(payload.error)) {
    throw new Error(asNonEmptyString(payload.error) ?? "SearchAPI returned an error.");
  }

  return payload;
}

export async function fetchListingPreview(input: {
  listingUrl: string;
  searchApiKey: string;
  searchApiBaseUrl?: string;
  fetchImpl?: FetchLike;
}): Promise<ListingPreview> {
  const parsed = parseListingUrl(input.listingUrl);
  const apiKey = input.searchApiKey.trim();
  if (!apiKey) throw new Error("Missing SEARCHAPI_API_KEY.");

  const baseUrl = input.searchApiBaseUrl?.trim() || "https://www.searchapi.io";
  const fetchImpl = input.fetchImpl ?? fetch;

  if (parsed.platform === "airbnb") {
    if (!parsed.listingId) {
      throw new Error("Could not extract an Airbnb room ID from the URL.");
    }

    const payload = await searchApiGet(fetchImpl, baseUrl, apiKey, {
      engine: "airbnb_property",
      property_id: parsed.listingId,
    });

    return extractAirbnbPreviewFromResponse(payload, parsed);
  }

  const queryCandidates = [parsed.listingId, parsed.canonicalUrl].filter(
    (value): value is string => !!value
  );

  let lastError: Error | null = null;
  for (const query of queryCandidates) {
    try {
      const payload = await searchApiGet(fetchImpl, baseUrl, apiKey, {
        engine: "vrbo",
        q: query,
      });
      return extractVrboPreviewFromResponse(payload, parsed);
    } catch (error) {
      lastError = error as Error;
    }
  }

  throw lastError ?? new Error("Unable to retrieve Vrbo preview data.");
}
