import type { Metadata } from "next";
import Link from "next/link";
import { rideRegions, type RideListing } from "@/src/lib/groupRides";

export const metadata: Metadata = {
  title: "Group Bike Rides | Bidroom",
  description:
    "Curated organized group bike rides, starting with Bay Area clubs, shops, and recurring ride calendars.",
};

const metroAreaOrder = ["East Bay", "Marin", "Peninsula", "San Francisco", "South Bay"];

function formatVerifiedOn(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(new Date(`${value}T12:00:00Z`));
}

function groupByMetroArea(rides: RideListing[]) {
  const grouped = rides.reduce<Record<string, RideListing[]>>((accumulator, ride) => {
    accumulator[ride.metroArea] ??= [];
    accumulator[ride.metroArea].push(ride);
    return accumulator;
  }, {});

  return metroAreaOrder
    .filter((metroArea) => grouped[metroArea]?.length)
    .map((metroArea) => ({
      metroArea,
      rides: grouped[metroArea].sort((left, right) => left.title.localeCompare(right.title)),
    }));
}

export default function RidesPage() {
  const bayAreaRegion = rideRegions.find((region) => region.slug === "bay-area");
  if (!bayAreaRegion) return null;

  const groupedBayAreaRides = groupByMetroArea(bayAreaRegion.rides);
  const verifiedDates = bayAreaRegion.rides.map((ride) => ride.verifiedOn).sort();
  const lastVerifiedOn = verifiedDates.at(-1) ?? "2026-05-02";

  return (
    <main className="page rides-page">
      <section className="hero">
        <h1 className="hero-title">Organized Group Bike Rides</h1>
        <p className="hero-subtitle">
          Curated from official club calendars, advocacy org pages, shop ride pages, and active community ride
          listings. Bay Area is live first; San Diego, Los Angeles, Santa Clarita, and Riverside are scaffolded for
          the next pass.
        </p>
        <div className="row" style={{ justifyContent: "center" }}>
          <span className="pill">{bayAreaRegion.rides.length} Bay Area listings</span>
          <span className="pill">Verified {formatVerifiedOn(lastVerifiedOn)}</span>
          <span className="pill">Official sources first</span>
        </div>
      </section>

      <section className="card soft rides-summary-card">
        <div className="rides-stats">
          <div className="rides-stat">
            <strong>{bayAreaRegion.rides.length}</strong>
            <span>live Bay Area entries</span>
          </div>
          <div className="rides-stat">
            <strong>{groupedBayAreaRides.length}</strong>
            <span>Bay Area subregions covered</span>
          </div>
          <div className="rides-stat">
            <strong>{rideRegions.filter((region) => region.status === "planned").length}</strong>
            <span>SoCal regions scaffolded next</span>
          </div>
        </div>
        <p className="muted" style={{ margin: 0 }}>
          Schedules change. Always confirm the current ride page or calendar before showing up.
        </p>
      </section>

      <section className="section">
        <div className="section-title">Regions</div>
        <div className="rides-region-jump">
          {rideRegions.map((region) => (
            <a key={region.slug} className="pill rides-region-pill" href={`#${region.slug}`}>
              {region.label} {region.rides.length > 0 ? `(${region.rides.length})` : "(coming soon)"}
            </a>
          ))}
        </div>
      </section>

      <section className="section rides-region-section" id={bayAreaRegion.slug}>
        <div className="rides-region-header">
          <div>
            <div className="section-title">Live Region</div>
            <h2>{bayAreaRegion.label}</h2>
            <p className="muted">{bayAreaRegion.blurb}</p>
          </div>
        </div>

        {groupedBayAreaRides.map((group) => (
          <div key={group.metroArea} className="rides-metro-group">
            <div className="section-title" style={{ marginBottom: 14 }}>
              {group.metroArea}
            </div>
            <div className="rides-grid">
              {group.rides.map((ride) => (
                <article key={ride.id} className="ride-card">
                  <div className="ride-card-top">
                    <div className="stack" style={{ gap: 10 }}>
                      <div className="row">
                        <span className="pill">{ride.metroArea}</span>
                        <span className="pill">{ride.sourceType}</span>
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
                      <div className="rides-detail-label">Typical schedule</div>
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
          </div>
        ))}
      </section>

      {rideRegions
        .filter((region) => region.slug !== "bay-area")
        .map((region) => (
          <section key={region.slug} className="section rides-region-section" id={region.slug}>
            <div className="rides-region-header">
              <div>
                <div className="section-title">Scaffolded Next</div>
                <h2>{region.label}</h2>
                <p className="muted">{region.blurb}</p>
              </div>
            </div>
            <div className="card rides-empty-state">
              <div className="stack" style={{ gap: 10 }}>
                <strong>{region.label} listings are not populated yet.</strong>
                <p className="muted" style={{ margin: 0 }}>
                  The page structure is in place. The next pass can fill this region with the same format:
                  recurring club rides, shop rides, official event calendars, pace notes, start locations, and source
                  links.
                </p>
              </div>
            </div>
          </section>
        ))}
    </main>
  );
}
