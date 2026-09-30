'use client';
import { useEffect, useRef, useState } from 'react';
import { signInAnonymously } from 'firebase/auth';
import { deleteDoc, doc, onSnapshot, runTransaction } from 'firebase/firestore';
import Link from 'next/link';
import { auth, db } from '@/src/lib/firebase';
import { useAuth } from '@/src/context/AuthContext';
import { addPick, addTeam, emptyDraft, moveTeam, shuffleOrder, startDraft, SURVIVOR_ROOM, teamForPick, type DraftState } from '@/src/lib/survivor/draft';
import { contestantPoints, emptyResults, SCORE_ROOM, validateResults, type SeasonResults } from '@/src/lib/survivor/scoring';
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
  const [scores, setScores] = useState<SeasonResults>(emptyResults);
  const [scoreBusy, setScoreBusy] = useState(false);
  const [scoreNotice, setScoreNotice] = useState('');
  const [confirmEarlyStart, setConfirmEarlyStart] = useState(false);
  const [selection, setSelection] = useState<{ id: string; pick: number } | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const resetDialog = useRef<HTMLDialogElement>(null);
  const earlyDialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    return onSnapshot(doc(db, 'survivorDrafts', SURVIVOR_ROOM), { includeMetadataChanges: true }, (snapshot) => {
      setState(snapshot.exists() ? snapshot.data() as DraftState : emptyDraft());
      setReady(true); setConnected(!snapshot.metadata.fromCache);
    }, () => { setConnected(false); setReady(true); setError('Could not connect to the shared draft. Please retry.'); });
  }, [retry]);
  useEffect(() => onSnapshot(doc(db, 'survivorScores', SCORE_ROOM), snapshot => {
    setScores(snapshot.exists() ? snapshot.data() as SeasonResults : emptyResults());
  }, () => setScoreNotice('The scoreboard is temporarily unavailable.')), []);
  useEffect(() => { if (selection) dialog.current?.showModal(); else dialog.current?.close(); }, [selection]);
  useEffect(() => { if (confirmReset) resetDialog.current?.showModal(); else resetDialog.current?.close(); }, [confirmReset]);
  useEffect(() => { if (confirmEarlyStart) earlyDialog.current?.showModal(); else earlyDialog.current?.close(); }, [confirmEarlyStart]);
  const organizer = user?.email?.toLowerCase() === 'mcada004@gmail.com';
  const myTeam = user ? state.order.indexOf(user.uid) : -1;
  const finished = state.picks.length === 20;
  const live = state.started && !finished;
  const currentTeam = teamForPick(state.picks.length);
  const myTurn = live && myTeam === currentTeam;
  const teamName = (slot: number) => state.names[state.uids.indexOf(state.order[slot])] ?? 'Open spot';
  async function setOrder(from: number, to: number) {
    const expectedFrom = state.order[from];
    const expectedTo = state.order[to];
    setBusy(true); setError('');
    try {
      await runTransaction(db, async transaction => {
        const ref = doc(db, 'survivorDrafts', SURVIVOR_ROOM);
        const snapshot = await transaction.get(ref);
        if (!snapshot.exists()) throw new Error('Wait for a team to join.');
        const latest = snapshot.data() as DraftState;
        if (latest.order[from] !== expectedFrom || latest.order[to] !== expectedTo) throw new Error('The order changed. Review it before moving a team.');
        transaction.set(ref, moveTeam(latest, from, to));
      });
      setNotice('Draft order updated for everyone.');
    } catch (e) { setError(e instanceof Error && !('code' in e) ? e.message : 'Unable to change the order. Please retry.'); }
    finally { setBusy(false); }
  }
  function secureRandomIndex(max: number) {
    const values = new Uint32Array(1);
    const limit = Math.floor(0x100000000 / max) * max;
    do { crypto.getRandomValues(values); } while (values[0] >= limit);
    return values[0] % max;
  }
  async function beginDraft(randomize = true) {
    setBusy(true); setError('');
    try {
      await runTransaction(db, async transaction => {
        const ref = doc(db, 'survivorDrafts', SURVIVOR_ROOM);
        const snapshot = await transaction.get(ref);
        if (!snapshot.exists()) throw new Error('Wait for a team to join.');
        const latest = snapshot.data() as DraftState;
        transaction.set(ref, startDraft({ ...latest, order: randomize ? shuffleOrder(latest.order, secureRandomIndex) : latest.order }));
      });
      setConfirmEarlyStart(false);
      setNotice(randomize ? 'The order was shuffled and the draft is open.' : 'The draft is open with your chosen order.');
    } catch (e) { setError(e instanceof Error && !('code' in e) ? e.message : 'Unable to start the draft. Please retry.'); }
    finally { setBusy(false); }
  }
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
  async function resetDraft() {
    if (!organizer || !connected) return;
    setBusy(true); setError('');
    try {
      await deleteDoc(doc(db, 'survivorDrafts', SURVIVOR_ROOM));
      setConfirmReset(false);
      setNotice('Draft reset. Teams can join again.');
    } catch { setError('Unable to reset the draft. Check your connection and try again.'); }
    finally { setBusy(false); }
  }
  async function updateScoring() {
    if (!organizer || !user) return;
    setScoreBusy(true); setScoreNotice('Checking season results…');
    try {
      const response = await fetch('/api/survivor/scoring/sync', { method: 'POST', headers: { Authorization: `Bearer ${await user.getIdToken()}` }, cache: 'no-store' });
      const result = await response.json() as SeasonResults & { error?: string };
      if (!response.ok) throw new Error(result.error ?? 'Could not check results.');
      let newEliminations = 0;
      await runTransaction(db, async transaction => {
        const ref = doc(db, 'survivorScores', SCORE_ROOM);
        const snapshot = await transaction.get(ref);
        const prior = snapshot.exists() ? snapshot.data() as SeasonResults : emptyResults();
        const next = validateResults(result, prior);
        newEliminations = next.bootOrder.length - prior.bootOrder.length;
        transaction.set(ref, next);
      });
      setScoreNotice(newEliminations ? `${newEliminations} new elimination${newEliminations === 1 ? '' : 's'} scored.` : 'Checked the source; no new eliminations found.');
    } catch (e) { setScoreNotice(e instanceof Error ? e.message : 'Could not check results.'); }
    finally { setScoreBusy(false); }
  }
  const chosen = cast.find(c => c.id === selection?.id);
  return <main className="sv-page">
    <header className="sv-heading"><div><p className="sv-eyebrow">BIDROOM / FANTASY DRAFT</p><h1>SURVIVOR <span>51</span></h1><p className="sv-subtitle">5 teams <span>·</span> 20 castaways <span>·</span> 4 rounds</p></div><button className="sv-secondary" onClick={share}>Share draft</button></header>
    <section className={`sv-status ${myTurn ? 'sv-your-turn' : ''}`} aria-live="polite">
      <div><p className="sv-eyebrow">{finished ? 'ALL TEAMS ARE SET' : live ? `ROUND ${Math.floor(state.picks.length / 5) + 1} · PICK ${state.picks.length + 1} OF 20` : 'DRAFT LOBBY'}</p>
      <h2>{!ready ? 'Connecting to the draft…' : finished ? 'The tribe has spoken.' : live ? !state.order[currentTeam] ? `Waiting for team ${currentTeam + 1} to join` : myTurn ? 'You’re on the clock.' : `${teamName(currentTeam)} is on the clock.` : state.uids.length === 5 ? 'Ready for the organizer to start' : `${state.uids.length} of 5 teams ready`}</h2>
      <p>{finished ? 'All 20 contestants have been drafted. Good luck, everyone.' : live ? myTurn ? 'Choose a castaway below to add to your team.' : 'Browse the cast while you wait for your turn.' : 'Teams appear here automatically as they join. The organizer can shuffle and start when ready.'}</p></div>
      <span className="sv-connection">{connected ? 'Live board' : 'Connecting…'}</span>
    </section>
    {error && <div className="sv-error" role="alert">{error} <button onClick={() => { setError(''); setRetry(n => n + 1); }}>Retry connection</button></div>}
    {notice && <p className="sv-notice" role="status">{notice}</p>}
    {myTeam < 0 && state.uids.length < 5 && <form className="sv-join" onSubmit={join}><div><label htmlFor="sv-team">Your team name</label><p>No account needed. Your team stays linked to this browser. {!organizer && <><Link href="/login">Organizer? Sign in before joining.</Link></>}</p></div><input id="sv-team" required minLength={2} maxLength={24} value={name} onChange={e => setName(e.target.value)} placeholder="Name your tribe" autoComplete="off" /><button className="sv-primary" disabled={busy || loading || !connected}>{busy ? 'Joining…' : 'Join draft'}</button></form>}
    {myTeam < 0 && state.uids.length === 5 && <p className="sv-notice">All five spots are filled. You’re watching the draft. To pick for an existing team, return in the browser you joined with.</p>}
    {!state.started && state.uids.length > 0 && <section className="sv-order" aria-labelledby="sv-order-heading"><div><h2 id="sv-order-heading">Draft order</h2><p>Live lobby · {state.uids.length} of 5 joined. Round one follows the numbered slots; later rounds reverse.</p></div>{organizer ? <><ol>{state.order.map((uid, i) => <li key={uid}><strong>{i + 1}. {teamName(i)}</strong><div><button type="button" className="sv-secondary" aria-label={`Move ${teamName(i)} up`} disabled={busy || !connected || i === 0} onClick={() => setOrder(i, i - 1)}>Up</button><button type="button" className="sv-secondary" aria-label={`Move ${teamName(i)} down`} disabled={busy || !connected || i === state.order.length - 1} onClick={() => setOrder(i, i + 1)}>Down</button></div></li>)}</ol><div className="sv-start-actions"><button type="button" className="sv-primary" disabled={busy || !connected} onClick={() => state.uids.length < 5 ? setConfirmEarlyStart(true) : beginDraft()}>{busy ? 'Starting…' : state.uids.length === 5 ? 'Start draft · shuffle teams' : 'Start test draft now'}</button>{state.uids.length === 5 && <button type="button" className="sv-secondary" disabled={busy || !connected} onClick={() => beginDraft(false)}>Start with displayed order</button>}</div><p className="sv-order-hint">The default start shuffles joined teams and locks the order. Your manual order is used only if you choose “Start with displayed order.”</p></> : <p className="sv-order-hint">{loading ? 'Checking organizer access…' : <>Brian can set the order and start the draft. <Link href="/login">Organizer sign in</Link></>}</p>}</section>}
    {organizer && state.uids.length > 0 && <div className="sv-reset"><button type="button" className="sv-reset-button" disabled={busy || !connected} onClick={() => setConfirmReset(true)}>Reset draft</button><p>Clears every team and pick so everyone can start over.</p></div>}
    <section className="sv-scores" aria-labelledby="sv-scores-heading"><div className="sv-score-heading"><div><h2 id="sv-scores-heading">Scoreboard</h2><p>Elimination order +5 jury · +10 final tribal · +20 winner</p></div>{organizer && <button type="button" className="sv-secondary" disabled={scoreBusy} onClick={updateScoring}>{scoreBusy ? 'Checking…' : 'Please update scoring'}</button>}</div>
      {scoreNotice && <p className="sv-score-message" role="status">{scoreNotice}</p>}
      <ol>{state.order.map((uid, slot) => { const picks = state.picks.filter((_, i) => teamForPick(i) === slot); const total = picks.reduce((sum, id) => sum + contestantPoints(id, scores), 0); return <li key={uid}><span>{teamName(slot)}</span><strong>{total} pts</strong><small>{picks.length ? picks.map(id => `${cast.find(c => c.id === id)?.name ?? id} ${contestantPoints(id, scores)}`).join(' · ') : 'No picks yet'}</small></li>; })}</ol>
      <p className="sv-score-foot">{scores.checkedAt ? `Last checked ${new Date(scores.checkedAt).toLocaleString()}.` : 'No result check yet.'} <a href={scores.sourceUrl} target="_blank" rel="noreferrer">Season results source</a>. Updates appear live for everyone; if the source is unclear, scores stay unchanged.</p>
    </section>
    <section className="sv-teams" aria-label="Teams and rosters">{Array.from({ length: 5 }, (_, i) => <div key={i} className={`sv-team ${live && currentTeam === i ? 'sv-active' : ''}`} style={{ '--team-color': colors[i] } as React.CSSProperties}><div className="sv-team-title"><span className="sv-team-number">{i + 1}</span><h3>{teamName(i)} {myTeam === i && <small>YOU</small>}</h3><span>{state.picks.filter((_, p) => teamForPick(p) === i).length}/4</span></div><ul>{state.picks.map((id, p) => teamForPick(p) === i ? <li key={id}><span>#{p + 1}</span>{cast.find(c => c.id === id)?.name}</li> : null)}{!state.picks.some((_, p) => teamForPick(p) === i) && <li className="sv-empty">{state.order[i] ? 'Waiting for first pick' : 'Waiting for a team'}</li>}</ul></div>)}</section>
    <div className="sv-board-title"><h2>The castaways</h2><span>{20 - state.picks.length} available</span></div>
    <div className="sv-grid">{cast.map(c => {
      const pick = state.picks.indexOf(c.id); const taken = pick !== -1; const owner = taken ? teamForPick(pick) : -1;
      return <article className={`sv-card ${taken ? 'sv-taken' : ''}`} key={c.id}><div className="sv-photo"><img src={c.image} alt={c.name} width="480" height="600" loading="lazy" />{taken && <span className="sv-picked" style={{ background: colors[owner] }}>#{pick + 1} · {teamName(owner)}</span>}</div><div className="sv-card-body"><h3>{c.name}</h3><p className="sv-meta">{c.age} <span>·</span> {c.location}</p><p className="sv-bio">{c.occupation}</p><button className={taken ? 'sv-drafted-button' : 'sv-primary'} disabled={taken || !myTurn || busy || !connected} onClick={() => setSelection({ id: c.id, pick: state.picks.length })}>{taken ? 'Drafted' : myTurn ? `Draft ${c.name.split(' ')[0]}` : 'Awaiting your turn'}</button></div></article>;
    })}</div>
    <footer className="sv-footer"><p>Snake order: 1–5, 5–1, 1–5, 5–1. Four castaways per team.</p><p>Cast as of September 29, 2026. Aaliyah Puglia is excluded after elimination. Bios: <a href="https://parade.com/tv/survivor-51-cast-2026" target="_blank" rel="noreferrer">Parade</a>. Photos: Robert Voets / CBS. Unofficial fan draft.</p></footer>
    <dialog className="sv-dialog" ref={dialog} onCancel={e => { if (busy) e.preventDefault(); else setSelection(null); }} onClose={() => setSelection(null)} aria-labelledby="sv-confirm-title"><h2 id="sv-confirm-title">Draft {chosen?.name}?</h2><p>This locks in pick #{(selection?.pick ?? 0) + 1} for {teamName(myTeam)}. Picks are final.</p><div><button className="sv-secondary" disabled={busy} onClick={() => setSelection(null)}>Cancel</button><button className="sv-primary" disabled={busy || !connected || !myTurn} onClick={draft}>{busy ? 'Saving pick…' : 'Confirm pick'}</button></div></dialog>
    <dialog className="sv-dialog" ref={resetDialog} onCancel={e => { if (busy) e.preventDefault(); else setConfirmReset(false); }} onClose={() => setConfirmReset(false)} aria-labelledby="sv-reset-title"><h2 id="sv-reset-title">Reset the entire draft?</h2><p>This will remove every team, all picks, and the draft order for everyone. The five teams will need to join again. This cannot be undone.</p><div><button type="button" className="sv-secondary" disabled={busy} onClick={() => setConfirmReset(false)}>Cancel</button><button type="button" className="sv-reset-confirm" disabled={busy || !connected || !organizer} onClick={resetDraft}>{busy ? 'Resetting…' : 'Reset everything'}</button></div></dialog>
    <dialog className="sv-dialog" ref={earlyDialog} onCancel={e => { if (busy) e.preventDefault(); else setConfirmEarlyStart(false); }} onClose={() => setConfirmEarlyStart(false)} aria-labelledby="sv-early-title"><h2 id="sv-early-title">Start a test draft early?</h2><p>This shuffles the teams already here. New teams can still join, but picks will pause whenever the next slot is empty. To run the real five-team shuffle later, you’ll need to reset the board first.</p><div><button type="button" className="sv-secondary" disabled={busy} onClick={() => setConfirmEarlyStart(false)}>Cancel</button><button type="button" className="sv-primary" disabled={busy || !connected || !organizer} onClick={() => beginDraft()}>{busy ? 'Starting…' : 'Start test draft'}</button></div></dialog>
  </main>;
}
