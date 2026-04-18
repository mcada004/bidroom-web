"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { collection, onSnapshot, Timestamp } from "firebase/firestore";
import { useAuth } from "@/src/context/AuthContext";
import { db } from "@/src/lib/firebase";
import {
  coerceTournamentDocument,
  getTeamById,
  getTournamentSharePath,
  type TournamentStatus,
} from "@/src/lib/tournaments";

type TournamentListEntry = {
  id: string;
  title: string;
  game: string;
  format: string;
  status: TournamentStatus;
  teamCount: number;
  championName: string | null;
  updatedAtMs: number;
};

function toMillis(value: unknown) {
  if (value instanceof Timestamp) return value.toMillis();
  if (value instanceof Date) return value.getTime();
  if (typeof value === "object" && value !== null && "toMillis" in value) {
    const candidate = value as { toMillis?: () => number };
    if (typeof candidate.toMillis === "function") return candidate.toMillis();
  }
  return 0;
}

export default function TournamentsPage() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const [entries, setEntries] = useState<TournamentListEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [copyStateById, setCopyStateById] = useState<Record<string, "idle" | "copied">>({});
  const [copyError, setCopyError] = useState<string | null>(null);

  useEffect(() => {
    if (loading || user) return;
    router.replace(`/login?next=${encodeURIComponent("/tournaments")}`);
  }, [loading, user, router]);

  useEffect(() => {
    if (!user) return;

    const tournamentsRef = collection(db, "tournaments");
    const unsubscribe = onSnapshot(
      tournamentsRef,
      (snapshot) => {
        const nextEntries = snapshot.docs
          .map((docSnapshot) => {
            const data = docSnapshot.data() as Record<string, unknown>;
            const tournament = coerceTournamentDocument(data);
            if (!tournament || tournament.ownerId !== user.uid) return null;

            const champion = getTeamById(tournament.teams, tournament.bracket.championTeamId);
            const updatedAtMs = Math.max(toMillis(data.updatedAt), toMillis(data.createdAt));

            return {
              id: docSnapshot.id,
              title: tournament.title,
              game: tournament.game,
              format: tournament.format,
              status: tournament.status,
              teamCount: tournament.teams.length,
              championName: champion?.name ?? null,
              updatedAtMs,
            } satisfies TournamentListEntry;
          })
          .filter((entry): entry is TournamentListEntry => Boolean(entry))
          .sort((left, right) => right.updatedAtMs - left.updatedAtMs || left.title.localeCompare(right.title));

        setEntries(nextEntries);
        setError(null);
      },
      (snapshotError) => setError(snapshotError.message)
    );

    return () => unsubscribe();
  }, [user]);

  useEffect(() => {
    const copiedId = Object.entries(copyStateById).find(([, state]) => state === "copied")?.[0];
    if (!copiedId) return;

    const timeout = window.setTimeout(() => {
      setCopyStateById((current) => ({ ...current, [copiedId]: "idle" }));
    }, 1800);

    return () => window.clearTimeout(timeout);
  }, [copyStateById]);

  async function copyShareLink(tournamentId: string) {
    if (typeof window === "undefined" || !window.navigator?.clipboard?.writeText) {
      setCopyError("Couldn't copy automatically. Copy the link from the tournament page.");
      return;
    }

    try {
      const shareUrl = `${window.location.origin}${getTournamentSharePath(tournamentId)}`;
      await window.navigator.clipboard.writeText(shareUrl);
      setCopyStateById((current) => ({ ...current, [tournamentId]: "copied" }));
      setCopyError(null);
    } catch {
      setCopyError("Couldn't copy automatically. Copy the link from the tournament page.");
    }
  }

  if (loading) return <main className="page">Loading…</main>;
  if (!user) return <main className="page">Redirecting to sign in…</main>;

  return (
    <main className="page">
      <section className="hero">
        <h1 className="hero-title">Tournaments</h1>
        <p className="hero-subtitle">
          Create and manage live LAN brackets, then share the tracking link with the group.
        </p>
        <div className="row" style={{ justifyContent: "center" }}>
          <Link className="button" href="/tournaments/new">
            New tournament
          </Link>
        </div>
      </section>

      {error ? <p className="notice">{error}</p> : null}
      {copyError ? <p className="notice">{copyError}</p> : null}

      {entries.length === 0 ? (
        <section className="card" style={{ maxWidth: 680, margin: "0 auto" }}>
          <div className="stack">
            <p className="muted">You have not created any tournaments yet.</p>
            <div className="row">
              <Link className="button" href="/tournaments/new">
                Create tournament
              </Link>
            </div>
          </div>
        </section>
      ) : (
        <section className="card">
          <div className="section-title">Your tournaments</div>
          <ul className="list">
            {entries.map((entry) => (
              <li key={entry.id} className="list-item">
                <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div className="stack" style={{ gap: 8 }}>
                    <strong>{entry.title}</strong>
                    <div className="muted">
                      {entry.game} • {entry.format}
                    </div>
                    <div className="row">
                      <span className={`status-pill ${entry.status}`}>{entry.status}</span>
                      <span className="pill">{entry.teamCount} teams</span>
                      {entry.championName ? <span className="pill">Winner: {entry.championName}</span> : null}
                    </div>
                  </div>
                  <div className="row" style={{ justifyContent: "flex-end" }}>
                    {entry.status === "pending" ? (
                      <Link className="button ghost" href={`/tournaments/${entry.id}/edit`}>
                        Edit
                      </Link>
                    ) : null}
                    <button
                      type="button"
                      className="button ghost"
                      onClick={() => copyShareLink(entry.id)}
                    >
                      {copyStateById[entry.id] === "copied" ? "Copied!" : "Copy share link"}
                    </button>
                    <Link className="button secondary" href={`/tournaments/${entry.id}`}>
                      Open
                    </Link>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
