"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  Timestamp,
} from "firebase/firestore";
import { db } from "@/src/lib/firebase";
import { useAuth } from "@/src/context/AuthContext";

type TripStatus = "draft" | "live" | "ended";

type MyTripIndexEntry = {
  tripId: string;
  name: string;
  status: TripStatus;
  inviteCode: string;
  listingLocationLabel: string | null;
  updatedAtMs: number;
  archivedAtMs: number | null;
};

type TripSnapshotEntry = {
  exists: boolean;
  name: string;
  status: TripStatus;
  inviteCode: string;
  listingImageUrl: string | null;
  listingLocationLabel: string | null;
  updatedAtMs: number;
};

type MyTripEntry = {
  tripId: string;
  name: string;
  status: TripStatus;
  inviteCode: string;
  listingImageUrl: string | null;
  listingLocationLabel: string | null;
  updatedAtMs: number;
  archivedAtMs: number | null;
};

function toMillis(value: unknown): number {
  if (value instanceof Timestamp) return value.toMillis();
  if (typeof value === "object" && value !== null && "toMillis" in value) {
    const candidate = value as { toMillis?: () => number };
    if (typeof candidate.toMillis === "function") return candidate.toMillis();
  }
  return 0;
}

function toOptionalString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function normalizeStatus(status: unknown): TripStatus {
  if (status === "live" || status === "ended") return status;
  return "draft";
}

