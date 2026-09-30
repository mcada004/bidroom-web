import cast from './cast.json' with { type: 'json' };

export const SCORE_ROOM = 'survivor-51-2026';
export const SCORE_SOURCE = 'https://en.wikipedia.org/wiki/Survivor_51';
export type SeasonResults = {
  bootOrder: string[];
  jurors: string[];
  finalists: string[];
  winner: string | null;
  checkedAt: string;
  sourceUrl: string;
};
export const emptyResults = (): SeasonResults => ({ bootOrder: [], jurors: [], finalists: [], winner: null, checkedAt: '', sourceUrl: SCORE_SOURCE });
const ids = new Set(cast.map(c => c.id));

export function validateResults(next: SeasonResults, previous: SeasonResults = emptyResults()): SeasonResults {
  if (next.sourceUrl !== SCORE_SOURCE || Number.isNaN(Date.parse(next.checkedAt))) throw new Error('Invalid scoring source.');
  for (const list of [next.bootOrder, next.jurors, next.finalists]) {
    if (!Array.isArray(list) || new Set(list).size !== list.length || list.some(id => !ids.has(id))) throw new Error('Unrecognized or repeated castaway in results.');
  }
  if (next.bootOrder.length > 17 || next.finalists.length > 3 || (next.winner && !next.finalists.includes(next.winner))) throw new Error('Invalid season finish.');
  if (next.finalists.some(id => next.bootOrder.includes(id)) || next.jurors.some(id => !next.bootOrder.includes(id) && !next.finalists.includes(id))) throw new Error('Inconsistent jury or final result.');
  if (next.bootOrder.length < previous.bootOrder.length || previous.bootOrder.some((id, i) => next.bootOrder[i] !== id)) throw new Error('Source changed an already scored elimination.');
  if (previous.jurors.some(id => !next.jurors.includes(id)) || previous.finalists.some(id => !next.finalists.includes(id)) || (previous.winner && previous.winner !== next.winner)) throw new Error('Source changed an already scored bonus.');
  return next;
}

export function contestantPoints(id: string, results: SeasonResults) {
  const boot = results.bootOrder.indexOf(id);
  const final = results.finalists.indexOf(id);
  const placement = boot >= 0 ? boot + 1 : final >= 0 && results.finalists.length === 3 ? 18 + final : 0;
  return placement + (results.jurors.includes(id) || final >= 0 ? 5 : 0) + (final >= 0 ? 10 : 0) + (results.winner === id ? 20 : 0);
}
