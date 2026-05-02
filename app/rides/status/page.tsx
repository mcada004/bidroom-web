import type { Metadata } from "next";
import Link from "next/link";
import { getRideDirectorySnapshot } from "@/src/server/ridesStore";
import { getRideSourceRegistry } from "@/src/lib/rideSources";
import { buildRideIntegrationStatuses, getRideSyncStatus } from "@/src/server/ridesSyncStatus";

export const metadata: Metadata = {
  title: "Rides Sync Status | Bidroom",
  description: "Operational status for the daily group rides refresh, parsers, and optional API integrations.",
};

export const dynamic = "force-dynamic";

function formatDateTime(value: string | null) {
  if (!value) return "Not yet recorded";
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

export default async function RidesStatusPage() {
  const [snapshot, syncStatus] = await Promise.all([getRideDirectorySnapshot(), getRideSyncStatus()]);
  const sources = getRideSourceRegistry();
  const sourceReports = syncStatus?.sourceReports ?? snapshot.sourceReports ?? [];
  const syncSummary = syncStatus?.syncSummary ?? snapshot.syncSummary ?? null;
  const integrationStatuses = syncStatus?.integrationStatuses ?? buildRideIntegrationStatuses(sources, sourceReports);
  const failedReports = sourceReports.filter((report) => report.status === "failed");
  const sourceCount = syncSummary?.sourceCount ?? sources.length;
  const crawledSourceCount = syncSummary?.crawledSourceCount ?? sources.filter((source) => source.syncMode === "crawl").length;
  const integrationSourceCount =
    syncSummary?.integrationSourceCount ?? sources.filter((source) => Boolean(source.integration)).length;

  return (
    <div className="rides-page">
      <section className="hero">
        <h1 className="hero-title">Rides Sync Status</h1>
        <p className="hero-subtitle">
          Operational view of the daily rides refresh. This page tracks the last cron attempt, last successful write,
          parser health, and optional authenticated integrations.
        </p>
        <div className="row" style={{ justifyContent: "center" }}>
          <Link className="pill" href="/rides">
            List
          </Link>
          <Link className="pill" href="/rides/calendar">
            Calendar
          </Link>
          <Link className="pill" href="/rides/map">
            Map
          </Link>
          <span className="pill">Status</span>
        </div>
      </section>

      <section className="card soft rides-summary-card">
        <div className="section-title">Run Status</div>
        <div className="rides-stats">
          <div className="rides-stat">
            <strong>{syncStatus?.lastResult ?? "snapshot"}</strong>
            <span>latest run result</span>
          </div>
          <div className="rides-stat">
            <strong>{syncStatus?.trigger ?? "snapshot"}</strong>
            <span>trigger source</span>
          </div>
          <div className="rides-stat">
            <strong>{sourceCount}</strong>
            <span>registered sources</span>
          </div>
          <div className="rides-stat">
            <strong>{crawledSourceCount}</strong>
            <span>crawl sources</span>
          </div>
          <div className="rides-stat">
            <strong>{integrationSourceCount}</strong>
            <span>integration sources</span>
          </div>
          <div className="rides-stat">
            <strong>{failedReports.length}</strong>
            <span>failed sources on latest run</span>
          </div>
        </div>

        <div className="rides-status-grid">
          <article className="rides-sync-report">
            <strong>Last Attempted Run</strong>
            <div className="muted">{formatDateTime(syncStatus?.lastAttemptedAt ?? snapshot.generatedAt)}</div>
          </article>
          <article className="rides-sync-report">
            <strong>Last Successful Persistence</strong>
            <div className="muted">{formatDateTime(syncStatus?.lastSuccessfulAt ?? snapshot.generatedAt)}</div>
          </article>
          <article className="rides-sync-report">
            <strong>Current Snapshot</strong>
            <div className="muted">{formatDateTime(snapshot.generatedAt)}</div>
          </article>
          <article className="rides-sync-report">
            <strong>Latest Error</strong>
            <div className="muted">{syncStatus?.lastError ?? "No recorded sync error."}</div>
          </article>
        </div>
      </section>

      <section className="card">
        <div className="section-title">Integration Health</div>
        <div className="rides-status-grid">
          {integrationStatuses.map((status) => (
            <article key={status.provider} className="rides-sync-report">
              <div className="row" style={{ justifyContent: "space-between" }}>
                <strong>{status.provider}</strong>
                <span className="pill">{status.status}</span>
              </div>
              <div className="muted">{status.detail}</div>
              <div className="muted">
                Configured: {status.configuredSourceCount} • Fetched: {status.fetchedSourceCount} • Failed:{" "}
                {status.failedSourceCount} • Skipped: {status.skippedSourceCount}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="card">
        <div className="section-title">Source Failures</div>
        {failedReports.length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>
            No source fetch failures were recorded on the latest run.
          </p>
        ) : (
          <div className="rides-sync-report-list" style={{ marginTop: 18 }}>
            {failedReports.map((report) => (
              <article key={report.sourceId} className="rides-sync-report">
                <div className="row" style={{ justifyContent: "space-between" }}>
                  <strong>{report.label}</strong>
                  <span className="pill">Failed</span>
                </div>
                <div className="muted">
                  {report.transport === "integration" && report.integrationProvider
                    ? `${report.integrationProvider} integration`
                    : report.parserStrategy ?? report.parserType}
                  {report.httpStatus ? ` • HTTP ${report.httpStatus}` : ""}
                </div>
                <div className="muted">{report.error ?? "Unknown source failure."}</div>
                <Link className="link" href={report.finalUrl ?? report.url} target="_blank" rel="noreferrer">
                  Open source
                </Link>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="card">
        <div className="section-title">Latest Source Reports</div>
        <div className="rides-sync-report-list" style={{ marginTop: 18 }}>
          {sourceReports.slice(0, 24).map((report) => (
            <article key={report.sourceId} className="rides-sync-report">
              <div className="row" style={{ justifyContent: "space-between" }}>
                <strong>{report.label}</strong>
                <span className="pill">{report.status}</span>
              </div>
              <div className="muted">
                {report.transport === "integration" && report.integrationProvider
                  ? `${report.integrationProvider} integration`
                  : report.parserStrategy ?? report.parserType}
              </div>
              {report.pageTitle ? <div>{report.pageTitle}</div> : null}
              {report.extractedSchedule ? <div>Schedule: {report.extractedSchedule}</div> : null}
              {report.detectedDates.length > 0 ? (
                <div className="muted">Detected dates: {report.detectedDates.slice(0, 5).join(", ")}</div>
              ) : null}
              {report.skippedReason ? <div className="muted">{report.skippedReason}</div> : null}
              {report.error ? <div className="muted">Error: {report.error}</div> : null}
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