export default function MyTripsPage() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const [indexTrips, setIndexTrips] = useState<MyTripIndexEntry[]>([]);
  const [tripSnapshots, setTripSnapshots] = useState<Record<string, TripSnapshotEntry>>({});
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState<{ tripId: string; kind: "archive" | "restore" | "delete" } | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace(`/login?next=${encodeURIComponent("/my-trips")}`);
      return;
    }

    const ref = collection(db, "users", user.uid, "myTrips");
    const unsub = onSnapshot(
      ref,
      (snap) => {
        const next = snap.docs.map((docSnap) => {
          const data = docSnap.data();
          return {
            tripId: typeof data.tripId === "string" ? data.tripId : docSnap.id,
            name: typeof data.name === "string" && data.name.trim() ? data.name : "Untitled trip",
            status: normalizeStatus(data.status),
            inviteCode: typeof data.inviteCode === "string" ? data.inviteCode : "",
            listingLocationLabel: toOptionalString(data.listingLocationLabel),
            updatedAtMs: Math.max(toMillis(data.updatedAt), toMillis(data.createdAt)),
            archivedAtMs: toMillis(data.archivedAt) || null,
          } satisfies MyTripIndexEntry;
        });

        setIndexTrips(next);
        setError(null);
      },
      (snapshotError) => setError(snapshotError.message)
    );

    return () => unsub();
  }, [loading, user, router]);

  useEffect(() => {
    if (!indexTrips.length) {
      setTripSnapshots({});
      return;
    }

    const unsubs = indexTrips.map((trip) =>
      onSnapshot(
        doc(db, "trips", trip.tripId),
        (snapshot) => {
          const data = snapshot.data();
          setTripSnapshots((prev) => ({
            ...prev,
            [trip.tripId]: {
              exists: snapshot.exists(),
              name:
                snapshot.exists() && typeof data?.name === "string" && data.name.trim()
                  ? data.name
                  : trip.name,
              status: snapshot.exists() ? normalizeStatus(data?.status) : trip.status,
              inviteCode:
                snapshot.exists() && typeof data?.inviteCode === "string" ? data.inviteCode : trip.inviteCode,
              listingImageUrl:
                snapshot.exists() ? toOptionalString(data?.listingImageUrl) : null,
              listingLocationLabel:
                snapshot.exists() ? toOptionalString(data?.listingLocationLabel) : trip.listingLocationLabel,
              updatedAtMs:
                snapshot.exists()
                  ? Math.max(toMillis(data?.updatedAt), toMillis(data?.createdAt), trip.updatedAtMs)
                  : trip.updatedAtMs,
            },
          }));
        },
        () => {
          setTripSnapshots((prev) => ({
            ...prev,
            [trip.tripId]: {
              exists: false,
              name: trip.name,
              status: trip.status,
              inviteCode: trip.inviteCode,
              listingImageUrl: null,
              listingLocationLabel: trip.listingLocationLabel,
              updatedAtMs: trip.updatedAtMs,
            },
          }));
        }
      )
    );

    return () => {
      for (const unsub of unsubs) unsub();
    };
  }, [indexTrips]);

  async function archiveTrip(tripId: string) {
    if (!user) return;

    setActionBusy({ tripId, kind: "archive" });
    setActionError(null);

    try {
      await setDoc(
        doc(db, "users", user.uid, "myTrips", tripId),
        {
          archivedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
    } catch (archiveError) {
      const asObj = (archiveError ?? {}) as { message?: unknown };
      setActionError(
        typeof asObj.message === "string" ? asObj.message : "Could not archive this trip."
      );
    } finally {
      setActionBusy(null);
    }
  }

  async function restoreTrip(tripId: string) {
    if (!user) return;

    setActionBusy({ tripId, kind: "restore" });
    setActionError(null);

    try {
      await setDoc(
        doc(db, "users", user.uid, "myTrips", tripId),
        {
          archivedAt: null,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
    } catch (restoreError) {
      const asObj = (restoreError ?? {}) as { message?: unknown };
      setActionError(
        typeof asObj.message === "string" ? asObj.message : "Could not restore this trip."
      );
    } finally {
      setActionBusy(null);
    }
  }

  async function deleteTripFromList(tripId: string, tripName: string) {
    if (!user) return;
    const confirmed = window.confirm(`Remove "${tripName}" from My Trips?`);
    if (!confirmed) return;

    setActionBusy({ tripId, kind: "delete" });
    setActionError(null);

    try {
      await deleteDoc(doc(db, "users", user.uid, "myTrips", tripId));
    } catch (deleteError) {
      const asObj = (deleteError ?? {}) as { message?: unknown };
      setActionError(
        typeof asObj.message === "string" ? asObj.message : "Could not remove this trip."
      );
    } finally {
      setActionBusy(null);
    }
  }

  if (loading) return <main className="page">Loading…</main>;
  if (!user) return <main className="page">Redirecting to sign in…</main>;

  const trips = indexTrips
    .map((trip) => {
      const snapshot = tripSnapshots[trip.tripId];
      return {
        tripId: trip.tripId,
        name: snapshot?.name ?? trip.name,
        status: snapshot?.status ?? trip.status,
        inviteCode: snapshot?.inviteCode ?? trip.inviteCode,
        listingImageUrl: snapshot?.listingImageUrl ?? null,
        listingLocationLabel: snapshot?.listingLocationLabel ?? trip.listingLocationLabel,
        updatedAtMs: snapshot?.updatedAtMs ?? trip.updatedAtMs,
        archivedAtMs: trip.archivedAtMs,
      } satisfies MyTripEntry;
    })
    .sort((a, b) => b.updatedAtMs - a.updatedAtMs || a.name.localeCompare(b.name));

  const activeTrips = trips.filter((trip) => trip.archivedAtMs === null);
  const archivedTrips = trips.filter((trip) => trip.archivedAtMs !== null);

  function renderTripRow(trip: MyTripEntry) {
    const href = trip.inviteCode
      ? `/trip/${trip.tripId}?code=${encodeURIComponent(trip.inviteCode)}`
      : `/trip/${trip.tripId}`;
    const busyKind = actionBusy?.tripId === trip.tripId ? actionBusy.kind : null;

    return (
      <li className="list-item" key={trip.tripId}>
        <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start", gap: 16 }}>
          <div className="row" style={{ alignItems: "flex-start", gap: 14 }}>
            {trip.listingImageUrl ? (
              <img
                src={trip.listingImageUrl}
                alt={trip.name}
                style={{
                  width: 120,
                  minWidth: 120,
                  height: 88,
                  borderRadius: 12,
                  border: "1px solid var(--line)",
                  objectFit: "cover",
                }}
              />
            ) : null}
            <div className="stack" style={{ gap: 8 }}>
              <strong>{trip.name}</strong>
              {trip.listingLocationLabel ? <div className="muted">{trip.listingLocationLabel}</div> : null}
              <span className="pill">Status: {trip.status}</span>
            </div>
          </div>
          <div className="row" style={{ justifyContent: "flex-end", flexWrap: "wrap", gap: 8 }}>
            <Link className="button secondary" href={href}>
              Open
            </Link>
            {trip.archivedAtMs === null ? (
              <button
                className="button ghost"
                onClick={() => archiveTrip(trip.tripId)}
                disabled={busyKind !== null}
              >
                {busyKind === "archive" ? "Archiving…" : "Archive"}
              </button>
            ) : (
              <button
                className="button ghost"
                onClick={() => restoreTrip(trip.tripId)}
                disabled={busyKind !== null}
              >
                {busyKind === "restore" ? "Restoring…" : "Restore"}
              </button>
            )}
            <button
              className="button ghost"
              onClick={() => deleteTripFromList(trip.tripId, trip.name)}
              disabled={busyKind !== null}
            >
              {busyKind === "delete" ? "Removing…" : "Delete"}
            </button>
          </div>
        </div>
      </li>
    );
  }

  return (
    <main className="page">
      <section className="hero">
        <h1 className="hero-title">My Trips</h1>
        <p className="hero-subtitle">Trips you created or joined. Archive old ones or remove them from this list.</p>
      </section>

      {error ? <p className="notice">{error}</p> : null}
      {actionError ? <p className="notice">{actionError}</p> : null}

      {trips.length === 0 ? (
        <section className="card" style={{ maxWidth: 620, margin: "0 auto" }}>
          <div className="stack">
            <p className="muted">You have no trips yet.</p>
            <div className="row">
              <Link className="button" href="/create-trip">
                Create Trip
              </Link>
            </div>
          </div>
        </section>
      ) : (
        <>
          <section className="card">
            <div className="row" style={{ justifyContent: "space-between", marginBottom: 14 }}>
              <div className="section-title" style={{ marginBottom: 0 }}>
                Active trips
              </div>
              {archivedTrips.length > 0 ? (
                <button className="button ghost" onClick={() => setShowArchived((prev) => !prev)}>
                  {showArchived ? "Hide archived" : `Show archived (${archivedTrips.length})`}
                </button>
              ) : null}
            </div>

            {activeTrips.length === 0 ? (
              <p className="muted">No active trips. Your archived trips are still available below.</p>
            ) : (
              <ul className="list">{activeTrips.map(renderTripRow)}</ul>
            )}
          </section>

          {showArchived && archivedTrips.length > 0 ? (
            <section className="card">
              <div className="section-title">Archived trips</div>
              <ul className="list">{archivedTrips.map(renderTripRow)}</ul>
            </section>
          ) : null}
        </>
      )}
    </main>
  );
}
