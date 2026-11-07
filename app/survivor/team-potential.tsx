import { teamForPick, type DraftState } from '@/src/lib/survivor/draft';
import { teamPotential, type TeamScenario } from '@/src/lib/survivor/potential';
import { type SeasonResults } from '@/src/lib/survivor/scoring';
import cast from '@/src/lib/survivor/cast.json';

export type ScoreLoadState = 'loading' | 'ready' | 'error';
const scenarios = [
  { key: 'juryOnly', label: 'Jury only' },
  { key: 'finalTribal', label: 'Final tribal' },
  { key: 'winner', label: 'Winner' },
] as const;

function ordinal(place: number) {
  const suffix = place >= 11 && place <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[place % 10] ?? 'th';
  return `${place}${suffix}`;
}

function finishRange(scenario: TeamScenario) {
  if (!scenario.finishes.length) return 'Final score';
  const first = ordinal(scenario.finishes[0].place);
  return scenario.finishes.length === 1 ? first : `${first}–${ordinal(scenario.finishes[scenario.finishes.length - 1].place)}`;
}

export default function TeamPotential({ draft, scores, scoreStatus }: {
  draft: DraftState;
  scores: SeasonResults;
  scoreStatus: ScoreLoadState;
}) {
  const teams = draft.order.map((uid, slot) => ({
    uid,
    name: draft.names[draft.uids.indexOf(uid)] ?? `Team ${slot + 1}`,
    projection: teamPotential(draft.picks.filter((_, pick) => teamForPick(pick, draft.teamCount) === slot), scores),
  }));
  const checkedAt = scores.checkedAt ? new Date(scores.checkedAt).toLocaleString('en-US', {
    timeZone: 'America/Los_Angeles', month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true,
  }) : null;

  return <section className="sv-potential" aria-labelledby="sv-potential-heading">
    <p className="sv-eyebrow">BEST POSSIBLE FINISH</p>
    <h2 id="sv-potential-heading">Maximum team totals</h2>
    <p className="sv-potential-intro">Earned points plus the best distinct finishing places for your remaining players. Three left can take 1st, 2nd, and 3rd; four left can take 1st through 4th.</p>
    {scoreStatus === 'loading' ? <p role="status">Loading saved season results…</p> :
      scoreStatus === 'error' ? <p role="alert">Season results are unavailable. Reload to show team maximums.</p> :
      !draft.picks.length ? <p>Team maximums appear once players are drafted.</p> : <>
        <table className="sv-potential-table" aria-describedby="sv-potential-note">
          <caption className="sv-sr-only">Maximum final team scores including points already earned. Each remaining player occupies a different finishing place.</caption>
          <thead><tr><th scope="col">Team</th>{scenarios.map(({ key, label }) => <th scope="col" key={key} className={key === 'winner' ? 'sv-potential-win' : undefined}>{label}</th>)}</tr></thead>
          <tbody>{teams.map(({ uid, name, projection }) => <tr key={uid}>
            <th scope="row"><strong>{name}</strong><small>{projection.earnedPoints} earned · {projection.remainingIds.length} left</small></th>
            {scenarios.map(({ key }) => {
              const scenario = projection[key];
              return <td key={key} className={key === 'winner' ? 'sv-potential-win' : undefined}>
                {scenario ? <><strong>{scenario.total}</strong><small>{finishRange(scenario)}</small></> : <span aria-label="Not possible with the remaining finishing places">—</span>}
              </td>;
            })}
          </tr>)}</tbody>
        </table>
        <p id="sv-potential-note" className="sv-potential-note">Jury only starts at 4th place. Final tribal starts at 2nd, with no winner. Winner starts at 1st. All totals include bonuses; each column is a separate best-case scenario.</p>
        <details className="sv-potential-details">
          <summary>Remaining players &amp; points breakdown</summary>
          <p>Remaining non-finalists are assumed to make the jury (+5). Finalists also get +10, and the winner another +20. Finishing places can be filled by your remaining players in any order.</p>
          {teams.map(({ uid, name, projection }) => <div className="sv-potential-team-detail" key={uid}>
            <h3>{name}</h3>
            <p>{projection.remainingIds.length ? projection.remainingIds.map(id => cast.find(c => c.id === id)?.name ?? id).join(' · ') : 'No players left in the game. Your score is fixed.'}</p>
            <dl>{scenarios.map(({ key, label }) => {
              const scenario = projection[key];
              return <div key={key}><dt>{label}</dt><dd>{scenario ? <>{projection.earnedPoints} earned{scenario.finishes.map(finish => <span key={finish.place}> + {finish.points} ({ordinal(finish.place)})</span>)} = <strong>{scenario.total} pts</strong></> : 'Not enough finishing places remain for this scenario.'}</dd></div>;
            })}</dl>
          </div>)}
          <p>These are independent ceilings for each team. Different teams cannot all claim the same top places. A dash means that scenario is no longer possible.</p>
        </details>
        <p className="sv-potential-source">{checkedAt ? `Based on saved results checked ${checkedAt} PT. Maximums recalculate when scores update.` : 'No season results have been saved yet. These maximums assume every drafted player is still in the game.'}</p>
      </>}
  </section>;
}
