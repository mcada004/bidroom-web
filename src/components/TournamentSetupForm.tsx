"use client";

import { useMemo, useState } from "react";
import {
  DEFAULT_FORMAT,
  DEFAULT_GAME_TITLE,
  DEFAULT_TOURNAMENT_TITLE,
  MAX_TEAM_COUNT,
  MIN_TEAM_COUNT,
  buildBalancedTeams,
  createRankedPlayers,
  getBracketTypeForTeamCount,
  getDefaultTournamentSeedNames,
  resizePlayerNames,
  trimPlayerNames,
} from "@/src/lib/tournaments";

type TournamentSetupFormProps = {
  heading: string;
  subtitle: string;
  submitLabel: string;
  busy: boolean;
  error: string | null;
  initialValue?: {
    title: string;
    game: string;
    format: string;
    playerNames: string[];
  };
  lockedMessage?: string | null;
  onSubmit: (input: {
    title: string;
    game: string;
    format: string;
    playerNames: string[];
  }) => Promise<void> | void;
};

const GAME_OPTIONS = [
  "Halo 3",
  "Call of Duty",
  "Call of Duty: Modern Warfare 1",
  "Call of Duty: World at War",
  "Halo 2",
  "Halo Infinite",
];

export default function TournamentSetupForm({
  heading,
  subtitle,
  submitLabel,
  busy,
  error,
  initialValue,
  lockedMessage,
  onSubmit,
}: TournamentSetupFormProps) {
  const initialPlayers = useMemo(
    () =>
      resizePlayerNames(
        initialValue?.playerNames ?? getDefaultTournamentSeedNames(),
        Math.max(
          MIN_TEAM_COUNT,
          Math.min(
            MAX_TEAM_COUNT,
            Math.floor((initialValue?.playerNames.length ?? getDefaultTournamentSeedNames().length) / 2)
          )
        )
      ),
    [initialValue]
  );

  const [title, setTitle] = useState(() => initialValue?.title ?? DEFAULT_TOURNAMENT_TITLE);
  const [game, setGame] = useState(() => initialValue?.game ?? DEFAULT_GAME_TITLE);
  const [format, setFormat] = useState(() => initialValue?.format ?? DEFAULT_FORMAT);
  const [playerNames, setPlayerNames] = useState<string[]>(() => initialPlayers);
  const [localError, setLocalError] = useState<string | null>(null);

  const trimmedPlayers = useMemo(() => trimPlayerNames(playerNames), [playerNames]);
  const teamCount = Math.max(MIN_TEAM_COUNT, Math.floor(playerNames.length / 2));
  const bracketType = getBracketTypeForTeamCount(teamCount);
  const previewTeams = useMemo(
    () => buildBalancedTeams(createRankedPlayers(trimmedPlayers)),
    [trimmedPlayers]
  );
  const editingLocked = Boolean(lockedMessage);

  function updatePlayerName(index: number, nextValue: string) {
    setPlayerNames((current) =>
      current.map((name, playerIndex) => (playerIndex === index ? nextValue : name))
    );
  }

  function addTeam() {
    setPlayerNames((current) => resizePlayerNames(current, teamCount + 1));
  }

  function removeTeam() {
    setPlayerNames((current) => resizePlayerNames(current, teamCount - 1));
  }

  async function handleSubmit() {
    if (editingLocked) return;

    const normalizedPlayers = trimPlayerNames(playerNames);
    if (teamCount < MIN_TEAM_COUNT || teamCount > MAX_TEAM_COUNT) {
      setLocalError(`Team count must stay between ${MIN_TEAM_COUNT} and ${MAX_TEAM_COUNT}.`);
      return;
    }

    if (normalizedPlayers.some((name) => !name)) {
      setLocalError("Enter a name for every seeded player before saving the tournament.");
      return;
    }

    setLocalError(null);
    await onSubmit({
      title: title.trim() || DEFAULT_TOURNAMENT_TITLE,
      game: game.trim() || DEFAULT_GAME_TITLE,
      format: format.trim() || DEFAULT_FORMAT,
      playerNames: normalizedPlayers,
    });
  }

  return (
    <main className="page">
      <section className="hero">
        <h1 className="hero-title">{heading}</h1>
        <p className="hero-subtitle">{subtitle}</p>
      </section>

      <section className="card">
        <div className="stack">
          <div className="notice">
            Team size stays 2v2. With 4 teams, the tracker uses double elimination. Any other team count uses seeded single elimination with automatic byes when needed.
          </div>

          {lockedMessage ? <div className="notice">{lockedMessage}</div> : null}

          <div className="grid-2">
            <label className="label">
              Tournament title
              <input
                className="input"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                disabled={busy || editingLocked}
              />
            </label>

            <label className="label">
              Game title
              <select
                className="input"
                value={game}
                onChange={(event) => setGame(event.target.value)}
                disabled={busy || editingLocked}
              >
                {GAME_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
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
                disabled={busy || editingLocked}
              />
            </label>

            <div className="label">
              Team setup
              <div className="card soft" style={{ padding: 16 }}>
                <div className="row" style={{ justifyContent: "space-between" }}>
                  <div className="stack" style={{ gap: 6 }}>
                    <strong>{teamCount} teams</strong>
                    <span className="muted" style={{ fontSize: 13 }}>
                      {playerNames.length} players • {bracketType === "double_elimination" ? "Double elimination" : "Single elimination"}
                    </span>
                  </div>
                  <div className="row">
                    <button
                      type="button"
                      className="button ghost"
                      onClick={removeTeam}
                      disabled={busy || editingLocked || teamCount <= MIN_TEAM_COUNT}
                    >
                      Remove team
                    </button>
                    <button
                      type="button"
                      className="button secondary"
                      onClick={addTeam}
                      disabled={busy || editingLocked || teamCount >= MAX_TEAM_COUNT}
                    >
                      Add team
                    </button>
                  </div>
                </div>
              </div>
            </div>
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
                    disabled={busy || editingLocked}
                  />
                </label>
              ))}
            </div>
          </div>

          <div>
            <div className="section-title">Team preview</div>
            <div className="team-grid">
              {previewTeams.map((team) => (
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

          {localError ? <p className="notice">{localError}</p> : null}
          {error ? <p className="notice">{error}</p> : null}

          <div className="row">
            <button
              type="button"
              className="button"
              onClick={handleSubmit}
              disabled={busy || editingLocked}
            >
              {busy ? "Saving…" : submitLabel}
            </button>
          </div>
        </div>
      </section>
    </main>
  );
}
