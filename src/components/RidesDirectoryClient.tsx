"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  rideOccursOnDateKey,
  type DerivedRideListing,
  type RideDirectorySnapshot,
  type RideRegionSlug,
} from "@/src/lib/groupRides";

type Props = {
  snapshot: RideDirectorySnapshot;
};

type RegionOption = {
  slug: "all" | RideRegionSlug;
  label: string;
};

function weekdayName(dateValue: string) {
  return new Intl.DateTimeFormat("en-US", { weekday: "long" }).format(new Date(`${dateValue}T12:00:00Z`));
}

function formatGeneratedAt(dateValue: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(dateValue));
}

function formatDateForInput(value: string) {
  return value;
}

function matchesDateFilter(ride: DerivedRideListing, dateValue: string) {
  if (!dateValue) return true;
  return rideOccursOnDateKey(ride, dateValue);
}

function matchesMileageFilter(ride: DerivedRideListing, minMileage: string, maxMileage: string) {
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

export default function RidesDirectoryClient({ snapshot }: Props) {
  const [selectedRegion, setSelectedRegion] = useState<"all" | RideRegionSlug>("all");
  const [selectedDate, setSelectedDate] = useState("");
  const [minMileage, setMinMileage] = useState("");
  const [maxMileage, setMaxMileage] = useState("");

  const regionOptions = useMemo<RegionOption[]>(
    () => [
      { slug: "all", label: "All regions" },
      ...snapshot.regions.map((region) => ({ slug: region.slug, label: region.label })),
    ],
    [snapshot.regions]
  );

  const filteredRides = useMemo(() => {
    return snapshot.rides.filter((ride) => {
      if (selectedRegion !== "all" && ride.regionSlug !== selectedRegion) return false;
      if (!matchesDateFilter(ride, selectedDate)) return false;
      if (!matchesMileageFilter(ride, minMileage, maxMileage)) return false;
      return true;
    });
  }, [maxMileage, minMileage, selectedDate, selectedRegion, snapshot.rides]);

  const ridesByRegion = useMemo(() => {
    return snapshot.regions
      .map((region) => ({
        region,
        rides: filteredRides
          .filter((ride) => ride.regionSlug === region.slug)
          .sort((left, right) => left.metroArea.localeCompare(right.metroArea) || left.title.localeCompare(right.title)),
      }))
      .filter((entry) => entry.rides.length > 0);
  }, [filteredRides, snapshot.regions]);

  function clearFilters() {
    setSelectedRegion("all");
    setSelectedDate("");
    setMinMileage("");
    setMaxMileage("");
  }

  return (
    <div className="rides-page">
      <section className="hero">
        <h1 className="hero-title">Organized Group Bike Rides</h1>
        <p className="hero-subtitle">
          Curated from official club calendars, advocacy pages, shop ride pages, and active community ride listings.
          Filter by region, exact next ride date, and mileage range.
        </p>
        <div className="row" style={{ justifyContent: "center" }}>
          <span className="pill">{snapshot.rides.length} live listings</span>
          <span className="pill">Last snapshot {formatGeneratedAt(snapshot.generatedAt)}</span>
          <span className="pill">Daily sync ready</span>
        </div>
      </section>

      <section className="card rides-filter-card">
        <div className="section-title">Filters</div>
        <div className="rides-filter-grid">
          <label className="label">
            Region
            <select
              className="input"
              value={selectedRegion}
              onChange={(event) => setSelectedRegion(event.target.value as "all" | RideRegionSlug)}
            >
              {regionOptions.map((option) => (
                <option key={option.slug} value={option.slug}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="label">
            Next ride date
            <input
              className="input"
              type="date"
              value={selectedDate}
              onChange={(event) => setSelectedDate(event.target.value)}
            />
          </label>

          <label className="label">
            Min miles
            <input
              className="input"
              type="number"
              min="0"
              step="1"
              placeholder="Any"
              value={minMileage}
              onChange={(event) => setMinMileage(event.target.value)}
            />
          </label>

          <label className="label">
            Max miles
            <input
              className="input"
              type="number"
              min="0"
              step="1"
              placeholder="Any"
              value={maxMileage}
              onChange={(event) => setMaxMileage(event.target.value)}
            />
          </label>
        </div>

        <div className="row" style={{ justifyContent: "space-between" }}>
          <div className="row">
            <span className="pill">{filteredRides.length} matching rides</span>
            {selectedDate ? <span className="pill">{weekdayName(selectedDate)}</span> : null}
            {selectedDate ? <span className="pill">Date {formatDateForInput(selectedDate)}</span> : null}
          </div>
          <button type="button" className="button ghost" onClick={clearFilters}>
            Clear filters
          </button>
        </div>
      </section>

      {ridesByRegion.length === 0 ? (
        <section className="card rides-empty-state">
          <div className="stack" style={{ gap: 10 }}>
            <strong>No rides match the current filters.</strong>
            <p className="muted" style={{ margin: 0 }}>
              Try a wider mileage range, a different region, or remove the date filter. Calendar-hub entries without a
              concrete next occurrence are excluded when a date filter is set.
            </p>
          </div>
        </section>
      ) : (
        ridesByRegion.map(({ region, rides }) => (
          <section key={region.slug} className="rides-region-section">
            <div className="rides-region-header">
              <div>
                <div className="section-title">{region.label}</div>
                <h2>{region.label}</h2>
                <p>{region.blurb}</p>
              </div>
              <span className="pill">{rides.length} matches</span>
            </div>

            <div className="rides-grid">
              {rides.map((ride) => (
                <article key={ride.id} className="ride-card">
                  <div className="ride-card-top">
                    <div className="stack" style={{ gap: 10 }}>
                      <div className="row">
                        <span className="pill">{ride.metroArea}</span>
                        <span className="pill">{ride.sourceType}</span>
                        <span className="pill">{ride.nextOccurrenceLabel}</span>
                      </div>
                      <div>
                        <h3>{ride.title}</h3>
                        <p className="ride-organizer">{ride.organizer}</p>
                      </div>
                    </div>
                    <Link className="button secondary" href={ride.sourceUrl} target="_blank" rel="noreferrer">
                      Open source
                    </Link>
                  </div>

                  <p className="ride-summary">{ride.summary}</p>

                  <div className="rides-detail-grid">
                    <div>
                      <div className="rides-detail-label">Cadence</div>
                      <div>{ride.cadence}</div>
                    </div>
                    <div>
                      <div className="rides-detail-label">Schedule</div>
                      <div>{ride.schedule}</div>
                    </div>
                    <div>
                      <div className="rides-detail-label">Distance</div>
                      <div>{ride.distance}</div>
                    </div>
                    <div>
                      <div className="rides-detail-label">Pace</div>
                      <div>{ride.pace}</div>
                    </div>
                    <div>
                      <div className="rides-detail-label">Terrain</div>
                      <div>{ride.terrain}</div>
                    </div>
                    <div>
                      <div className="rides-detail-label">Drop policy</div>
                      <div>{ride.dropPolicy}</div>
                    </div>
                    <div>
                      <div className="rides-detail-label">Start</div>
                      <div>{ride.startLocation}</div>
                    </div>
                    <div>
                      <div className="rides-detail-label">Access</div>
                      <div>{ride.access}</div>
                    </div>
                  </div>

                  <p className="ride-notes">{ride.notes}</p>

                  <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-end" }}>
                    <div className="row">
                      {ride.tags.map((tag) => (
                        <span key={tag} className="pill">
                          {tag}
                        </span>
                      ))}
                    </div>
                    <span className="muted ride-verified">Verified {ride.verifiedOn}</span>
                  </div>

                  <div className="muted ride-source-line">
                    Source:{" "}
                    <Link className="link" href={ride.sourceUrl} target="_blank" rel="noreferrer">
                      {ride.sourceLabel}
                    </Link>
                  </div>
                </article>
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
