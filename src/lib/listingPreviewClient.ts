export type ListingPullResult = {
  listingTitle: string | null;
  listingImageUrl: string | null;
  listingBedrooms: number | null;
  listingBeds: number | null;
  listingBaths: number | null;
};

type ListingPreviewApiPayload = {
  error?: unknown;
  preview?: {
    title?: unknown;
    primaryPhotoUrl?: unknown;
    bedrooms?: unknown;
    beds?: unknown;
    bathrooms?: unknown;
  };
};

type LinkPreviewApiPayload = {
  error?: unknown;
  title?: unknown;
  image?: unknown;
};

function toOptionalString(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function toOptionalNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return null;
}

function asErrorMessage(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

async function pullOgLinkPreview(input: { idToken: string; listingUrl: string }): Promise<ListingPullResult> {
  const response = await fetch("/api/link-preview", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${input.idToken}`,
    },
    body: JSON.stringify({ url: input.listingUrl }),
  });

  const payload = (await response.json().catch(() => ({}))) as LinkPreviewApiPayload;
  if (!response.ok) {
    throw new Error(asErrorMessage(payload.error) ?? "Could not pull listing preview.");
  }

  return {
    listingTitle: toOptionalString(payload.title),
    listingImageUrl: toOptionalString(payload.image),
    listingBedrooms: null,
    listingBeds: null,
    listingBaths: null,
  };
}

export async function pullListingPreview(input: {
  idToken: string;
  listingUrl: string;
  tripId?: string;
}): Promise<ListingPullResult> {
  const body: Record<string, string> = { listingUrl: input.listingUrl };
  if (input.tripId) body.tripId = input.tripId;

  const response = await fetch("/api/listing-preview", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${input.idToken}`,
    },
    body: JSON.stringify(body),
  });

  const payload = (await response.json().catch(() => ({}))) as ListingPreviewApiPayload;
  if (!response.ok) {
    const errorMessage = asErrorMessage(payload.error) ?? "Could not pull listing preview.";
    if (errorMessage.includes("Missing SEARCHAPI_API_KEY")) {
      return pullOgLinkPreview({
        idToken: input.idToken,
        listingUrl: input.listingUrl,
      });
    }
    throw new Error(errorMessage);
  }

  const preview = payload.preview ?? {};
  return {
    listingTitle: toOptionalString(preview.title),
    listingImageUrl: toOptionalString(preview.primaryPhotoUrl),
    listingBedrooms: toOptionalNumber(preview.bedrooms),
    listingBeds: toOptionalNumber(preview.beds),
    listingBaths: toOptionalNumber(preview.bathrooms),
  };
}
