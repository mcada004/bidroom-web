"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { addDoc, collection } from "firebase/firestore";
import TournamentSetupForm from "@/src/components/TournamentSetupForm";
import { useAuth } from "@/src/context/AuthContext";
import { db } from "@/src/lib/firebase";
import { createInitialTournamentState } from "@/src/lib/tournaments";

type FirestoreLikeError = {
  code?: string;
  message?: string;
};

function extractFirestoreErrorMessage(error: unknown) {
  const asObject = (error ?? {}) as FirestoreLikeError;

  if (asObject.code === "permission-denied") {
    return "Tournament writes are blocked by Firestore permissions. Deploy the updated tournament rules, then try again.";
  }

  return typeof asObject.message === "string"
    ? asObject.message
    : "Could not create tournament.";
}

export default function NewTournamentPage() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (loading || user) return;
    router.replace(`/login?next=${encodeURIComponent("/tournaments/new")}`);
  }, [loading, user, router]);

  async function createTournament(input: {
    title: string;
    game: string;
    format: string;
    playerNames: string[];
  }) {
    if (!user) return;

    setBusy(true);
    setError(null);

    try {
      const now = new Date();
      const state = createInitialTournamentState(input.playerNames);
      const tournamentRef = await addDoc(collection(db, "tournaments"), {
        title: input.title,
        game: input.game,
        format: input.format,
        numberOfPlayers: state.players.length,
        ownerId: user.uid,
        isPublic: true,
        players: state.players,
        teams: state.teams,
        settings: state.settings,
        bracket: state.bracket,
        status: state.status,
        createdAt: now,
        updatedAt: now,
      });

      router.push(`/tournaments/${tournamentRef.id}`);
    } catch (creationError: unknown) {
      setError(extractFirestoreErrorMessage(creationError));
      setBusy(false);
    }
  }

  if (loading) return <main className="page">Loading…</main>;
  if (!user) return <main className="page">Redirecting to sign in…</main>;

  return (
    <TournamentSetupForm
      heading="New tournament"
      subtitle="Create a shareable LAN bracket that updates live on phones."
      submitLabel="Create tournament"
      busy={busy}
      error={error}
      onSubmit={createTournament}
    />
  );
}
