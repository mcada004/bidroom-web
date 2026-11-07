import { contestantPoints, SCORING_RULES, type SeasonResults } from './scoring.ts';

export type PotentialFinish = { place: number; points: number };
export type TeamScenario = {
  finishes: PotentialFinish[];
  additionalPoints: number;
  total: number;
};
export type TeamPotential = {
  earnedPoints: number;
  remainingIds: string[];
  juryOnly: TeamScenario | null;
  finalTribal: TeamScenario | null;
  winner: TeamScenario | null;
};

// Each scenario gives the team's remaining players distinct, best-available
// finishes. Already departed players keep their actual points, including quits.
// A jury-only ceiling starts at fourth; a non-winning finalist ceiling at second.
export function teamPotential(picks: readonly string[], results: SeasonResults): TeamPotential {
  const earnedPoints = picks.reduce((sum, id) => sum + contestantPoints(id, results), 0);
  const remainingIds = picks.filter(id => !results.bootOrder.includes(id) && !results.finalists.includes(id));
  const lastAvailablePlace = SCORING_RULES.castaways - results.bootOrder.length;
  const settledPlaces = results.finalists.length === SCORING_RULES.finalists
    ? new Set(results.finalists.map((_, index) => SCORING_RULES.finalists - index))
    : new Set<number>();

  function scenario(firstPlace: number): TeamScenario | null {
    const finishes: PotentialFinish[] = [];
    for (let place = firstPlace; place <= lastAvailablePlace && finishes.length < remainingIds.length; place++) {
      if (settledPlaces.has(place)) continue;
      const points = SCORING_RULES.castaways + 1 - place + SCORING_RULES.juryBonus +
        (place <= SCORING_RULES.finalists ? SCORING_RULES.finalTribalBonus : 0) +
        (place === 1 ? SCORING_RULES.winnerBonus : 0);
      finishes.push({ place, points });
    }
    // Do not use an occupied finish or pretend all players can miss the final
    // when there are fewer non-finalist places left than players on the team.
    if (finishes.length !== remainingIds.length) return null;
    const additionalPoints = finishes.reduce((sum, finish) => sum + finish.points, 0);
    return { finishes, additionalPoints, total: earnedPoints + additionalPoints };
  }

  return {
    earnedPoints,
    remainingIds,
    juryOnly: scenario(SCORING_RULES.finalists + 1),
    finalTribal: scenario(2),
    winner: scenario(1),
  };
}
