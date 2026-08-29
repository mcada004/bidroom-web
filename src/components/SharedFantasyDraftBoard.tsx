"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { signInAnonymously } from "firebase/auth";
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  writeBatch,
} from "firebase/firestore";
import { useAuth } from "@/src/context/AuthContext";
import { auth, db } from "@/src/lib/firebase";
import { FANTASY_PLAYER_NOTES } from "@/src/lib/fantasyPlayerNotes";
import {
  emptySharedDraftState,
  type SharedDraftPick,
  type SharedDraftPickStatus,
  type SharedDraftState,
} from "@/src/lib/sharedFantasyDraftState";
import { PLAYERS, type Player } from "@/src/components/FantasyDraftBoard";

const ADMIN_EMAIL = "mcada004@gmail.com";
const DRAFT_ID = "brian-2026-live";
const USERNAME_KEY = "brian-2026-shared-draft-username";
const POSITIONS = ["QB", "RB", "WR", "TE", "DL", "LB", "DB"];
const IDP_POSITIONS = new Set(["LB", "DL", "DB"]);

type ConnectionState = "connecting" | "live" | "offline";

function normalizeUsername(value: string) {
  const cleaned = value.trim().replace(/\s+/g, " ");
  return cleaned.length >= 2 && cleaned.length <= 24 ? cleaned : null;
}

function actionErrorMessage(error: unknown, fallback: string) {
  if (error && typeof error === "object" && "code" in error) {
    const code = String((error as { code: unknown }).code);
    if (code.includes("permission-denied")) return "That player was already taken, or your board permissions need refreshing.";
  }
  return error instanceof Error ? error.message : fallback;
}

