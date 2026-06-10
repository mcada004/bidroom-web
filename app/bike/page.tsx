"use client";

import { useState } from "react";

type Ride = {
  name: string;
  distance: string;
  climbing: string;
  estimatedTime: string;
  difficulty: string;
  description: string;
};

type Destination = {
  name: string;
  description: string;
  bestSeason: string;
  tips: string;
  rides: Ride[];
};

const SUGGESTION_CHIPS = [
  "Colorado",
  "Mallorca",
  "Girona",
  "Tuscany",
  "Vermont",
  "Pacific Coast",
  "Utah",
  "Oaxaca",
  "Alps",
  "Dolomites",
];

const DEFAULT_GOALS: Record<string, number> = {
  miles: 50,
  climbing: 4000,
  hours: 4,
};

export default function BikePage() {
  const [location, setLocation] = useState("");
  const [ridingType, setRidingType] = useState<"road" | "gravel" | "both">("road");
  const [goalMetric, setGoalMetric] = useState<"miles" | "climbing" | "hours">("miles");
  const [goalAmount, setGoalAmount] = useState<number>(DEFAULT_GOALS.miles);
  const [destinations, setDestinations] = useState<Destination[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);

  function handleMetricChange(metric: "miles" | "climbing" | "hours") {
    setGoalMetric(metric);
    setGoalAmount(DEFAULT_GOALS[metric]);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setDestinations([]);
    setHasSearched(true);

    try {
      const res = await fetch("/api/bike-suggestions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          location: location.trim() || undefined,
          ridingType,
          goalMetric,
          goalAmount,
        }),
      });

      const data = (await res.json()) as {
        ok?: boolean;
        destinations?: Destination[];
        error?: string;
      };

      if (!res.ok || data.error) {
        throw new Error(data.error || "Something went wrong.");
      }

      setDestinations(data.destinations ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  const goalUnitLabel =
    goalMetric === "miles"
      ? "miles"
      : goalMetric === "climbing"
        ? "ft of climbing"
        : "hours";

  return (
    <main className="page">
      <section className="hero">
        <h1 className="hero-title">Cycling Adventures</h1>
        <p className="hero-subtitle">
          Describe your ideal ride and get AI-powered destination and route
          suggestions.
        </p>
      </section>

      <section className="card" style={{ maxWidth: 560, margin: "0 auto" }}>
        <form className="stack" onSubmit={handleSubmit}>
          <label className="label">
            Where to ride
            <input
              className="input"
              type="text"
              placeholder="Type a destination or click below"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
            />
          </label>

          <div className="row" style={{ flexWrap: "wrap" }}>
            {SUGGESTION_CHIPS.map((chip) => (
              <button
                key={chip}
                type="button"
                className={`pill${location === chip ? " active" : ""}`}
                onClick={() =>
                  setLocation((prev) => (prev === chip ? "" : chip))
                }
              >
                {chip}
              </button>
            ))}
          </div>

          <label className="label">
            Riding type
            <select
              className="input"
              value={ridingType}
              onChange={(e) =>
                setRidingType(e.target.value as "road" | "gravel" | "both")
              }
            >
              <option value="road">Road</option>
              <option value="gravel">Gravel</option>
              <option value="both">Both</option>
            </select>
          </label>

          <label className="label">
            Daily goal metric
            <select
              className="input"
              value={goalMetric}
              onChange={(e) =>
                handleMetricChange(
                  e.target.value as "miles" | "climbing" | "hours"
                )
              }
            >
              <option value="miles">Miles</option>
              <option value="climbing">Climbing (ft)</option>
              <option value="hours">Hours</option>
            </select>
          </label>

          <label className="label">
            Daily goal amount ({goalUnitLabel})
            <input
              className="input"
              type="number"
              min={1}
              value={goalAmount}
              onChange={(e) => setGoalAmount(Number(e.target.value))}
            />
          </label>

          <div className="row">
            <button className="button" type="submit" disabled={loading}>
              {loading ? "Finding rides…" : "Find rides"}
            </button>
          </div>

          {error ? <p className="notice">{error}</p> : null}
        </form>
      </section>

      {loading ? (
        <section style={{ textAlign: "center", padding: "2rem 0" }}>
          <p className="muted">Generating suggestions…</p>
        </section>
      ) : null}

      {!loading && hasSearched && destinations.length === 0 && !error ? (
        <section style={{ textAlign: "center", padding: "2rem 0" }}>
          <p className="muted">No suggestions found. Try adjusting your preferences.</p>
        </section>
      ) : null}

      {destinations.length > 0 ? (
        <section className="stack" style={{ marginTop: "2rem" }}>
          <h2 className="section-title">Suggested destinations</h2>

          <div className="grid-2">
            {destinations.map((dest) => (
              <div className="card" key={dest.name}>
                <div className="stack">
                  <h3 className="section-title">{dest.name}</h3>
                  <p>{dest.description}</p>

                  <div className="row">
                    <span className="pill">Best season: {dest.bestSeason}</span>
                  </div>

                  <div className="list">
                    {dest.rides.map((ride) => (
                      <div className="list-item" key={ride.name}>
                        <div className="stack" style={{ gap: 4 }}>
                          <strong>{ride.name}</strong>
                          <p className="muted" style={{ margin: 0 }}>
                            {ride.description}
                          </p>
                          <div
                            className="row"
                            style={{ flexWrap: "wrap", gap: 6, marginTop: 4 }}
                          >
                            <span className="pill">{ride.distance}</span>
                            <span className="pill">{ride.climbing}</span>
                            <span className="pill">{ride.estimatedTime}</span>
                            <span className="pill">{ride.difficulty}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  <p className="muted" style={{ fontSize: 13 }}>
                    <strong>Tips:</strong> {dest.tips}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </main>
  );
}
