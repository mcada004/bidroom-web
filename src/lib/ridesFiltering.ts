import { rideOccursOnDateKey, type DerivedRideListing, type RideDirectorySnapshot, type RideRegionSlug } from "@/src/lib/groupRides";

export type RideFilters = {
  region: "all" | RideRegionSlug;
  date: string;
  minMileage: string;
  maxMileage: string;
};

export type RideRegionOption = {
  slug: "all" | RideRegionSlug;
  label: string;
};

export function getRideRegionOptions(snapshot: RideDirectorySnapshot): RideRegionOption[] {
  return [
    { slug: "all", label: "All regions" },
    ...snapshot.regions.map((region) => ({ slug: region.slug, label: region.label })),
  ];
}

export function matchesDateFilter(ride: DerivedRideListing, dateValue: string) {
  if (!dateValue) return true;
  return rideOccursOnDateKey(ride, dateValue);
}

export function matchesMileageFilter(ride: DerivedRideListing, minMileage: string, maxMileage: string) {
  const min = Number(minMileage);
  const max = Number(maxMileage);
  const hasMin = Number.isFinite(min) && minMileage.trim() !== "";
  const hasMax = Number.isFinite(max) && maxMileage.trim() !== "";

  if (!hasMin && !hasMax) return true;
  if (ride.distanceMinMiles === null && ride.distanceMaxMiles === null) return false;

  const rideMin = ride.distanceMinMiles ?? ride.distanceMaxMiles ?? 0;
  const rideMax = ride.distanceMaxMiles ?? ride.distanceMinMiles ?? 0;

  if (hasMin && rideMax < min) return false;
  if (hasMax && rideMin > max) return false;
  return true;
}

export function filterRides(snapshot: RideDirectorySnapshot, filters: RideFilters) {
  return snapshot.rides.filter((ride) => {
    if (filters.region !== "all" && ride.regionSlug !== filters.region) return false;
    if (!matchesDateFilter(ride, filters.date)) return false;
    if (!matchesMileageFilter(ride, filters.minMileage, filters.maxMileage)) return false;
    return true;
  });
}