export default function SharedFantasyDraftBoard() {
  const { user, loading: authLoading, preferredDisplayName } = useAuth();
  const [draft, setDraft] = useState<SharedDraftState>(() => emptySharedDraftState());
  const [connection, setConnection] = useState<ConnectionState>("connecting");
  const [error, setError] = useState<string | null>(null);
  const [username, setUsername] = useState("");
  const [usernameInput, setUsernameInput] = useState("");
  const [position, setPosition] = useState("ALL");
  const [busyRank, setBusyRank] = useState<number | null>(null);
  const [joining, setJoining] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);

  const isAdmin = Boolean(
    !authLoading && user && !user.isAnonymous && user.email?.toLowerCase() === ADMIN_EMAIL
  );
  const activeName = isAdmin ? normalizeUsername(preferredDisplayName) ?? "Brian" : username;

  useEffect(() => {
    const stored = normalizeUsername(window.localStorage.getItem(USERNAME_KEY) ?? "");
    if (stored) {
      setUsername(stored);
      setUsernameInput(stored);
    }
  }, []);

  useEffect(() => {
    setConnection("connecting");
    const unsubscribe = onSnapshot(
      collection(db, "fantasyDrafts", DRAFT_ID, "picks"),
      (snapshot) => {
        const picks: Record<string, SharedDraftPick> = {};
        let latestUpdate: string | null = null;

        for (const pickDocument of snapshot.docs) {
          const rank = Number(pickDocument.id);
          const data = pickDocument.data() as Record<string, unknown>;
          if (!Number.isInteger(rank) || rank < 1 || rank > 200 || (data.status !== "X" && data.status !== "D")) continue;

          const timestamp = data.updatedAt as { toDate?: () => Date } | undefined;
          const updatedAt = timestamp?.toDate?.().toISOString() ?? "";
          picks[String(rank)] = {
            rank,
            status: data.status,
            actorName: typeof data.actorName === "string" ? data.actorName.slice(0, 24) : "Participant",
            actorUid: typeof data.actorUid === "string" ? data.actorUid : null,
            updatedAt,
          };
          if (updatedAt && (!latestUpdate || updatedAt > latestUpdate)) latestUpdate = updatedAt;
        }

        setDraft((current) => ({
          picks,
          revision: current.revision + 1,
          updatedAt: latestUpdate,
          lastAction: null,
        }));
        setConnection("live");
        setError(null);
      },
      (syncError) => {
        setConnection("offline");
        setError(actionErrorMessage(syncError, "Unable to load the shared board."));
      }
    );

    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!selectedPlayer) return;
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setSelectedPlayer(null);
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [selectedPlayer]);

  const mine = useMemo(
    () => PLAYERS.filter((player) => draft.picks[String(player[0])]?.status === "D"),
    [draft.picks]
  );
  const away = useMemo(
    () => PLAYERS.filter((player) => draft.picks[String(player[0])]?.status === "X"),
    [draft.picks]
  );
  const filledIdp = useMemo(
    () => new Set(mine.filter((player) => IDP_POSITIONS.has(player[2])).map((player) => player[2])),
    [mine]
  );
  const available = useMemo(
    () => PLAYERS.filter(
      (player) => !draft.picks[String(player[0])] && !(IDP_POSITIONS.has(player[2]) && filledIdp.has(player[2]))
    ),
    [draft.picks, filledIdp]
  );
  const displayedAvailable = useMemo(
    () => position === "ALL" ? available : available.filter((player) => player[2] === position),
    [available, position]
  );
  async function joinBoard(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalized = normalizeUsername(usernameInput);
    if (!normalized) {
      setError("Name must be 2–24 characters.");
      return;
    }
    setJoining(true);
    try {
      if (!auth.currentUser) await signInAnonymously(auth);
      window.localStorage.setItem(USERNAME_KEY, normalized);
      setUsername(normalized);
      setUsernameInput(normalized);
      setError(null);
    } catch (joinError) {
      setError(actionErrorMessage(joinError, "Unable to join the board."));
    } finally {
      setJoining(false);
    }
  }

  async function ensureFirebaseUser() {
    return auth.currentUser ?? (await signInAnonymously(auth)).user;
  }

  async function markDrafted(player: Player, status: SharedDraftPickStatus) {
    if (!activeName) {
      setError("Enter your username before marking a player drafted.");
      return;
    }
    setBusyRank(player[0]);
    try {
      const currentUser = await ensureFirebaseUser();
      await setDoc(doc(db, "fantasyDrafts", DRAFT_ID, "picks", String(player[0])), {
        status: isAdmin ? status : "X",
        actorName: activeName,
        actorUid: currentUser.uid,
        updatedAt: serverTimestamp(),
      });
      setError(null);
    } catch (actionError) {
      setError(actionErrorMessage(actionError, "Unable to mark that player."));
    } finally {
      setBusyRank(null);
    }
  }

  async function editPick(player: Player, action: "set" | "undo", status?: SharedDraftPickStatus) {
    setBusyRank(player[0]);
    try {
      if (action === "undo") {
        await deleteDoc(doc(db, "fantasyDrafts", DRAFT_ID, "picks", String(player[0])));
      } else {
        const currentUser = await ensureFirebaseUser();
        await setDoc(doc(db, "fantasyDrafts", DRAFT_ID, "picks", String(player[0])), {
          status,
          actorName: activeName,
          actorUid: currentUser.uid,
          updatedAt: serverTimestamp(),
        });
      }
      setError(null);
    } catch (actionError) {
      setError(actionErrorMessage(actionError, "Unable to edit that pick."));
    } finally {
      setBusyRank(null);
    }
  }

  async function resetBoard() {
    if (!window.confirm("Reset every pick on the shared draft board for everyone?")) return;
    setResetting(true);
    try {
      const batch = writeBatch(db);
      for (const rank of Object.keys(draft.picks)) {
        batch.delete(doc(db, "fantasyDrafts", DRAFT_ID, "picks", rank));
      }
      await batch.commit();
      setError(null);
    } catch (actionError) {
      setError(actionErrorMessage(actionError, "Unable to reset the board."));
    } finally {
      setResetting(false);
    }
  }

  return (
    <main className="draft-page shared-draft-page">
      <section className="shared-draft-hero">
        <div>
          <div className="shared-draft-eyebrow">
            <span className={`shared-live-dot ${connection}`} />
            {connection === "live" ? "Live shared board" : connection === "connecting" ? "Connecting" : "Connection interrupted"}
          </div>
          <h1>Draft room</h1>
          <p>Everyone sees the same board. Guests enter only a name; Brian’s Bidroom login controls corrections and resets.</p>
        </div>
        <div className="shared-hero-actions">
          <Link className="button secondary" href="/fantasy-draft">Private board</Link>
          {isAdmin ? (
            <button className="button ghost" type="button" disabled={resetting} onClick={resetBoard}>{resetting ? "Resetting…" : "Reset board"}</button>
          ) : (
            <Link className="button ghost" href="/login?next=/fantasy-draft/shared">Brian admin login</Link>
          )}
        </div>
      </section>

      {!activeName ? (
        <section className="shared-join-card">
          <p>Join the draft</p>
          <h2>What should we call you?</h2>
          <form onSubmit={joinBoard}>
            <input
              value={usernameInput}
              onChange={(event) => setUsernameInput(event.target.value)}
              placeholder="Your name"
              autoComplete="nickname"
              maxLength={24}
              autoFocus
            />
            <button className="button" type="submit" disabled={joining}>{joining ? "Joining…" : "Enter board"}</button>
          </form>
          <span>No email, password, or account required.</span>
        </section>
      ) : (
        <section className="shared-session-bar">
          <div><span>Drafting as</span><strong>{activeName}</strong>{isAdmin ? <b>ADMIN</b> : null}</div>
          {!isAdmin ? <button type="button" onClick={() => { setUsername(""); setUsernameInput(activeName); }}>Change name</button> : null}
          <p>{draft.updatedAt ? "Board updates instantly for everyone." : "Waiting for the first pick."}</p>
        </section>
      )}

      {error ? <div className="shared-draft-error" role="alert">{error}</div> : null}

      <section className="draft-stats" aria-live="polite">
        <article><span>{position === "ALL" ? "Best available" : `Best ${position}`}</span><strong>{displayedAvailable[0] ? `${displayedAvailable[0][1]} · ${displayedAvailable[0][2]}` : "None available"}</strong></article>
        <article><span>Brian’s roster</span><strong>{mine.length} / 17</strong></article>
        <article><span>{position === "ALL" ? "Remaining" : `${position} remaining`}</span><strong>{displayedAvailable.length}</strong></article>
      </section>

      <section className="draft-team shared-my-team" aria-labelledby="shared-team-title">
        <div className="draft-section-heading">
          <h2 id="shared-team-title">Brian’s team</h2>
          <span>{isAdmin ? "Tap a player for notes · controls edit" : "Updates live for everyone"}</span>
        </div>
        <div className="draft-team-list">
          {mine.length ? mine.map((player) => (
            <article className="fantasy-roster-player" key={player[0]}>
              <button className="fantasy-player-info" type="button" onClick={() => setSelectedPlayer(player)}>
                <span>{player[2]}</span><strong>{player[1]}</strong><small>#{player[0]} · {player[3]}</small>
              </button>
              {isAdmin ? (
                <div className="shared-roster-admin">
                  <button type="button" disabled={busyRank === player[0]} onClick={() => editPick(player, "set", "X")}>Other</button>
                  <button type="button" disabled={busyRank === player[0]} onClick={() => editPick(player, "undo")}>×</button>
                </div>
              ) : null}
            </article>
          )) : <p>No picks yet.</p>}
        </div>
      </section>

      <section className="draft-board-card" aria-labelledby="shared-board-title">
        <div className="draft-section-heading">
          <div>
            <h2 id="shared-board-title">Best available</h2>
            <span>{isAdmin ? "Mine adds to your roster · Taken removes for everyone" : "Click a name for Brian’s draft notes"}</span>
          </div>
          <label className="draft-position-filter">
            <span>Filter position</span>
            <select value={position} onChange={(event) => setPosition(event.target.value)}>
              <option value="ALL">All positions</option>
              {POSITIONS.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>
        </div>
        <div className="draft-table-wrap">
          <table className="draft-table">
            <thead><tr><th>Rank</th><th>Player</th><th>Pos</th><th>Team</th><th className="draft-flag">Flag</th><th>Status</th></tr></thead>
            <tbody>
              {displayedAvailable.map((player) => (
                <tr key={player[0]} className={`position-${player[2].toLowerCase()}`}>
                  <td>{player[0]}</td>
                  <td><button className="draft-player-detail" type="button" onClick={() => setSelectedPlayer(player)}>{player[1]}</button></td>
                  <td><span className="position-badge">{player[2]}</span></td>
                  <td>{player[3]}</td>
                  <td className="draft-flag">{player[4]}</td>
                  <td>
                    <div className="draft-actions">
                      {isAdmin ? (
                        <>
                          <button
                            type="button"
                            className="draft-d shared-mine-button"
                            aria-label={`Add ${player[1]} to Brian's team`}
                            disabled={busyRank === player[0]}
                            onClick={() => markDrafted(player, "D")}
                          >Mine</button>
                          <button
                            type="button"
                            className="draft-x shared-taken-button"
                            aria-label={`Mark ${player[1]} drafted by another team`}
                            disabled={busyRank === player[0]}
                            onClick={() => markDrafted(player, "X")}
                          >Taken</button>
                        </>
                      ) : (
                        <button
                          type="button"
                          className="draft-x shared-taken-button"
                          disabled={!activeName || busyRank === player[0]}
                          onClick={() => markDrafted(player, "X")}
                        >Taken</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {!displayedAvailable.length ? <tr><td colSpan={6} className="draft-empty-position">No {position} players remain.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </section>

      <details className="draft-away shared-drafted-list">
        <summary>Drafted by others ({away.length})</summary>
        <div className="draft-away-list">
          {away.map((player) => {
            const pick = draft.picks[String(player[0])];
            return (
              <article className="draft-away-player" key={player[0]}>
                <button className="draft-away-info" type="button" onClick={() => setSelectedPlayer(player)}>
                  <span>#{player[0]} · {player[2]} · {pick?.actorName ?? "Participant"}</span><strong>{player[1]}</strong>
                </button>
                {isAdmin ? (
                  <div className="shared-away-admin">
                    <button type="button" disabled={busyRank === player[0]} onClick={() => editPick(player, "set", "D")}>Mine</button>
                    <button type="button" disabled={busyRank === player[0]} onClick={() => editPick(player, "undo")}>Undo</button>
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      </details>

      {selectedPlayer ? (
        <div className="fantasy-note-backdrop" role="presentation" onMouseDown={() => setSelectedPlayer(null)}>
          <section className="fantasy-note-modal" role="dialog" aria-modal="true" aria-labelledby="shared-note-title" onMouseDown={(event) => event.stopPropagation()}>
            <button className="fantasy-note-close" type="button" aria-label="Close player notes" onClick={() => setSelectedPlayer(null)}>×</button>
            <p className="fantasy-note-meta">#{selectedPlayer[0]} · {selectedPlayer[2]} · {selectedPlayer[3]}</p>
            <h2 id="shared-note-title">{selectedPlayer[1]}</h2>
            <p className="fantasy-note-copy">{FANTASY_PLAYER_NOTES[selectedPlayer[0]]?.note ?? "No additional draft note."}</p>
            {FANTASY_PLAYER_NOTES[selectedPlayer[0]]?.source ? <a href={FANTASY_PLAYER_NOTES[selectedPlayer[0]].source} target="_blank" rel="noreferrer">Open source ↗</a> : null}
          </section>
        </div>
      ) : null}
    </main>
  );
}
