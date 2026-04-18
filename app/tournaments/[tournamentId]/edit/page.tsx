"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { doc, onSnapshot, updateDoc } from "firebase/firestore";
import TournamentSetupForm from "@/src/components/TournamentSetupForm";
import { useAuth } from "@/src/context/AuthContext";
import { db } from "@/src/lib/firebase";
import { coerceTournamentDocument, createInitialTournamentState } from "@/src/lib/tournaments";

export default function EditTournamentPage() {
  const params = useParams<{ tournamentId: string }>();
  const router = useRouter();
  const { user, loading } = useAuth();
  const tournamentId = params.tournamentId;

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lockedMessage, setLockedMessage] = useState<string | null>(null);
  const [initialValue, setInitialValue] = useState<{
    title: string;
    game: string;
    format: string;
    playerNames: string[];
  } | null>(null);

  useEffect(() => {
    if (loading || user) return;
    router.replace(`/login?next=${encodeURIComponent(`/tournaments/${tournamentId}/edit`)}`);
  }, [loading, user, router, tournamentId]);

  useEffect(() => {
    if (!user) return;

    const tournamentRef = doc(db, "tournaments", tournamentId);
    const unsubscribe = onSnapshot(
      tournamentRef,
      (snapshot) => {
        if (!snapshot.exists()) {
          setError("Tournament not found.");
          setInitialValue(null);
          return;
        }

        const tournament = coerceTournamentDocument(snapshot.data());
        if (!tournament) {
          setError("Tournament data is invalid.");
          setInitialValue(null);
          return;
        }

        if (tournament.ownerId !== user.uid) {
          setError("Only the tournament creator can edit this tournament.");
          setInitialValue(null);
          return;
        }

        setInitialValue({
          title: tournament.title,
          game: tournament.game,
          format: tournament.format,
          playerNames: tournament.players.map((player) => player.name),
        });
        setLockedMessage(
          tournament.status === "pending"
            ? null
            : "This tournament already has saved results. Reset it first if you want to change teams or seeds."
        );
        setError(null);
      },
      (snapshotError) => setError(snapshotError.message)
    );

    return () => unsubscribe();
  }, [tournamentId, user]);

  async function saveTournament(input: {
    title: string;
    game: string;
    format: string;
    playerNames: string[];
  }) {
    if (!user) return;

    setBusy(true);
    setError(null);

    try {
      const state = createInitialTournamentState(input.playerNames);
      await updateDoc(doc(db, "tournaments", tournamentId), {
        title: input.title,
        game: input.game,
        format: input.format,
        numberOfPlayers: state.players.length,
        players: state.players,
        teams: state.teams,
        settings: state.settings,
        bracket: state.bracket,
        status: state.status,
        updatedAt: new Date(),
      });

      router.push(`/tournaments/${tournamentId}`);
    } catch (saveError: unknown) {
      const asObject = (saveError ?? {}) as { message?: unknown };
      setError(typeof asObject.message === "string" ? asObject.message : "Could not save tournament.");
      setBusy(false);
    }
  }

  if (loading) return <main className="page">Loading…</main>;
  if (!user) return <main className="page">Redirecting to sign in…</main>;

  if (error && !initialValue) {
    return (
      <main className="page">
        <section className="hero">
          <h1 className="hero-title">Edit tournament</h1>
          <p className="hero-subtitle">{error}</p>
        </section>
      </main>
    );
  }

  if (!initialValue) return <main className="page">Loading tournament…</main>;

  return (
    <>
      <TournamentSetupForm
        key={`${initialValue.title}-${initialValue.playerNames.join("|")}`}
        heading="Edit tournament"
        subtitle="Update teams, seeds, and details before results start coming in."
        submitLabel="Save tournament"
        busy={busy}
        error={error}
        initialValue={initialValue}
        lockedMessage={lockedMessage}
        onSubmit={saveTournament}
      />
      {lockedMessage ? (
        <div className="page section row" style={{ justifyContent: "center" }}>
          <Link className="button secondary" href={`/tournaments/${tournamentId}`}>
            Back to tournament
          </Link>
        </div>
      ) : null}
    </>
  );
}
