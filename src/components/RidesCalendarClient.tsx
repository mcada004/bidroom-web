"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import RidesFilterControls from "@/src/components/RidesFilterControls";
import type { RideDirectorySnapshot, RideRegionSlug } from "@/src/lib/groupRides";
import { filterRides, matchesDateFilter } from "@/src/lib/ridesFiltering";

type Props = {
  snapshot: RideDirectorySnapshot;
};

function toDateKey(value: Date) {
  return value.toISOString().slice(0, 10);
}

function startOfMonth(value: Date) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), 1, 12));
}

function addDays(value: Date, days: number) {
  const next = new Date(value);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function addMonths(value: Date, months: number) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth() + months, 1, 12));
}

function formatMonthHeading(value: Date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
  }).format(value);
}

function formatCalendarDayLabel(value: Date) {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(value);
}

function formatVerifiedOn(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(`${value}T12:00:00Z`));
}

function buildCalendarDays(visibleMonth: Date) {
  const monthStart = startOfMonth(visibleMonth);
  const gridStart = addDays(monthStart, -monthStart.getUTCDay());

  return Array.from({ length: 42 }, (_, index) => {
    const date = addDays(gridStart, index);
    return {
      date,
      dateKey: toDateKey(date),
      dayOfMonth: date.getUTCDate(),
      inVisibleMonth: date.getUTCMonth() === visibleMonth.getUTCMonth(),
    };
  });
}

