"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { useAuth } from "@/src/context/AuthContext";
import { db } from "@/src/lib/firebase";
import {
  DEFAULT_FORMAT,
  DEFAULT_GAME_TITLE,
  DEFAULT_TOURNAMENT_TITLE,
  buildBalancedTeams,
  createInitialTournamentState,
  createRankedPlayers,
  getDefaultTournamentSeedNames,
  trimPlayerNames,
} from "@/src/lib/tournaments";

const DEFAULT_STATE = createInitialTournamentState(getDefaultTournamentSeedNames());

export default function NewTournamentPage() {
  const router = useRouter();
  const { user, loading } = useAuth();

  const [title, setTitle] = useState(DEFAULT_TOURNAMENT_TITLE);
  const [game, setGame] = useState(DEFAULT_GAME_TITLE);
  const [format, setFormat] = useState(DEFAULT_FORMAT);
  const [numberOfPlayers, setNumberOfPlayers] = useState(8);
  const [playerNames, setPlayerNames] = useState<string[]>(getDefaultTournamentSeedNames());
  const [seededTeams, setSeededTeams] = useState(DEFAULT_STATE.teams);
  const [playersChangedSinceSeeding, setPlayersChangedSinceSeeding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (loading || user) return;
    router.replace(`/login?next=${encodeURIComponent("/tournaments/new")}`);
  }, [loading, user, router]);

  const trimmedPlayers = useMemo(() => trimPlayerNames(playerNames), [playerNames]);

  function reseedTeams() {
    const players = createRankedPlayers(trimmedPlayers);
    setSeededTeams(buildBalancedTeams(players));
    setPlayersChangedSinceSeeding(false);
  }

  function updatePlayerName(index: number, nextValue: string) {
    setPlayerNames((current) =>
      current.map((name, playerIndex) => (playerIndex === index ? nextValue : name))
    );
    setPlayersChangedSinceSeeding(true);
  }

  async function createTournament() {
    if (!user) return;

    setBusy(true);
    setError(null);

    try {
      const normalizedTitle = title.trim() || DEFAULT_TOURNAMENT_TITLE;
      const normalizedGame = game.trim() || DEFAULT_GAME_TITLE;
      const normalizedFormat = format.trim() || DEFAULT_FORMAT;
      const normalizedPlayers = trimPlayerNames(playerNames);

      if (numberOfPlayers !== 8) {
        throw new Error("This v1 bracket supports exactly 8 players.");
      }

      if (normalizedPlayers.length !== 8 || normalizedPlayers.some((name) => !name)) {
        throw new Error("Enter a name for all 8 seeded players.");
      }

      const state = createInitialTournamentState(normalizedPlayers);
      const tournamentRef = await addDoc(collection(db, "tournaments"), {
        title: normalizedTitle,
        game: normalizedGame,
        format: normalizedFormat,
        numberOfPlayers: 8,
        ownerId: user.uid,
        isPublic: true,
        players: state.players,
        teams: state.teams,
        settings: {
          teamSize: 2,
          bracketType: "double_elimination",
          allowGrandFinalReset: true,
        },
        bracket: state.bracket,
        status: state.status,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      router.push(`/tournaments/${tournamentRef.id}`);
    } catch (creationError: unknown) {
      const asObject = (creationError ?? {}) as { message?: unknown };
      setError(
        typeof asObject.message === "string"
          ? asObject.message
          : "Could not create tournament."
      );
      setBusy(false);
    }
  }

  if (loading) return <main className="page">Loading…</main>;
  if (!user) return <main className="page">Redirecting to sign in…</main>;

  return (
    <main className="page">
      <section className="hero">
        <h1 className="hero-title">New tournament</h1>
        <p className="hero-subtitle">
          Create a shareable 4-team double-elimination bracket that updates live on phones.
        </p>
      </section>

      <section className="card">
        <div className="stack">
          <div className="notice">
            This v1 tracker is built for 8 ranked players turning into 4 balanced 2v2 teams.
          </div>

          <div className="grid-2">
            <label className="label">
              Tournament title
              <input
                className="input"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                disabled={busy}
              />
            </label>

            <label className="label">
              Game title
              <select
                className="input"
                value={game}
                onChange={(event) => setGame(event.target.value)}
                disabled={busy}
              >
                <option value="Halo 3">Halo 3</option>
                <option value="Call of Duty">Call of Duty</option>
                <option value="Halo 2">Halo 2</option>
                <option value="Halo Infinite">Halo Infinite</option>
              </select>
            </label>
          </div>

          <div className="grid-2">
            <label className="label">
              Format
              <input
                className="input"
                value={format}
                onChange={(event) => setFormat(event.target.value)}
                disabled={busy}
              />
            </label>

            <label className="label">
              Number of players
              <input
                className="input"
                type="number"
                min={8}
                max={8}
                step={1}
                value={numberOfPlayers}
                onChange={(event) => setNumberOfPlayers(Number(event.target.value))}
                disabled={busy}
              />
            </label>
          </div>

          <div>
            <div className="section-title">Ranked player seeds</div>
            <div className="tournament-seed-grid">
              {playerNames.map((name, index) => (
                <label className="label" key={`player-seed-${index + 1}`}>
                  Seed {index + 1}
                  <input
                    className="input"
                    value={name}
                    onChange={(event) => updatePlayerName(index, event.target.value)}
                    disabled={busy}
                  />
                </label>
              ))}
            </div>
          </div>

          <div className="row">
            <button type="button" className="button secondary" onClick={reseedTeams} disabled={busy}>
              Balanced teams
            </button>
            <span className="muted" style={{ fontSize: 13 }}>
              Pairs 1+8, 2+7, 3+6, and 4+5.
            </span>
          </div>

          {playersChangedSinceSeeding ? (
            <p className="notice">
              Player seeds changed. Click the Balanced teams button again to refresh the preview.
            </p>
          ) : null}

          <div>
            <div className="section-title">Team preview</div>
            <div className="team-grid">
              {seededTeams.map((team) => (
                <article key={team.id} className="team-card">
                  <div className="row" style={{ justifyContent: "space-between" }}>
                    <strong>{team.label}</strong>
                    <span className="pill">Seed {team.seed}</span>
                  </div>
                  <div className="team-card-name">{team.name}</div>
                </article>
              ))}
            </div>
          </div>

          {error ? <p className="notice">{error}</p> : null}

          <div className="row">
            <button type="button" className="button" onClick={createTournament} disabled={busy}>
              {busy ? "Creating…" : "Create tournament"}
            </button>
          </div>
        </div>
      </section>
    </main>
  );
}
