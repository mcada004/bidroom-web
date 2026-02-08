"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { collection, onSnapshot, Timestamp } from "firebase/firestore";
import { db } from "@/src/lib/firebase";
import { useAuth } from "@/src/context/AuthContext";

type TripStatus = "draft" | "live" | "ended";

type MyTripEntry = {
  tripId: string;
  name: string;
  status: TripStatus;
  inviteCode: string;
  updatedAtMs: number;
};

function toMillis(value: unknown): number {
  if (value instanceof Timestamp) return value.toMillis();
  if (typeof value === "object" && value !== null && "toMillis" in value) {
    const candidate = value as { toMillis?: () => number };
    if (typeof candidate.toMillis === "function") return candidate.toMillis();
  }
  return 0;
}

function normalizeStatus(status: unknown): TripStatus {
  if (status === "live" || status === "ended") return status;
  return "draft";
}

export default function MyTripsPage() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const [trips, setTrips] = useState<MyTripEntry[]>([]);
  const [error, setError] = useState<string | null>(null);

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
        const next = snap.docs
          .map((docSnap) => {
            const data = docSnap.data();
            return {
              tripId: typeof data.tripId === "string" ? data.tripId : docSnap.id,
              name: typeof data.name === "string" && data.name.trim() ? data.name : "Untitled trip",
              status: normalizeStatus(data.status),
              inviteCode: typeof data.inviteCode === "string" ? data.inviteCode : "",
              updatedAtMs: Math.max(toMillis(data.updatedAt), toMillis(data.createdAt)),
            } as MyTripEntry;
          })
          .sort((a, b) => b.updatedAtMs - a.updatedAtMs || a.name.localeCompare(b.name));

        setTrips(next);
        setError(null);
      },
      (snapshotError) => setError(snapshotError.message)
    );

    return () => unsub();
  }, [loading, user, router]);

  if (loading) return <main className="page">Loading…</main>;
  if (!user) return <main className="page">Redirecting to sign in…</main>;

  return (
    <main className="page">
      <section className="hero">
        <h1 className="hero-title">My Trips</h1>
        <p className="hero-subtitle">Trips you created or joined.</p>
      </section>

      {error ? <p className="notice">{error}</p> : null}

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
        <section className="card">
          <ul className="list">
            {trips.map((trip) => {
              const href = trip.inviteCode
                ? `/trip/${trip.tripId}?code=${encodeURIComponent(trip.inviteCode)}`
                : `/trip/${trip.tripId}`;

              return (
                <li className="list-item" key={trip.tripId}>
                  <div className="row" style={{ justifyContent: "space-between" }}>
                    <div className="stack" style={{ gap: 8 }}>
                      <strong>{trip.name}</strong>
                      <span className="pill">Status: {trip.status}</span>
                    </div>
                    <Link className="button secondary" href={href}>
                      Open
                    </Link>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </main>
  );
}
