"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { doc, onSnapshot, runTransaction } from "firebase/firestore";
import { useAuth } from "@/src/context/AuthContext";
import { db } from "@/src/lib/firebase";
import {
  TOURNAMENT_MATCH_GROUPS,
  applyMatchResult,
  coerceTournamentDocument,
  getPlayerById,
  getTeamById,
  resetBracket,
  type MatchId,
  type TournamentDocument,
  type TournamentMatch,
} from "@/src/lib/tournaments";

type ScoreInputMap = Record<MatchId, { score1: string; score2: string }>;

const EMPTY_SCORE_INPUTS: ScoreInputMap = {
  "wb-semi-1": { score1: "", score2: "" },
  "wb-semi-2": { score1: "", score2: "" },
  "lb-elim": { score1: "", score2: "" },
  "wb-final": { score1: "", score2: "" },
  "lb-final": { score1: "", score2: "" },
  "grand-final": { score1: "", score2: "" },
  "grand-final-reset": { score1: "", score2: "" },
};

function buildScoreInputs(tournament: TournamentDocument): ScoreInputMap {
  const next = { ...EMPTY_SCORE_INPUTS };

  for (const match of tournament.bracket.matches) {
    next[match.id] = {
      score1: typeof match.score1 === "number" ? String(match.score1) : "",
      score2: typeof match.score2 === "number" ? String(match.score2) : "",
    };
  }

  return next;
}

function getStatusPillClass(status: string) {
  if (status === "completed") return "status-pill completed";
  if (status === "live") return "status-pill live";
  return "status-pill pending";
}

