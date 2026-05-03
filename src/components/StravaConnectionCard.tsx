"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/src/context/AuthContext";

type StravaConnectionMetadata = {
  athleteId: number;
  athleteUsername: string | null;
  athleteName: string;
  athleteCity: string | null;
  athleteState: string | null;
  athleteCountry: string | null;
  athleteProfile: string | null;
  athleteProfileMedium: string | null;
  scopes: string[];
  connectedAt: string;
  expiresAt: number;
};

type StravaClubActivity = {
  id: number | null;
  title: string;
  sportType: string | null;
  distanceMiles: number | null;
  date: string | null;
  url: string | null;
};

type StravaClub = {
  id: number;
  name: string;
  sportType: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  memberCount: number | null;
  profileMedium: string | null;
  coverPhoto: string | null;
  url: string | null;
  activities: StravaClubActivity[];
};

type StatusState =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ready"; configured: boolean; connected: boolean; message?: string; connection: StravaConnectionMetadata | null };

type ClubsState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ready"; clubs: StravaClub[] };

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatExpiresAt(value: number) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value * 1000));
}

function formatDistanceMiles(value: number | null) {
  if (value === null) return "Distance not provided";
  return `${value} miles`;
}

export default function StravaConnectionCard() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();

  const [statusState, setStatusState] = useState<StatusState>({ kind: "loading" });
  const [clubsState, setClubsState] = useState<ClubsState>({ kind: "idle" });
  const [busyAction, setBusyAction] = useState<"connect" | "disconnect" | "finalize" | null>(null);
  const [banner, setBanner] = useState<string | null>(null);

  const stravaParam = searchParams.get("strava");
  const stravaMessage = searchParams.get("message");

  const loadStatus = useCallback(async () => {
    if (!user) return;
    setStatusState({ kind: "loading" });

    try {
      const token = await user.getIdToken();
      const response = await fetch("/api/strava/status", {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        cache: "no-store",
      });

      const payload = (await response.json().catch(() => ({}))) as {
        configured?: boolean;
        connected?: boolean;
        message?: string;
        connection?: StravaConnectionMetadata | null;
        error?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error || "Could not load Strava status.");
      }

      setStatusState({
        kind: "ready",
        configured: Boolean(payload.configured),
        connected: Boolean(payload.connected),
        message: payload.message,
        connection: payload.connection ?? null,
      });
    } catch (error) {
      setStatusState({
        kind: "error",
        message: error instanceof Error ? error.message : "Could not load Strava status.",
      });
    }
  }, [user]);

  const loadClubs = useCallback(async () => {
    if (!user) return;
    setClubsState({ kind: "loading" });

    try {
      const token = await user.getIdToken();
      const response = await fetch("/api/strava/clubs", {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        cache: "no-store",
      });

      const payload = (await response.json().catch(() => ({}))) as {
        clubs?: StravaClub[];
        error?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error || "Could not load Strava clubs.");
      }

      setClubsState({ kind: "ready", clubs: payload.clubs ?? [] });
    } catch (error) {
      setClubsState({
        kind: "error",
        message: error instanceof Error ? error.message : "Could not load Strava clubs.",
      });
    }
  }, [user]);

  useEffect(() => {
    if (!user) return;

    if (stravaParam === "connected") {
      let cancelled = false;
      setBusyAction("finalize");
      setBanner("Finalizing your Strava connection…");

      void (async () => {
        try {
          const token = await user.getIdToken();
          const response = await fetch("/api/strava/finalize", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
            },
          });
          const payload = (await response.json().catch(() => ({}))) as {
            finalized?: boolean;
            error?: string;
          };

          if (!response.ok) {
            throw new Error(payload.error || "Could not finalize Strava connection.");
          }

          if (!cancelled) {
            setBanner(payload.finalized ? "Strava connected." : "No pending Strava connection to finalize.");
            router.replace("/account");
            await loadStatus();
          }
        } catch (error) {
          if (!cancelled) {
            setBanner(error instanceof Error ? error.message : "Could not finalize Strava connection.");
            router.replace("/account");
            await loadStatus();
          }
        } finally {
          if (!cancelled) setBusyAction(null);
        }
      })();

      return () => {
        cancelled = true;
      };
    }

    if (stravaParam === "error") {
      setBanner(stravaMessage ? decodeURIComponent(stravaMessage) : "Strava authorization failed.");
      router.replace("/account");
    }

    void loadStatus();
  }, [loadStatus, router, stravaMessage, stravaParam, user]);

  useEffect(() => {
    if (statusState.kind !== "ready" || !statusState.connected) {
      setClubsState({ kind: "idle" });
      return;
    }
    void loadClubs();
  }, [loadClubs, statusState]);

  const connection = statusState.kind === "ready" ? statusState.connection : null;

  const locationLabel = useMemo(() => {
    if (!connection) return null;
    return [connection.athleteCity, connection.athleteState, connection.athleteCountry].filter(Boolean).join(", ") || null;
  }, [connection]);

  async function handleConnect() {
    if (!user) return;
    setBusyAction("connect");
    setBanner(null);

    try {
      const token = await user.getIdToken();
      const response = await fetch("/api/strava/connect", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ returnTo: "/account" }),
      });

      const payload = (await response.json().catch(() => ({}))) as {
        authUrl?: string;
        error?: string;
      };

      if (!response.ok || !payload.authUrl) {
        throw new Error(payload.error || "Could not start Strava authorization.");
      }

      window.location.assign(payload.authUrl);
    } catch (error) {
      setBusyAction(null);
      setBanner(error instanceof Error ? error.message : "Could not start Strava authorization.");
    }
  }

  async function handleDisconnect() {
    if (!user) return;
    setBusyAction("disconnect");
    setBanner(null);

    try {
      const token = await user.getIdToken();
      const response = await fetch("/api/strava/disconnect", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error || "Could not disconnect Strava.");
      }

      setBanner("Strava disconnected.");
      await loadStatus();
      setClubsState({ kind: "idle" });
    } catch (error) {
      setBanner(error instanceof Error ? error.message : "Could not disconnect Strava.");
    } finally {
      setBusyAction(null);
    }
  }

  return (
    <section className="card" style={{ maxWidth: 760, margin: "24px auto 0" }}>
      <div className="stack" style={{ gap: 16 }}>
        <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
          <div className="stack" style={{ gap: 6 }}>
            <div className="section-title">Strava</div>
            <h2 style={{ margin: 0 }}>Connect Strava</h2>
            <p className="muted" style={{ margin: 0 }}>
              Connect with Strava via OAuth so Bidroom can read your club memberships and recent club activity without storing your Strava password.
            </p>
          </div>
          <span className="pill">
            {statusState.kind === "ready" && statusState.connected ? "Connected" : "Not connected"}
          </span>
        </div>

        {banner ? (
          <p className="notice" aria-live="polite" style={{ margin: 0 }}>
            {banner}
          </p>
        ) : null}

        {statusState.kind === "error" ? (
          <p className="notice" style={{ margin: 0 }}>
            {statusState.message}
          </p>
        ) : null}

        {statusState.kind === "ready" && !statusState.configured ? (
          <p className="notice" style={{ margin: 0 }}>
            Strava OAuth is not configured in this environment yet. Required env vars include `STRAVA_CLIENT_ID`, `STRAVA_CLIENT_SECRET`, `STRAVA_REDIRECT_URI`, and `STRAVA_TOKEN_ENCRYPTION_SECRET`.
          </p>
        ) : null}

        {connection ? (
          <div className="rides-detail-grid">
            <div>
              <div className="rides-detail-label">Athlete</div>
              <div>{connection.athleteName}</div>
            </div>
            <div>
              <div className="rides-detail-label">Connected</div>
              <div>{formatDateTime(connection.connectedAt)}</div>
            </div>
            <div>
              <div className="rides-detail-label">Token refreshes until</div>
              <div>{formatExpiresAt(connection.expiresAt)}</div>
            </div>
            <div>
              <div className="rides-detail-label">Scopes</div>
              <div>{connection.scopes.join(", ") || "None granted"}</div>
            </div>
            {locationLabel ? (
              <div>
                <div className="rides-detail-label">Profile location</div>
                <div>{locationLabel}</div>
              </div>
            ) : null}
            {connection.athleteUsername ? (
              <div>
                <div className="rides-detail-label">Username</div>
                <div>{connection.athleteUsername}</div>
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="row" style={{ gap: 12, flexWrap: "wrap" }}>
          <button
            className="button"
            type="button"
            disabled={
              busyAction !== null ||
              statusState.kind === "loading" ||
              (statusState.kind === "ready" && !statusState.configured)
            }
            onClick={handleConnect}
          >
            {busyAction === "connect" ? "Redirecting…" : connection ? "Reconnect Strava" : "Connect Strava"}
          </button>
          {connection ? (
            <button className="button secondary" type="button" disabled={busyAction !== null} onClick={handleDisconnect}>
              {busyAction === "disconnect" ? "Disconnecting…" : "Disconnect"}
            </button>
          ) : null}
        </div>

        {clubsState.kind === "loading" ? <p className="muted" style={{ margin: 0 }}>Loading your clubs…</p> : null}
        {clubsState.kind === "error" ? <p className="notice" style={{ margin: 0 }}>{clubsState.message}</p> : null}
        {clubsState.kind === "ready" ? (
          <div className="stack" style={{ gap: 14 }}>
            <div className="section-title">Your Strava Clubs</div>
            {clubsState.clubs.length === 0 ? (
              <p className="muted" style={{ margin: 0 }}>
                No clubs were returned for this Strava account.
              </p>
            ) : (
              clubsState.clubs.map((club) => (
                <article key={club.id} className="rides-sync-report">
                  <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
                    <strong>{club.name}</strong>
                    <span className="pill">{club.memberCount ? `${club.memberCount} members` : "Club"}</span>
                  </div>
                  <div className="muted">
                    {[club.city, club.state, club.country].filter(Boolean).join(", ") || club.sportType || "Strava club"}
                  </div>
                  {club.activities.length > 0 ? (
                    <div className="stack" style={{ gap: 8, marginTop: 10 }}>
                      {club.activities.map((activity) => (
                        <div key={`${club.id}-${activity.id ?? activity.title}`} style={{ borderTop: "1px solid rgba(15,23,42,0.08)", paddingTop: 8 }}>
                          <div>{activity.url ? <a className="link" href={activity.url} target="_blank" rel="noreferrer">{activity.title}</a> : activity.title}</div>
                          <div className="muted">
                            {[activity.sportType, activity.date ? formatDateTime(activity.date) : null, formatDistanceMiles(activity.distanceMiles)]
                              .filter(Boolean)
                              .join(" • ")}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="muted" style={{ marginTop: 10 }}>No recent club activities returned.</div>
                  )}
                </article>
              ))
            )}
          </div>
        ) : null}
      </div>
    </section>
  );
}
