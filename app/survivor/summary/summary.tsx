'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '@/src/lib/firebase';
import { emptyDraft, normalizeDraft, PICK_COUNT, SURVIVOR_ROOM, teamForPick, type DraftState } from '@/src/lib/survivor/draft';
import cast from '@/src/lib/survivor/cast.json';

const colors = ['#fbbf24', '#6ee7b7', '#93c5fd', '#f9a8d4', '#c4b5fd'];
export default function SurvivorSummary() {
  const [state, setState] = useState<DraftState>(emptyDraft);
  const [status, setStatus] = useState('Connecting to the live draft…');
  useEffect(() => onSnapshot(doc(db, 'survivorDrafts', SURVIVOR_ROOM), { includeMetadataChanges: true }, snapshot => {
    setState(snapshot.exists() ? normalizeDraft(snapshot.data() as DraftState) : emptyDraft());
    setStatus(snapshot.metadata.fromCache ? 'Reconnecting…' : 'Live updates');
  }, () => setStatus('Unable to connect. Reload to try again.')), []);
  const count = state.teamCount;
  const drafted = new Set(state.picks);
  const remaining = cast.filter(c => !drafted.has(c.id));
  const teamName = (slot: number) => state.names[state.uids.indexOf(state.order[slot])] ?? 'Open spot';
  return <main className="sv-page sv-summary">
    <header className="sv-heading"><div><p className="sv-eyebrow">BIDROOM / FANTASY DRAFT</p><h1>DRAFT <span>SUMMARY</span></h1><p className="sv-subtitle">Survivor 51 · {state.picks.length} of {PICK_COUNT} picked · {remaining.length} remaining</p></div><Link className="sv-secondary" href="/survivor">Back to draft</Link></header>
    <section className="sv-status" aria-live="polite"><div><p className="sv-eyebrow">{status}</p><h2>{state.started ? state.picks.length === PICK_COUNT ? 'Draft complete' : 'The draft is underway' : 'Waiting for the draft'}</h2><p>Teams and available castaways update as picks are saved.</p></div><span className="sv-connection">{state.uids.length} of {count} teams</span></section>
    <section aria-labelledby="sv-summary-teams"><div className="sv-board-title"><h2 id="sv-summary-teams">Teams and picks</h2></div>
      <div className="sv-summary-teams">{Array.from({length:count},(_,slot) => {
        const picks = state.picks.map((id,index) => ({id,index})).filter(p => teamForPick(p.index,count) === slot);
        return <article className="sv-team" style={{'--team-color':colors[slot]} as React.CSSProperties} key={slot}>
          <div className="sv-team-title"><span className="sv-team-number">{slot+1}</span><h3>{teamName(slot)}</h3><span>{picks.length} picked</span></div>
          {picks.length ? <ol className="sv-summary-roster">{picks.map(({id,index}) => {const c=cast.find(person=>person.id===id);return <li key={id}><span>#{index+1}</span>{c?.name ?? id}</li>;})}</ol> : <p className="sv-empty">{state.order[slot] ? 'No picks yet' : 'Waiting for a team'}</p>}
        </article>;
      })}</div>
    </section>
    <section aria-labelledby="sv-summary-remaining"><div className="sv-board-title"><h2 id="sv-summary-remaining">Still available</h2><span>{remaining.length} castaways</span></div>
      {remaining.length ? <div className="sv-summary-remaining">{remaining.map(c => <article key={c.id}><img src={c.image} alt="" width="72" height="80" loading="lazy" /><div><strong>{c.name}</strong><small>{c.occupation}</small></div></article>)}</div> : <p>All 20 castaways have been drafted.</p>}
    </section>
  </main>;
}