export default function TournamentPage() {
  const params = useParams<{ tournamentId: string }>();
  const { user } = useAuth();
  const tournamentId = params.tournamentId;

  const [tournament, setTournament] = useState<TournamentDocument | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [copyState, setCopyState] = useState<"idle" | "copied">("idle");
  const [copyError, setCopyError] = useState<string | null>(null);
  const [shareUrl, setShareUrl] = useState("");
  const [savingMatchId, setSavingMatchId] = useState<MatchId | null>(null);
  const [resetting, setResetting] = useState(false);
  const [scoreInputs, setScoreInputs] = useState<ScoreInputMap>(EMPTY_SCORE_INPUTS);

  useEffect(() => {
    const tournamentRef = doc(db, "tournaments", tournamentId);
    const unsubscribe = onSnapshot(
      tournamentRef,
      (snapshot) => {
        if (!snapshot.exists()) {
          setTournament(null);
          setError("Tournament not found.");
          return;
        }

        const nextTournament = coerceTournamentDocument(snapshot.data());
        if (!nextTournament) {
          setTournament(null);
          setError("Tournament data is invalid.");
          return;
        }

        setTournament(nextTournament);
        setScoreInputs(buildScoreInputs(nextTournament));
        setError(null);
      },
      (snapshotError) => {
        setTournament(null);
        setError(snapshotError.message);
      }
    );

    return () => unsubscribe();
  }, [tournamentId]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setShareUrl(window.location.href);
  }, [tournamentId]);

  useEffect(() => {
    if (copyState !== "copied") return;
    const timeout = window.setTimeout(() => setCopyState("idle"), 1800);
    return () => window.clearTimeout(timeout);
  }, [copyState]);

  const isOwner = Boolean(user && tournament && user.uid === tournament.ownerId);
  const matchesById = useMemo(() => {
    return new Map(tournament?.bracket.matches.map((match) => [match.id, match]) ?? []);
  }, [tournament]);
  const champion = tournament ? getTeamById(tournament.teams, tournament.bracket.championTeamId) : null;

  function updateScoreInput(matchId: MatchId, field: "score1" | "score2", value: string) {
    setScoreInputs((current) => ({
      ...current,
      [matchId]: {
        ...current[matchId],
        [field]: value,
      },
    }));
  }

  async function copyShareLink() {
    if (!shareUrl || typeof window === "undefined" || !window.navigator?.clipboard?.writeText) {
      setCopyError("Couldn't copy automatically. Copy the link manually.");
      return;
    }

    try {
      await window.navigator.clipboard.writeText(shareUrl);
      setCopyState("copied");
      setCopyError(null);
    } catch {
      setCopyError("Couldn't copy automatically. Copy the link manually.");
    }
  }

  async function saveMatch(matchId: MatchId) {
    if (!user || !tournament || !isOwner) return;

    const score1 = Number(scoreInputs[matchId].score1);
    const score2 = Number(scoreInputs[matchId].score2);

    setSavingMatchId(matchId);
    setActionNotice(null);
    setActionError(null);

    try {
      await runTransaction(db, async (transaction) => {
        const tournamentRef = doc(db, "tournaments", tournamentId);
        const snapshot = await transaction.get(tournamentRef);

        if (!snapshot.exists()) {
          throw new Error("Tournament not found.");
        }

        const latestTournament = coerceTournamentDocument(snapshot.data());
        if (!latestTournament) {
          throw new Error("Tournament data is invalid.");
        }

        if (latestTournament.ownerId !== user.uid) {
          throw new Error("Only the tournament creator can edit results.");
        }

        const nextState = applyMatchResult({
          teams: latestTournament.teams,
          bracket: latestTournament.bracket,
          matchId,
          score1,
          score2,
        });

        transaction.update(tournamentRef, {
          bracket: nextState.bracket,
          status: nextState.status,
          updatedAt: new Date(),
        });
      });

      const matchName = matchesById.get(matchId)?.roundName ?? "Match";
      setActionNotice(`${matchName} saved.`);
    } catch (saveError: unknown) {
      const asObject = (saveError ?? {}) as { message?: unknown };
      setActionError(
        typeof asObject.message === "string"
          ? asObject.message
          : "Could not save match result."
      );
    } finally {
      setSavingMatchId(null);
    }
  }

  async function resetTournament() {
    if (!user || !tournament || !isOwner) return;
    const confirmed = window.confirm("Reset this tournament? All recorded results will be cleared.");
    if (!confirmed) return;

    setResetting(true);
    setActionNotice(null);
    setActionError(null);

    try {
      await runTransaction(db, async (transaction) => {
        const tournamentRef = doc(db, "tournaments", tournamentId);
        const snapshot = await transaction.get(tournamentRef);

        if (!snapshot.exists()) {
          throw new Error("Tournament not found.");
        }

        const latestTournament = coerceTournamentDocument(snapshot.data());
        if (!latestTournament) {
          throw new Error("Tournament data is invalid.");
        }

        if (latestTournament.ownerId !== user.uid) {
          throw new Error("Only the tournament creator can reset this bracket.");
        }

        const nextState = resetBracket(latestTournament.teams);

        transaction.update(tournamentRef, {
          bracket: nextState.bracket,
          status: nextState.status,
          updatedAt: new Date(),
        });
      });

      setActionNotice("Tournament reset.");
    } catch (resetError: unknown) {
      const asObject = (resetError ?? {}) as { message?: unknown };
      setActionError(
        typeof asObject.message === "string"
          ? asObject.message
          : "Could not reset tournament."
      );
    } finally {
      setResetting(false);
    }
  }

  if (error) return <main className="page">{error}</main>;
  if (!tournament) return <main className="page">Loading tournament…</main>;

  return (
    <main className="page">
      <section className="hero">
        <h1 className="hero-title">{tournament.title}</h1>
        <p className="hero-subtitle">
          {tournament.game} • {tournament.format}
        </p>
        <div className="tournament-meta">
          <span className={getStatusPillClass(tournament.status)}>{tournament.status}</span>
          <span className="pill">{tournament.numberOfPlayers} players</span>
          <span className="pill">4 teams</span>
          {isOwner ? <span className="pill">Creator can edit</span> : <span className="pill">View-only link</span>}
        </div>
      </section>

      {champion ? (
        <section className="card section">
          <div className="section-title">Champion</div>
          <div className="team-card">
            <strong>{champion.label}</strong>
            <div className="team-card-name">{champion.name}</div>
          </div>
        </section>
      ) : null}

      {actionNotice ? <p className="notice section">{actionNotice}</p> : null}
      {actionError ? <p className="notice section">{actionError}</p> : null}

      <section className="grid-2 section">
        <article className="card">
          <div className="section-title">Players / rankings</div>
          <ul className="list">
            {tournament.players.map((player) => (
              <li key={player.id} className="list-item">
                <div className="row" style={{ justifyContent: "space-between" }}>
                  <strong>Seed {player.seed}</strong>
                  <span>{player.name}</span>
                </div>
              </li>
            ))}
          </ul>
        </article>

        <article className="card">
          <div className="section-title">Balanced teams</div>
          <div className="team-grid">
            {tournament.teams.map((team) => (
              <article key={team.id} className="team-card">
                <div className="row" style={{ justifyContent: "space-between" }}>
                  <strong>{team.label}</strong>
                  <span className="pill">Seed {team.seed}</span>
                </div>
                <div className="team-card-name">{team.name}</div>
                <div className="muted" style={{ fontSize: 13 }}>
                  {team.playerIds
                    .map((playerId) => getPlayerById(tournament.players, playerId)?.name ?? "TBD")
                    .join(" / ")}
                </div>
              </article>
            ))}
          </div>
        </article>
      </section>

      <section className="card section">
        <div className="row" style={{ justifyContent: "space-between", marginBottom: 16 }}>
          <div>
            <div className="section-title" style={{ marginBottom: 6 }}>
              Bracket
            </div>
            <div className="muted">Scores save instantly and advance the next round automatically.</div>
          </div>
          {isOwner ? (
            <button
              type="button"
              className="button ghost"
              onClick={resetTournament}
              disabled={resetting || savingMatchId !== null}
            >
              {resetting ? "Resetting…" : "Reset tournament"}
            </button>
          ) : null}
        </div>

        <div className="tournament-columns">
          {TOURNAMENT_MATCH_GROUPS.map((group) => (
            <div key={group.title} className="match-group">
              <div className="section-title">{group.title}</div>
              <div className="match-list">
                {group.matchIds.map((matchId) => {
                  const match = matchesById.get(matchId);
                  if (!match) return null;

                  return (
                    <MatchCard
                      key={match.id}
                      tournament={tournament}
                      match={match}
                      score1={scoreInputs[match.id].score1}
                      score2={scoreInputs[match.id].score2}
                      isOwner={isOwner}
                      busy={savingMatchId === match.id || resetting}
                      onScoreChange={updateScoreInput}
                      onSave={saveMatch}
                      getMatchName={(id) => matchesById.get(id)?.roundName ?? "Next round"}
                    />
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="grid-2 section">
        <article className="card">
          <div className="section-title">Quick rules / settings</div>
          <div className="stack">
            <div className="notice">WB semifinals and the first losers match are BO3.</div>
            <div className="notice">Winners Final, Losers Final, Grand Final, and any reset are BO5.</div>
            <div className="notice">
              If the losers-bracket finalist wins the Grand Final, a Grand Final Reset is required.
            </div>
            <div className="notice">Anyone with this link can view. Only the creator can save scores.</div>
          </div>
        </article>

        <article className="card">
          <div className="section-title">Share link</div>
          <div className="code-block">{shareUrl || "Loading link…"}</div>
          <div className="row" style={{ marginTop: 12 }}>
            <button type="button" className="button secondary" onClick={copyShareLink}>
              {copyState === "copied" ? "Copied!" : "Copy link"}
            </button>
          </div>
          {copyError ? (
            <p className="muted" style={{ marginTop: 8, fontSize: 12 }}>
              {copyError}
            </p>
          ) : null}
        </article>
      </section>
    </main>
  );
}

function MatchCard({
  tournament,
  match,
  score1,
  score2,
  isOwner,
  busy,
  onScoreChange,
  onSave,
  getMatchName,
}: {
  tournament: TournamentDocument;
  match: TournamentMatch;
  score1: string;
  score2: string;
  isOwner: boolean;
  busy: boolean;
  onScoreChange: (matchId: MatchId, field: "score1" | "score2", value: string) => void;
  onSave: (matchId: MatchId) => Promise<void>;
  getMatchName: (matchId: MatchId) => string;
}) {
  const team1 = getTeamById(tournament.teams, match.teamIds[0]);
  const team2 = getTeamById(tournament.teams, match.teamIds[1]);
  const hasTeams = Boolean(team1 && team2);

  const nextSteps: string[] = [];
  if (match.nextWinnerMatchId) {
    nextSteps.push(`Winner to ${getMatchName(match.nextWinnerMatchId)}`);
  }
  if (match.id === "grand-final") {
    nextSteps.push("If the losers-bracket team wins, play the reset.");
  } else if (match.nextLoserMatchId && match.id !== "grand-final-reset") {
    nextSteps.push(`Loser to ${getMatchName(match.nextLoserMatchId)}`);
  }

  return (
    <article className={`match-card ${match.status}`}>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <div>
          <strong>{match.roundName}</strong>
          <div className="muted" style={{ fontSize: 13 }}>
            BO{match.bestOf}
          </div>
        </div>
        <span className={getStatusPillClass(match.status)}>{match.status}</span>
      </div>

      <div className="stack" style={{ gap: 10 }}>
        <TeamRow
          team={team1}
          score={match.score1}
          isWinner={match.winnerTeamId === team1?.id}
        />
        <TeamRow
          team={team2}
          score={match.score2}
          isWinner={match.winnerTeamId === team2?.id}
        />
      </div>

      {!hasTeams ? (
        <div className="muted" style={{ fontSize: 13 }}>
          {match.id === "grand-final-reset"
            ? "Only played if the losers-bracket finalist wins the Grand Final."
            : "Waiting for the previous round to determine teams."}
        </div>
      ) : null}

      {isOwner && hasTeams ? (
        <div className="stack" style={{ gap: 12 }}>
          <div className="score-grid">
            <label className="label">
              {team1?.label} score
              <input
                className="input"
                type="number"
                min={0}
                max={match.bestOf}
                step={1}
                value={score1}
                onChange={(event) => onScoreChange(match.id, "score1", event.target.value)}
                disabled={busy}
              />
            </label>
            <label className="label">
              {team2?.label} score
              <input
                className="input"
                type="number"
                min={0}
                max={match.bestOf}
                step={1}
                value={score2}
                onChange={(event) => onScoreChange(match.id, "score2", event.target.value)}
                disabled={busy}
              />
            </label>
          </div>

          <button type="button" className="button" onClick={() => onSave(match.id)} disabled={busy}>
            {busy ? "Saving…" : match.status === "completed" ? "Update result" : "Save result"}
          </button>
        </div>
      ) : null}

      {match.winnerTeamId ? (
        <div className="notice">
          Winner: {getTeamById(tournament.teams, match.winnerTeamId)?.name ?? "TBD"}
        </div>
      ) : null}

      {nextSteps.length > 0 ? (
        <div className="muted" style={{ fontSize: 13 }}>
          {nextSteps.join(" • ")}
        </div>
      ) : null}
    </article>
  );
}

function TeamRow({
  team,
  score,
  isWinner,
}: {
  team: ReturnType<typeof getTeamById>;
  score: number | null;
  isWinner: boolean;
}) {
  return (
    <div className={`match-team-row${isWinner ? " winner" : ""}`}>
      <div className="match-team-meta">
        <strong>{team?.label ?? "TBD"}</strong>
        <div className="team-card-name" style={{ fontSize: 15 }}>
          {team?.name ?? "Waiting for teams"}
        </div>
      </div>
      <div className="match-score">{typeof score === "number" ? score : "–"}</div>
    </div>
  );
}
