import { getSeedRideRegions, type RideRegionSlug } from "@/src/lib/groupRides";

export type RideSourceParserType = "recurring-page" | "calendar-page" | "shop-event-page" | "community-page";

export type RideSourceRegistryEntry = {
  id: string;
  rideId: string | null;
  regionSlug: RideRegionSlug;
  organizer: string;
  label: string;
  url: string;
  parserType: RideSourceParserType;
  trustLevel: "official" | "community";
};

function inferParserType(sourceType: string): RideSourceParserType {
  const normalized = sourceType.toLowerCase();
  if (normalized.includes("calendar")) return "calendar-page";
  if (normalized.includes("shop")) return "shop-event-page";
  if (normalized.includes("community")) return "community-page";
  return "recurring-page";
}

function inferTrustLevel(sourceType: string): "official" | "community" {
  return sourceType.toLowerCase().includes("community") ? "community" : "official";
}

const extraSourceRegistryEntries: RideSourceRegistryEntry[] = [
  {
    id: "source-bike-east-bay-events",
    rideId: null,
    regionSlug: "bay-area",
    organizer: "Bike East Bay",
    label: "Bike East Bay events hub",
    url: "https://bikeeastbay.org/events/",
    parserType: "calendar-page",
    trustLevel: "official",
  },
  {
    id: "source-la-wheelmen-upcoming-rides",
    rideId: null,
    regionSlug: "los-angeles",
    organizer: "Los Angeles Wheelmen",
    label: "LA Wheelmen upcoming rides",
    url: "https://www.lawheelmen.org/upcoming-rides/",
    parserType: "calendar-page",
    trustLevel: "official",
  },
  {
    id: "source-riverside-bicycle-club-home",
    rideId: null,
    regionSlug: "riverside",
    organizer: "Riverside Bicycle Club",
    label: "Riverside Bicycle Club home",
    url: "https://www.riversidebicycleclub.com/",
    parserType: "calendar-page",
    trustLevel: "official",
  },
];

export function getRideSourceRegistry() {
  const derivedEntries = getSeedRideRegions().flatMap((region) =>
    region.rides.map((ride) => ({
      id: `source-${ride.id}`,
      rideId: ride.id,
      regionSlug: region.slug,
      organizer: ride.organizer,
      label: ride.sourceLabel,
      url: ride.sourceUrl,
      parserType: inferParserType(ride.sourceType),
      trustLevel: inferTrustLevel(ride.sourceType),
    }))
  );

  return [...derivedEntries, ...extraSourceRegistryEntries];
}
