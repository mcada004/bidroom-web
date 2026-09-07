"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { collection, doc, onSnapshot, runTransaction, serverTimestamp, setDoc } from "firebase/firestore";
import { useAuth } from "@/src/context/AuthContext";
import { db } from "@/src/lib/firebase";
import { useFantasyRoomMembership } from "@/src/hooks/useFantasyRoomMembership";
import { PLAYERS, getFantasyPlayerId } from "@/src/components/FantasyDraftBoard";
import { buildRoomTeams, FANTASY_ADMIN_EMAIL, FANTASY_ROOM_ID, isRecentlyActive, pickBelongsToTeam, type RoomMember, type RoomPick, type RoomTeam } from "@/src/lib/fantasyRoom";

const playersById = new Map(PLAYERS.map(player => [String(getFantasyPlayerId(player)), player]));

export default function FantasyRoomDashboard() {
  const { user, loading } = useAuth();
  const isAdmin = Boolean(!loading && user && !user.isAnonymous && user.email?.toLowerCase() === FANTASY_ADMIN_EMAIL);
  useFantasyRoomMembership(isAdmin ? "Brian" : null, loading);
  const [members, setMembers] = useState<RoomMember[]>([]);
  const [picks, setPicks] = useState<RoomPick[]>([]);
  const [ready, setReady] = useState({ members: false, picks: false });
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [now, setNow] = useState(0);
  const [confirmation, setConfirmation] = useState<{ team: RoomTeam; action: "reset" | "kick" } | null>(null);

  useEffect(() => {
    if (!isAdmin) return;
    const timer = setInterval(() => setNow(Date.now()), 15_000);
    const failed = () => { setError("Room updates are unavailable. Refresh to reconnect before making changes."); setReady({ members: false, picks: false }); };
    const stopMembers = onSnapshot(collection(db, "fantasyDrafts", FANTASY_ROOM_ID, "members"), { includeMetadataChanges: true }, snapshot => {
      setMembers(snapshot.docs.map(item => {
        const data = item.data({ serverTimestamps: "estimate" });
        return { uid: item.id, displayName: typeof data.displayName === "string" ? data.displayName : "Participant", status: data.status === "banned" ? "banned" : "active", lastSeenAt: data.lastSeenAt?.toMillis?.() ?? 0 };
      }));
      setReady(current => ({ ...current, members: !snapshot.metadata.fromCache }));
      setNow(Date.now());
    }, failed);
    const stopPicks = onSnapshot(collection(db, "fantasyDrafts", FANTASY_ROOM_ID, "picks"), { includeMetadataChanges: true }, snapshot => {
      setPicks(snapshot.docs.filter(item => item.data().status === "D" || item.data().status === "X").map(item => ({ id: item.id, actorUid: item.data().actorUid ?? null, actorName: item.data().actorName ?? "Participant", status: item.data().status })));
      setReady(current => ({ ...current, picks: !snapshot.metadata.fromCache }));
    }, failed);
    return () => { stopMembers(); stopPicks(); clearInterval(timer); };
  }, [isAdmin]);

  const teams = useMemo(() => buildRoomTeams(members, picks, user?.uid ?? ""), [members, picks, user?.uid]);
  const connected = ready.members && ready.picks;

  async function resetTeam(team: RoomTeam) {
    if (!user || !isAdmin) return;
    // Read every valid player document, including missing picks, so concurrent picks
    // force a retry and a team reset cannot accidentally leave a racing pick behind.
    await runTransaction(db, async transaction => {
      const snapshots = await Promise.all([...playersById.keys()].map(id => transaction.get(doc(db, "fantasyDrafts", FANTASY_ROOM_ID, "picks", id))));
      for (const snapshot of snapshots) {
        if (!snapshot.exists()) continue;
        const data = snapshot.data();
        if (pickBelongsToTeam({ id: snapshot.id, actorUid: data.actorUid ?? null, actorName: data.actorName ?? "Participant", status: data.status }, team.key, user.uid)) transaction.delete(snapshot.ref);
      }
    });
  }

  async function perform(team: RoomTeam, action: "reset" | "kick" | "restore") {
    if (!isAdmin || !user || !connected || busy) return;
    if (action !== "reset" && (!team.uid || team.uid === user.uid)) return;
    setBusy(team.key); setError(null); setNotice(null);
    try {
      if (action === "reset") await resetTeam(team);
      else await setDoc(doc(db, "fantasyDrafts", FANTASY_ROOM_ID, "members", team.uid!), {
        displayName: team.name, status: action === "kick" ? "banned" : "active", moderatedAt: serverTimestamp(),
      }, { merge: true });
      setNotice(action === "reset" ? `${team.name}’s picks were reset and returned to the available pool.` : action === "kick" ? `${team.name} was removed. Their picks are preserved.` : `${team.name} can rejoin the room. Ask them to refresh.`);
      setConfirmation(null);
    } catch {
      setError("The change could not be saved. Check your connection and try again.");
    } finally { setBusy(null); }
  }

  if (loading) return <main className="draft-page"><p>Checking dashboard access…</p></main>;
  if (!isAdmin) return <main className="draft-page"><section className="draft-access-card"><h1>Private room dashboard</h1><p>Only Brian’s account can view participants and manage teams.</p><Link className="button" href="/login?next=/fantasy-draft/admin">Sign in as Brian</Link></section></main>;

  return <main className="draft-page room-admin-page">
    <section className="room-admin-heading"><div><p className="room-admin-eyebrow">PRIVATE · BRIAN ONLY</p><h1>Draft room dashboard</h1><p>See everyone’s roster and manage access to the room.</p></div><div className="room-admin-actions"><Link className="button secondary" href="/fantasy-draft">My draft board</Link><Link className="button secondary" href="/fantasy-draft/shared">Open room</Link></div></section>
    <p role="status">{connected ? "Live · changes sync with the draft room" : "Connecting to room…"}</p>
    <section className="draft-stats"><article><span>Participants</span><strong>{teams.filter(team => team.uid).length}</strong></article><article><span>Active in last 2 minutes</span><strong>{teams.filter(team => team.status !== "banned" && isRecentlyActive(team.lastSeenAt, now)).length}</strong></article><article><span>Total picks</span><strong>{picks.length}</strong></article></section>
    {error ? <p className="room-admin-error" role="alert">{error}</p> : null}
    {notice ? <p className="room-admin-notice" role="status">{notice}</p> : null}
    <div className="room-admin-teams">{teams.map(team => <section className="room-admin-team" key={team.key}>
      <div className="room-admin-team-heading"><div><h2>{team.name} {team.isAdmin ? <small>You</small> : null}</h2><p>{team.status === "banned" ? "Removed from room" : isRecentlyActive(team.lastSeenAt, now) ? "Active in the last 2 minutes" : team.lastSeenAt ? `Last active ${new Date(team.lastSeenAt).toLocaleString()}` : "Presence not recorded · refresh the room to check in"}</p>{team.uid && !team.isAdmin ? <small>Participant {team.uid.slice(-6)}</small> : null}</div><strong>{team.picks.length} picks</strong></div>
      {team.picks.length ? <ul className="room-admin-roster">{[...team.picks].sort((a, b) => (playersById.get(a.id)?.[0] ?? 999) - (playersById.get(b.id)?.[0] ?? 999)).map(pick => {
        const player = playersById.get(pick.id);
        return <li key={pick.id}><span className="position-badge">{player?.[2] ?? "—"}</span><strong>{player?.[1] ?? `Player ${pick.id}`}</strong><span>{player?.[3]}</span></li>;
      })}</ul> : <p className="room-admin-empty">No players picked yet.</p>}
      <div className="room-admin-actions"><button className="button secondary" type="button" disabled={!connected || Boolean(busy) || !team.picks.length} onClick={() => setConfirmation({ team, action: "reset" })}>Reset team picks</button>{team.uid && !team.isAdmin ? team.status === "banned" ? <button className="button secondary" type="button" disabled={!connected || Boolean(busy)} onClick={() => perform(team, "restore")}>Allow back in</button> : <button className="button room-admin-danger" type="button" disabled={!connected || Boolean(busy)} onClick={() => setConfirmation({ team, action: "kick" })}>Kick from room</button> : null}</div>
      {confirmation?.team.key === team.key ? <div className="room-admin-confirm" role="group" aria-label="Confirm team action"><p>{confirmation.action === "reset" ? `Reset all picks for ${team.name}? Their players will become available to everyone. Other teams’ picks will stay as they are.` : `Remove ${team.name} from the room? They will lose room access and cannot make more picks with this guest identity. Their existing picks will remain.`}</p><button className="button room-admin-danger" type="button" disabled={Boolean(busy) || !connected} onClick={() => perform(team, confirmation.action)}>{busy ? "Saving…" : confirmation.action === "reset" ? "Confirm reset" : "Confirm removal"}</button> <button className="button secondary" type="button" disabled={Boolean(busy)} onClick={() => setConfirmation(null)}>Cancel</button></div> : null}
    </section>)}</div>
    {connected && !teams.length ? <p>No participants yet. Guests appear after entering their name in the room.</p> : null}
    <p className="room-admin-footnote">Activity means a room check-in within the last two minutes. Guests are identified by their browser sign-in, so a different browser or cleared browser data can create a new guest identity. Names alone do not identify a team.</p>
  </main>;
}
