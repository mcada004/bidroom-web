import test from "node:test";
import assert from "node:assert/strict";
import {
  applyMatchResult,
  createInitialTournamentState,
  getDefaultTournamentSeedNames,
  getBracketTypeForTeamCount,
  resizePlayerNames,
} from "./tournaments.ts";

test("balanced team seeding pairs top seeds against bottom seeds", () => {
  const state = createInitialTournamentState(getDefaultTournamentSeedNames());

  assert.equal(state.teams.length, 4);
  assert.equal(state.teams[0]?.name, "Town + Moran");
  assert.equal(state.teams[1]?.name, "Stacks + Davie");
  assert.equal(state.teams[2]?.name, "Mac + T");
  assert.equal(state.teams[3]?.name, "Dub + Beats");

  const wbSemi1 = state.bracket.matches.find((match) => match.id === "wb-semi-1");
  const wbSemi2 = state.bracket.matches.find((match) => match.id === "wb-semi-2");

  assert.deepEqual(wbSemi1?.teamIds, ["team-1", "team-4"]);
  assert.deepEqual(wbSemi2?.teamIds, ["team-2", "team-3"]);
});

test("double-elimination bracket advances and requires a grand final reset when needed", () => {
  const initial = createInitialTournamentState(getDefaultTournamentSeedNames());

  const afterSemi1 = applyMatchResult({
    teams: initial.teams,
    bracket: initial.bracket,
    matchId: "wb-semi-1",
    score1: 2,
    score2: 1,
  });
  const afterSemi2 = applyMatchResult({
    teams: initial.teams,
    bracket: afterSemi1.bracket,
    matchId: "wb-semi-2",
    score1: 0,
    score2: 2,
  });
  const afterLosersRound = applyMatchResult({
    teams: initial.teams,
    bracket: afterSemi2.bracket,
    matchId: "lb-elim",
    score1: 2,
    score2: 0,
  });
  const afterWinnersFinal = applyMatchResult({
    teams: initial.teams,
    bracket: afterLosersRound.bracket,
    matchId: "wb-final",
    score1: 1,
    score2: 3,
  });
  const afterLosersFinal = applyMatchResult({
    teams: initial.teams,
    bracket: afterWinnersFinal.bracket,
    matchId: "lb-final",
    score1: 3,
    score2: 0,
  });
  const afterGrandFinal = applyMatchResult({
    teams: initial.teams,
    bracket: afterLosersFinal.bracket,
    matchId: "grand-final",
    score1: 2,
    score2: 3,
  });

  assert.equal(afterGrandFinal.bracket.requiresGrandFinalReset, true);

  const resetMatch = afterGrandFinal.bracket.matches.find(
    (match) => match.id === "grand-final-reset"
  );
  assert.equal(resetMatch?.status, "live");
  assert.deepEqual(resetMatch?.teamIds, ["team-3", "team-1"]);

  const completed = applyMatchResult({
    teams: initial.teams,
    bracket: afterGrandFinal.bracket,
    matchId: "grand-final-reset",
    score1: 1,
    score2: 3,
  });

  assert.equal(completed.status, "completed");
  assert.equal(completed.bracket.championTeamId, "team-1");
});

test("larger team counts switch to single elimination and auto-advance byes", () => {
  const playerNames = resizePlayerNames(getDefaultTournamentSeedNames(), 6).map((name, index) =>
    name || `Player ${index + 1}`
  );
  const state = createInitialTournamentState(playerNames);

  assert.equal(state.teams.length, 6);
  assert.equal(getBracketTypeForTeamCount(state.teams.length), "single_elimination");
  assert.equal(state.bracket.bracketType, "single_elimination");

  const firstRound = state.bracket.groups[0];
  assert.equal(firstRound?.title, "Quarterfinals");

  const firstRoundMatches = firstRound
    ? firstRound.matchIds.map((matchId) => state.bracket.matches.find((match) => match.id === matchId))
    : [];

  assert.equal(firstRoundMatches.length, 4);
  assert.equal(firstRoundMatches.filter((match) => match?.status === "completed").length, 2);
});
