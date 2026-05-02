"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import RidesFilterControls from "@/src/components/RidesFilterControls";
import type { RideDirectorySnapshot, RideRegionSlug } from "@/src/lib/groupRides";
import { filterRides } from "@/src/lib/ridesFiltering";

type Props = {
  snapshot: RideDirectorySnapshot;
};

function formatGeneratedAt(dateValue: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(dateValue));
}

function formatVerifiedOn(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(`${value}T12:00:00Z`));
}

export default function RidesDirectoryClient({ snapshot }: Props) {
  const [selectedRegion, setSelectedRegion] = useState<"all" | RideRegionSlug>("all");
  const [selectedDate, setSelectedDate] = useState("");
  const [minMileage, setMinMileage] = useState("");
  const [maxMileage, setMaxMileage] = useState("");

  const filteredRides = useMemo(() => {
    return filterRides(snapshot, {
      region: selectedRegion,
      date: selectedDate,
      minMileage,
      maxMileage,
    });
  }, [maxMileage, minMileage, selectedDate, selectedRegion, snapshot]);

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

  const failedReports = useMemo(
    () => (snapshot.sourceReports ?? []).filter((report) => !report.ok),
    [snapshot.sourceReports]
  );

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
          <Link className="pill" href="/rides/status">
            Sync status
          </Link>
        </div>
      </section>

      <RidesFilterControls
        snapshot={snapshot}
        filters={{
          region: selectedRegion,
          date: selectedDate,
          minMileage,
          maxMileage,
        }}
        matchingCount={filteredRides.length}
        currentView="list"
        onRegionChange={setSelectedRegion}
        onDateChange={setSelectedDate}
        onMinMileageChange={setMinMileage}
        onMaxMileageChange={setMaxMileage}
        onClear={clearFilters}
      />

      {snapshot.syncSummary ? (
        <section className="card soft rides-summary-card">
          <div className="section-title">Daily Refresh</div>
          <div className="rides-stats">
            <div className="rides-stat">
              <strong>{snapshot.syncSummary.sourceCount}</strong>
              <span>registered sources</span>
            </div>
            <div className="rides-stat">
              <strong>{snapshot.syncSummary.crawledSourceCount}</strong>
              <span>sources crawled daily</span>
            </div>
            <div className="rides-stat">
              <strong>{snapshot.syncSummary.integrationSourceCount}</strong>
              <span>API-backed sources</span>
            </div>
            <div className="rides-stat">
              <strong>{snapshot.syncSummary.successfulSourceCount}</strong>
              <span>successful fetches</span>
            </div>
            <div className="rides-stat">
              <strong>{snapshot.syncSummary.skippedSourceCount}</strong>
              <span>manual or API-only sources</span>
            </div>
            <div className="rides-stat">
              <strong>{snapshot.syncSummary.failedSourceCount}</strong>
              <span>failed fetches</span>
            </div>
            <div className="rides-stat">
              <strong>{snapshot.syncSummary.persisted ? "Live" : "Preview"}</strong>
              <span>{snapshot.syncSummary.persisted ? "saved to Firestore" : "not persisted yet"}</span>
            </div>
          </div>
          <p className="muted" style={{ margin: 0 }}>
            Last source refresh: {formatGeneratedAt(snapshot.syncSummary.generatedAt)}
          </p>

          {snapshot.sourceReports?.length ? (
            <details className="rides-sync-details">
              <summary>Source diagnostics</summary>
              <div className="rides-sync-report-list">
                {(failedReports.length > 0 ? failedReports : snapshot.sourceReports.slice(0, 10)).map((report) => (
                  <article key={report.sourceId} className="rides-sync-report">
                    <div className="row" style={{ justifyContent: "space-between" }}>
                      <strong>{report.label}</strong>
                      <span className="pill">
                        {report.status === "skipped" ? "Skipped" : report.ok ? "OK" : "Needs review"}
                      </span>
                    </div>
                    <div className="muted">
                      {report.pageTitle ?? "No page title"} {report.httpStatus ? `• HTTP ${report.httpStatus}` : ""}{" "}
                      {report.transport === "integration" && report.integrationProvider
                        ? `• ${report.integrationProvider} integration`
                        : ""}
                      {report.parserStrategy ? `• ${report.parserStrategy}` : ""}
                    </div>
                    {report.detectedEventCount > 0 ? (
                      <div className="muted">
                        Detected {report.detectedEventCount} date{report.detectedEventCount === 1 ? "" : "s"}
                      </div>
                    ) : null}
                    {report.skippedReason ? <div className="muted">{report.skippedReason}</div> : null}
                    {report.extractedSchedule ? <div>Schedule: {report.extractedSchedule}</div> : null}
                    {report.extractedDistance ? <div>Distance: {report.extractedDistance}</div> : null}
                    {report.extractedDropPolicy ? <div>Drop policy: {report.extractedDropPolicy}</div> : null}
                    {report.error ? <div className="muted">Error: {report.error}</div> : null}
                    <Link className="link" href={report.url} target="_blank" rel="noreferrer">
                      Open source
                    </Link>
                  </article>
                ))}
              </div>
            </details>
          ) : null}
        </section>
      ) : (
        <section className="notice">
          Daily source refresh diagnostics will appear here after the first successful sync run.
        </section>
      )}

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
                    <span className="muted ride-verified">Verified {formatVerifiedOn(ride.verifiedOn)}</span>
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