export default function RidesCalendarClient({ snapshot }: Props) {
  const todayKey = snapshot.generatedAt.slice(0, 10);
  const [selectedRegion, setSelectedRegion] = useState<"all" | RideRegionSlug>("all");
  const [selectedDate, setSelectedDate] = useState("");
  const [minMileage, setMinMileage] = useState("");
  const [maxMileage, setMaxMileage] = useState("");
  const [visibleMonth, setVisibleMonth] = useState(() => startOfMonth(new Date(`${todayKey}T12:00:00Z`)));

  const ridesMatchingRegionAndMileage = useMemo(
    () =>
      filterRides(snapshot, {
        region: selectedRegion,
        date: "",
        minMileage,
        maxMileage,
      }),
    [maxMileage, minMileage, selectedRegion, snapshot]
  );

  const selectedDayRides = useMemo(
    () =>
      filterRides(snapshot, {
        region: selectedRegion,
        date: selectedDate,
        minMileage,
        maxMileage,
      }),
    [maxMileage, minMileage, selectedDate, selectedRegion, snapshot]
  );

  const calendarDays = useMemo(() => buildCalendarDays(visibleMonth), [visibleMonth]);

  const rideCountByDate = useMemo(() => {
    const counts = new Map<string, number>();
    for (const calendarDay of calendarDays) {
      let count = 0;
      for (const ride of ridesMatchingRegionAndMileage) {
        if (matchesDateFilter(ride, calendarDay.dateKey)) count += 1;
      }
      counts.set(calendarDay.dateKey, count);
    }
    return counts;
  }, [calendarDays, ridesMatchingRegionAndMileage]);

  function clearFilters() {
    setSelectedRegion("all");
    setSelectedDate("");
    setMinMileage("");
    setMaxMileage("");
    setVisibleMonth(startOfMonth(new Date(`${todayKey}T12:00:00Z`)));
  }

  function chooseDate(dateKey: string) {
    setSelectedDate(dateKey);
  }

  function handleDateInput(value: string) {
    setSelectedDate(value);
    if (value) {
      setVisibleMonth(startOfMonth(new Date(`${value}T12:00:00Z`)));
    }
  }

  return (
    <div className="rides-page">
      <section className="hero">
        <h1 className="hero-title">Rides Calendar</h1>
        <p className="hero-subtitle">
          Browse rides by day. Each date shows how many rides match the current region and mileage filters, and clicking
          a day opens the matching rides below.
        </p>
        <div className="row" style={{ justifyContent: "center" }}>
          <span className="pill">{ridesMatchingRegionAndMileage.length} rides in current filter set</span>
          <span className="pill">{selectedDate ? `${selectedDayRides.length} rides on selected day` : "Select a day"}</span>
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
        matchingCount={selectedDate ? selectedDayRides.length : ridesMatchingRegionAndMileage.length}
        currentView="calendar"
        onRegionChange={setSelectedRegion}
        onDateChange={handleDateInput}
        onMinMileageChange={setMinMileage}
        onMaxMileageChange={setMaxMileage}
        onClear={clearFilters}
      />

      <section className="card rides-calendar-card">
        <div className="rides-calendar-header">
          <button type="button" className="button ghost" onClick={() => setVisibleMonth((current) => addMonths(current, -1))}>
            Previous month
          </button>
          <div className="stack" style={{ gap: 6, textAlign: "center" }}>
            <strong className="rides-calendar-title">{formatMonthHeading(visibleMonth)}</strong>
            <span className="muted">Click any day to view rides for that date.</span>
          </div>
          <button type="button" className="button ghost" onClick={() => setVisibleMonth((current) => addMonths(current, 1))}>
            Next month
          </button>
        </div>

        <div className="rides-calendar-scroll">
          <div className="rides-calendar-weekdays" aria-hidden="true">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((weekday) => (
              <div key={weekday} className="rides-calendar-weekday">
                {weekday}
              </div>
            ))}
          </div>

          <div className="rides-calendar-grid">
            {calendarDays.map((calendarDay) => {
              const rideCount = rideCountByDate.get(calendarDay.dateKey) ?? 0;
              const isSelected = selectedDate === calendarDay.dateKey;
              const isToday = calendarDay.dateKey === todayKey;

              return (
                <button
                  key={calendarDay.dateKey}
                  type="button"
                  className={`rides-calendar-day${calendarDay.inVisibleMonth ? "" : " is-outside"}${isSelected ? " is-selected" : ""}${isToday ? " is-today" : ""}`}
                  onClick={() => chooseDate(calendarDay.dateKey)}
                  aria-pressed={isSelected}
                >
                  <span className="rides-calendar-day-number">{calendarDay.dayOfMonth}</span>
                  <span className="rides-calendar-day-label">
                    {rideCount === 0 ? "No rides" : `${rideCount} ride${rideCount === 1 ? "" : "s"}`}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      <section className="card">
        <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
          <div className="stack" style={{ gap: 6 }}>
            <div className="section-title" style={{ marginBottom: 0 }}>
              Selected Day
            </div>
            <strong className="rides-calendar-title">
              {selectedDate ? formatCalendarDayLabel(new Date(`${selectedDate}T12:00:00Z`)) : "Choose a date"}
            </strong>
          </div>
          {selectedDate ? (
            <button type="button" className="button ghost" onClick={() => setSelectedDate("")}>
              Clear selected day
            </button>
          ) : null}
        </div>

        {!selectedDate ? (
          <p className="muted" style={{ margin: "18px 0 0" }}>
            Select a day from the calendar above to see matching rides.
          </p>
        ) : selectedDayRides.length === 0 ? (
          <p className="muted" style={{ margin: "18px 0 0" }}>
            No rides match the current filters on this day.
          </p>
        ) : (
          <ul className="list" style={{ marginTop: 18 }}>
            {selectedDayRides
              .slice()
              .sort((left, right) => left.metroArea.localeCompare(right.metroArea) || left.title.localeCompare(right.title))
              .map((ride) => (
                <li key={ride.id} className="list-item">
                  <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div className="stack" style={{ gap: 8 }}>
                      <div className="row">
                        <span className="pill">{ride.metroArea}</span>
                        <span className="pill">{ride.distance}</span>
                        <span className="pill">{ride.locationPrecision === "exact" ? "Exact map point" : "Approximate map point"}</span>
                      </div>
                      <div>
                        <strong>{ride.title}</strong>
                        <div className="muted">
                          {ride.organizer} • {ride.schedule}
                        </div>
                      </div>
                      <div className="muted">{ride.summary}</div>
                      <div className="muted">Verified {formatVerifiedOn(ride.verifiedOn)}</div>
                    </div>

                    <div className="row" style={{ justifyContent: "flex-end" }}>
                      <Link className="button ghost" href="/rides/map">
                        Open map
                      </Link>
                      <Link className="button secondary" href={ride.sourceUrl} target="_blank" rel="noreferrer">
                        Open source
                      </Link>
                    </div>
                  </div>
                </li>
              ))}
          </ul>
        )}
      </section>
    </div>
  );
}
