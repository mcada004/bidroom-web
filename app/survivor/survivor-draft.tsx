'use client';
import { useEffect, useRef, useState } from 'react';
import { signInAnonymously } from 'firebase/auth';
import { doc, onSnapshot, runTransaction } from 'firebase/firestore';
import { auth, db } from '@/src/lib/firebase';
import { useAuth } from '@/src/context/AuthContext';
import { addPick, addTeam, emptyDraft, SURVIVOR_ROOM, teamForPick, type DraftState } from '@/src/lib/survivor/draft';
import cast from '@/src/lib/survivor/cast.json';
const colors = ['#fbbf24', '#6ee7b7', '#93c5fd', '#f9a8d4', '#c4b5fd'];
export default function SurvivorDraft() {
  const { user, loading } = useAuth();
  const [state, setState] = useState<DraftState>(emptyDraft);
  const [ready, setReady] = useState(false);
  const [connected, setConnected] = useState(false);
  const [retry, setRetry] = useState(0);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [selection, setSelection] = useState<{ id: string; pick: number } | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    return onSnapshot(doc(db, 'survivorDrafts', SURVIVOR_ROOM), { includeMetadataChanges: true }, (snapshot) => {
      setState(snapshot.exists() ? snapshot.data() as DraftState : emptyDraft());
      setReady(true); setConnected(!snapshot.metadata.fromCache);
    }, () => { setConnected(false); setReady(true); setError('Could not connect to the shared draft. Please retry.'); });
  }, [retry]);
  useEffect(() => { if (selection) dialog.current?.showModal(); else dialog.current?.close(); }, [selection]);
  const myTeam = user ? state.uids.indexOf(user.uid) : -1;
  const finished = state.picks.length === 20;
  const live = state.uids.length === 5 && !finished;
  const currentTeam = teamForPick(state.picks.length);
  const myTurn = live && myTeam === currentTeam;
  async function join(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      await auth.authStateReady();
      const member = auth.currentUser ?? (await signInAnonymously(auth)).user;
      await runTransaction(db, async (transaction) => {
        const ref = doc(db, 'survivorDrafts', SURVIVOR_ROOM);
        const snapshot = await transaction.get(ref);
        const before = snapshot.exists() ? snapshot.data() as DraftState : emptyDraft();
        transaction.set(ref, addTeam(before, member.uid, name));
      });
      setNotice('You’re in. Keep using this browser to return to your team.');
    } catch (e) { setError(e instanceof Error && !('code' in e) ? e.message : 'Unable to join. Check your connection and try again.'); }
    finally { setBusy(false); }
  }
  async function draft() {
    if (!selection || !auth.currentUser) return;
    setBusy(true); setError('');
    try {
      const uid = auth.currentUser.uid;
      await runTransaction(db, async (transaction) => {
        const ref = doc(db, 'survivorDrafts', SURVIVOR_ROOM);
        const snapshot = await transaction.get(ref);
        if (!snapshot.exists()) throw new Error('The draft is not ready.');
        transaction.set(ref, addPick(snapshot.data() as DraftState, uid, selection.id, cast.map(c => c.id), selection.pick));
      });
      setNotice(`${cast.find(c => c.id === selection.id)?.name} joined your team.`);
      setSelection(null);
    } catch (e) { setError(e instanceof Error && !('code' in e) ? e.message : 'Pick was not saved. Check your connection and try again.'); setSelection(null); }
    finally { setBusy(false); }
  }
  async function share() {
    const url = new URL('/survivor', window.location.origin).href;
    try { if (navigator.share) await navigator.share({ title: 'Survivor 51 Draft', url }); else { await navigator.clipboard.writeText(url); setNotice('Draft link copied. Send it to your group.'); } }
    catch (e) { if (!(e instanceof Error && e.name === 'AbortError')) setNotice(`Share this link: ${url}`); }
  }
  const chosen = cast.find(c => c.id === selection?.id);
  return <main className="sv-page">
    <header className="sv-heading"><div><p className="sv-eyebrow">BIDROOM / FANTASY DRAFT</p><h1>SURVIVOR <span>51</span></h1><p className="sv-subtitle">5 teams <span>·</span> 20 castaways <span>·</span> 4 rounds</p></div><button className="sv-secondary" onClick={share}>Share draft</button></header>
    <section className={`sv-status ${myTurn ? 'sv-your-turn' : ''}`} aria-live="polite">
      <div><p className="sv-eyebrow">{finished ? 'ALL TEAMS ARE SET' : live ? `ROUND ${Math.floor(state.picks.length / 5) + 1} · PICK ${state.picks.length + 1} OF 20` : 'DRAFT LOBBY'}</p>
      <h2>{!ready ? 'Connecting to the draft…' : finished ? 'The tribe has spoken.' : live ? myTurn ? 'You’re on the clock.' : `${state.names[currentTeam]} is on the clock.` : `${state.uids.length} of 5 teams ready`}</h2>
      <p>{finished ? 'All 20 contestants have been drafted. Good luck, everyone.' : live ? myTurn ? 'Choose a castaway below to add to your team.' : 'Browse the cast while you wait for your turn.' : 'The draft begins when all five teams join. Join order sets the first round.'}</p></div>
      <span className="sv-connection">{connected ? 'Live board' : 'Connecting…'}</span>
    </section>
    {error && <div className="sv-error" role="alert">{error} <button onClick={() => { setError(''); setRetry(n => n + 1); }}>Retry connection</button></div>}
    {notice && <p className="sv-notice" role="status">{notice}</p>}
    {myTeam < 0 && state.uids.length < 5 && <form className="sv-join" onSubmit={join}><div><label htmlFor="sv-team">Your team name</label><p>No account needed. Your team stays linked to this browser.</p></div><input id="sv-team" required minLength={2} maxLength={24} value={name} onChange={e => setName(e.target.value)} placeholder="Name your tribe" autoComplete="off" /><button className="sv-primary" disabled={busy || loading || !connected}>{busy ? 'Joining…' : 'Join draft'}</button></form>}
    {myTeam < 0 && state.uids.length === 5 && <p className="sv-notice">All five spots are filled. You’re watching the draft. To pick for an existing team, return in the browser you joined with.</p>}
    <section className="sv-teams" aria-label="Teams and rosters">{Array.from({ length: 5 }, (_, i) => <div key={i} className={`sv-team ${live && currentTeam === i ? 'sv-active' : ''}`} style={{ '--team-color': colors[i] } as React.CSSProperties}><div className="sv-team-title"><span className="sv-team-number">{i + 1}</span><h3>{state.names[i] ?? 'Open spot'} {myTeam === i && <small>YOU</small>}</h3><span>{state.picks.filter((_, p) => teamForPick(p) === i).length}/4</span></div><ul>{state.picks.map((id, p) => teamForPick(p) === i ? <li key={id}><span>#{p + 1}</span>{cast.find(c => c.id === id)?.name}</li> : null)}{!state.picks.some((_, p) => teamForPick(p) === i) && <li className="sv-empty">{state.names[i] ? 'Waiting for first pick' : 'Waiting for a team'}</li>}</ul></div>)}</section>
    <div className="sv-board-title"><h2>The castaways</h2><span>{20 - state.picks.length} available</span></div>
    <div className="sv-grid">{cast.map(c => {
      const pick = state.picks.indexOf(c.id); const taken = pick !== -1; const owner = taken ? teamForPick(pick) : -1;
      return <article className={`sv-card ${taken ? 'sv-taken' : ''}`} key={c.id}><div className="sv-photo"><img src={c.image} alt={c.name} width="480" height="600" loading="lazy" />{taken && <span className="sv-picked" style={{ background: colors[owner] }}>#{pick + 1} · {state.names[owner]}</span>}</div><div className="sv-card-body"><h3>{c.name}</h3><p className="sv-meta">{c.age} <span>·</span> {c.location}</p><p className="sv-bio">{c.occupation}</p><button className={taken ? 'sv-drafted-button' : 'sv-primary'} disabled={taken || !myTurn || busy || !connected} onClick={() => setSelection({ id: c.id, pick: state.picks.length })}>{taken ? 'Drafted' : myTurn ? `Draft ${c.name.split(' ')[0]}` : 'Awaiting your turn'}</button></div></article>;
    })}</div>
    <footer className="sv-footer"><p>Snake order: 1–5, 5–1, 1–5, 5–1. Four castaways per team.</p><p>Cast as of September 29, 2026. Aaliyah Puglia is excluded after elimination. Bios: <a href="https://parade.com/tv/survivor-51-cast-2026" target="_blank" rel="noreferrer">Parade</a>. Photos: Robert Voets / CBS. Unofficial fan draft.</p></footer>
    <dialog className="sv-dialog" ref={dialog} onCancel={e => { if (busy) e.preventDefault(); else setSelection(null); }} onClose={() => setSelection(null)} aria-labelledby="sv-confirm-title"><h2 id="sv-confirm-title">Draft {chosen?.name}?</h2><p>This locks in pick #{(selection?.pick ?? 0) + 1} for {state.names[myTeam]}. Picks are final.</p><div><button className="sv-secondary" disabled={busy} onClick={() => setSelection(null)}>Cancel</button><button className="sv-primary" disabled={busy || !connected || !myTurn} onClick={draft}>{busy ? 'Saving pick…' : 'Confirm pick'}</button></div></dialog>
  </main>;
}
