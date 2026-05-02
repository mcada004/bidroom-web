"use client";

import Link from "next/link";
import type { RideDirectorySnapshot, RideRegionSlug } from "@/src/lib/groupRides";
import { getRideRegionOptions, type RideFilters } from "@/src/lib/ridesFiltering";

type Props = {
  snapshot: RideDirectorySnapshot;
  filters: RideFilters;
  matchingCount: number;
  currentView: "list" | "map" | "calendar";
  onRegionChange: (value: "all" | RideRegionSlug) => void;
  onDateChange: (value: string) => void;
  onMinMileageChange: (value: string) => void;
  onMaxMileageChange: (value: string) => void;
  onClear: () => void;
};

function weekdayName(dateValue: string) {
  return new Intl.DateTimeFormat("en-US", { weekday: "long" }).format(new Date(`${dateValue}T12:00:00Z`));
}

export default function RidesFilterControls({
  snapshot,
  filters,
  matchingCount,
  currentView,
  onRegionChange,
  onDateChange,
  onMinMileageChange,
  onMaxMileageChange,
  onClear,
}: Props) {
  const regionOptions = getRideRegionOptions(snapshot);

  return (
    <section className="card rides-filter-card">
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <div className="section-title" style={{ marginBottom: 0 }}>
          Filters
        </div>
        <div className="row">
          <Link className={`pill rides-view-pill ${currentView === "list" ? "is-active" : ""}`} href="/rides">
            List
          </Link>
          <Link className={`pill rides-view-pill ${currentView === "calendar" ? "is-active" : ""}`} href="/rides/calendar">
            Calendar
          </Link>
          <Link className={`pill rides-view-pill ${currentView === "map" ? "is-active" : ""}`} href="/rides/map">
            Map
          </Link>
        </div>
      </div>

      <div className="rides-filter-grid">
        <label className="label">
          Region
          <select className="input" value={filters.region} onChange={(event) => onRegionChange(event.target.value as "all" | RideRegionSlug)}>
            {regionOptions.map((option) => (
              <option key={option.slug} value={option.slug}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="label">
          Next ride date
          <input className="input" type="date" value={filters.date} onChange={(event) => onDateChange(event.target.value)} />
        </label>

        <label className="label">
          Min miles
          <input
            className="input"
            type="number"
            min="0"
            step="1"
            placeholder="Any"
            value={filters.minMileage}
            onChange={(event) => onMinMileageChange(event.target.value)}
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
            value={filters.maxMileage}
            onChange={(event) => onMaxMileageChange(event.target.value)}
          />
        </label>
      </div>

      <div className="row" style={{ justifyContent: "space-between" }}>
        <div className="row">
          <span className="pill">{matchingCount} matching rides</span>
          {filters.date ? <span className="pill">{weekdayName(filters.date)}</span> : null}
          {filters.date ? <span className="pill">Date {filters.date}</span> : null}
        </div>
        <button type="button" className="button ghost" onClick={onClear}>
          Clear filters
        </button>
      </div>
    </section>
  );
}
