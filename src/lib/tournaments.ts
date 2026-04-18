export const DEFAULT_TOURNAMENT_TITLE = "Bachelor Party LAN";
export const DEFAULT_GAME_TITLE = "Halo 3";
export const DEFAULT_FORMAT = "2v2 double elimination";
export const DEFAULT_PLAYER_NAMES = [
  "Town",
  "Stacks",
  "Mac",
  "Dub",
  "Beats",
  "T",
  "Davie",
  "Moran",
] as const;

export const TOURNAMENT_TEAM_SIZE = 2;
export const MIN_TEAM_COUNT = 2;
export const MAX_TEAM_COUNT = 8;

export type TournamentStatus = "pending" | "live" | "completed";
export type MatchStatus = "pending" | "live" | "completed";
export type TournamentBracketType = "double_elimination" | "single_elimination";
export type MatchBracket = "winners" | "losers" | "finals" | "single";
export type MatchId = string;

export type TournamentPlayer = {
  id: string;
  name: string;
  seed: number;
};

export type TournamentTeam = {
  id: string;
  seed: number;
  label: string;
  name: string;
  playerIds: [string, string];
};

export type TournamentMatch = {
  id: MatchId;
  roundName: string;
  bracket: MatchBracket;
  bestOf: 3 | 5;
  teamIds: [string | null, string | null];
  winnerTeamId: string | null;
  loserTeamId: string | null;
  score1: number | null;
  score2: number | null;
  status: MatchStatus;
  nextWinnerMatchId: MatchId | null;
  nextLoserMatchId: MatchId | null;
};

export type TournamentBracketGroup = {
  title: string;
  matchIds: MatchId[];
};

export type TournamentBracket = {
  matches: TournamentMatch[];
  groups: TournamentBracketGroup[];
  championTeamId: string | null;
  requiresGrandFinalReset: boolean;
  bracketType: TournamentBracketType;
};

export type TournamentSettings = {
  teamSize: 2;
  teamCount: number;
  bracketType: TournamentBracketType;
  allowGrandFinalReset: boolean;
};

export type TournamentDocument = {
  title: string;
  game: string;
  format: string;
  numberOfPlayers: number;
  ownerId: string;
  isPublic: boolean;
  status: TournamentStatus;
  players: TournamentPlayer[];
  teams: TournamentTeam[];
  settings: TournamentSettings;
  bracket: TournamentBracket;
};

type MatchTemplate = {
  id: MatchId;
  roundName: string;
  groupTitle: string;
  bracket: MatchBracket;
  bestOf: 3 | 5;
  nextWinnerMatchId: MatchId | null;
  nextLoserMatchId: MatchId | null;
};

const DOUBLE_ELIM_MATCHES: MatchTemplate[] = [
  {
    id: "wb-semi-1",
    roundName: "WB Semifinal 1",
    groupTitle: "Winners bracket",
    bracket: "winners",
    bestOf: 3,
    nextWinnerMatchId: "wb-final",
    nextLoserMatchId: "lb-elim",
  },
  {
    id: "wb-semi-2",
    roundName: "WB Semifinal 2",
    groupTitle: "Winners bracket",
    bracket: "winners",
    bestOf: 3,
    nextWinnerMatchId: "wb-final",
    nextLoserMatchId: "lb-elim",
  },
  {
    id: "lb-elim",
    roundName: "LB Elimination",
    groupTitle: "Losers bracket",
    bracket: "losers",
    bestOf: 3,
    nextWinnerMatchId: "lb-final",
    nextLoserMatchId: null,
  },
  {
    id: "wb-final",
    roundName: "Winners Final",
    groupTitle: "Winners bracket",
    bracket: "winners",
    bestOf: 5,
    nextWinnerMatchId: "grand-final",
    nextLoserMatchId: "lb-final",
  },
  {
    id: "lb-final",
    roundName: "Losers Final",
    groupTitle: "Losers bracket",
    bracket: "losers",
    bestOf: 5,
    nextWinnerMatchId: "grand-final",
    nextLoserMatchId: null,
  },
  {
    id: "grand-final",
    roundName: "Grand Final",
    groupTitle: "Finals",
    bracket: "finals",
    bestOf: 5,
    nextWinnerMatchId: null,
    nextLoserMatchId: "grand-final-reset",
  },
  {
    id: "grand-final-reset",
    roundName: "Grand Final Reset",
    groupTitle: "Finals",
    bracket: "finals",
    bestOf: 5,
    nextWinnerMatchId: null,
    nextLoserMatchId: null,
  },
];

function getDoubleElimTemplate(matchId: MatchId) {
  return DOUBLE_ELIM_MATCHES.find((match) => match.id === matchId) ?? null;
}

function createPlayerId(seed: number) {
  return `player-${seed}`;
}

function createTeamId(seed: number) {
  return `team-${seed}`;
}

function teamIdsEqual(
  left: [string | null, string | null],
  right: [string | null, string | null]
) {
  return left[0] === right[0] && left[1] === right[1];
}

function nextPowerOfTwo(value: number) {
  let out = 1;
  while (out < value) out *= 2;
  return out;
}

function buildSeedOrder(size: number): number[] {
  if (size <= 2) return [1, 2];
  const previous = buildSeedOrder(size / 2);
  return previous.flatMap((seed) => [seed, size + 1 - seed]);
}

function getSingleElimRoundName(matchesInRound: number) {
  if (matchesInRound === 1) return "Grand Final";
  if (matchesInRound === 2) return "Semifinals";
  if (matchesInRound === 4) return "Quarterfinals";
  if (matchesInRound === 8) return "Round of 16";
  return `Round of ${matchesInRound * 2}`;
}

function createPendingOrLiveMatch(
  template: MatchTemplate,
  teamIds: [string | null, string | null]
): TournamentMatch {
  return {
    id: template.id,
    roundName: template.roundName,
    bracket: template.bracket,
    bestOf: template.bestOf,
    teamIds,
    winnerTeamId: null,
    loserTeamId: null,
    score1: null,
    score2: null,
    status: teamIds[0] && teamIds[1] ? "live" : "pending",
    nextWinnerMatchId: template.nextWinnerMatchId,
    nextLoserMatchId: template.nextLoserMatchId,
  };
}

function createAutoAdvancedMatch(
  template: MatchTemplate,
  teamIds: [string | null, string | null]
): TournamentMatch {
  const winnerTeamId = teamIds[0] ?? teamIds[1];

  return {
    id: template.id,
    roundName: template.roundName,
    bracket: template.bracket,
    bestOf: template.bestOf,
    teamIds,
    winnerTeamId,
    loserTeamId: null,
    score1: null,
    score2: null,
    status: winnerTeamId ? "completed" : "pending",
    nextWinnerMatchId: template.nextWinnerMatchId,
    nextLoserMatchId: template.nextLoserMatchId,
  };
}

function createCompletedMatch(
  template: MatchTemplate,
  teamIds: [string, string],
  score1: number,
  score2: number
): TournamentMatch {
  const validation = validateSeriesScore(template.bestOf, score1, score2);
  if (!validation.valid) {
    return createPendingOrLiveMatch(template, teamIds);
  }

  const winnerTeamId = teamIds[validation.winnerIndex];
  const loserTeamId = teamIds[validation.winnerIndex === 0 ? 1 : 0];

  return {
    id: template.id,
    roundName: template.roundName,
    bracket: template.bracket,
    bestOf: template.bestOf,
    teamIds,
    winnerTeamId,
    loserTeamId,
    score1,
    score2,
    status: "completed",
    nextWinnerMatchId: template.nextWinnerMatchId,
    nextLoserMatchId: template.nextLoserMatchId,
  };
}

function rehydrateMatch(
  template: MatchTemplate,
  teamIds: [string | null, string | null],
  previousMap: Map<MatchId, TournamentMatch>
) {
  if ((teamIds[0] && !teamIds[1]) || (!teamIds[0] && teamIds[1])) {
    return createAutoAdvancedMatch(template, teamIds);
  }

  const previous = previousMap.get(template.id);
  if (
    previous &&
    teamIds[0] &&
    teamIds[1] &&
    teamIdsEqual(teamIds, previous.teamIds) &&
    typeof previous.score1 === "number" &&
    typeof previous.score2 === "number"
  ) {
    return createCompletedMatch(template, [teamIds[0], teamIds[1]], previous.score1, previous.score2);
  }

  return createPendingOrLiveMatch(template, teamIds);
}

function buildGroupsFromTemplates(templates: MatchTemplate[]) {
  const groups = new Map<string, MatchId[]>();

  for (const template of templates) {
    groups.set(template.groupTitle, [...(groups.get(template.groupTitle) ?? []), template.id]);
  }

  return Array.from(groups.entries()).map(([title, matchIds]) => ({ title, matchIds }));
}

function deriveDoubleEliminationBracket(
  teams: TournamentTeam[],
  previousMatches: TournamentMatch[]
): TournamentBracket {
  const previousMap = new Map(previousMatches.map((match) => [match.id, match]));
  const team1 = teams[0]?.id ?? null;
  const team2 = teams[1]?.id ?? null;
  const team3 = teams[2]?.id ?? null;
  const team4 = teams[3]?.id ?? null;

  const wbSemi1 = rehydrateMatch(
    getDoubleElimTemplate("wb-semi-1")!,
    [team1, team4],
    previousMap
  );
  const wbSemi2 = rehydrateMatch(
    getDoubleElimTemplate("wb-semi-2")!,
    [team2, team3],
    previousMap
  );
  const lbElim = rehydrateMatch(
    getDoubleElimTemplate("lb-elim")!,
    [wbSemi1.loserTeamId, wbSemi2.loserTeamId],
    previousMap
  );
  const wbFinal = rehydrateMatch(
    getDoubleElimTemplate("wb-final")!,
    [wbSemi1.winnerTeamId, wbSemi2.winnerTeamId],
    previousMap
  );
  const lbFinal = rehydrateMatch(
    getDoubleElimTemplate("lb-final")!,
    [wbFinal.loserTeamId, lbElim.winnerTeamId],
    previousMap
  );
  const grandFinal = rehydrateMatch(
    getDoubleElimTemplate("grand-final")!,
    [wbFinal.winnerTeamId, lbFinal.winnerTeamId],
    previousMap
  );

  const resetTriggered =
    grandFinal.status === "completed" &&
    grandFinal.teamIds[1] !== null &&
    grandFinal.winnerTeamId === grandFinal.teamIds[1];

  const grandFinalReset = rehydrateMatch(
    getDoubleElimTemplate("grand-final-reset")!,
    resetTriggered ? grandFinal.teamIds : [null, null],
    previousMap
  );

  const championTeamId =
    grandFinalReset.status === "completed"
      ? grandFinalReset.winnerTeamId
      : grandFinal.status === "completed" && !resetTriggered
        ? grandFinal.winnerTeamId
        : null;

  return {
    matches: [
      wbSemi1,
      wbSemi2,
      lbElim,
      wbFinal,
      lbFinal,
      grandFinal,
      grandFinalReset,
    ],
    groups: buildGroupsFromTemplates(DOUBLE_ELIM_MATCHES),
    championTeamId,
    requiresGrandFinalReset: resetTriggered,
    bracketType: "double_elimination",
  };
}

function deriveSingleEliminationBracket(
  teams: TournamentTeam[],
  previousMatches: TournamentMatch[]
): TournamentBracket {
  const previousMap = new Map(previousMatches.map((match) => [match.id, match]));
  const bracketSize = nextPowerOfTwo(teams.length);
  const seedOrder = buildSeedOrder(bracketSize);
  const teamBySeed = new Map(teams.map((team) => [team.seed, team.id]));
  let roundEntries = seedOrder.map((seed) => teamBySeed.get(seed) ?? null);
  const allMatches: TournamentMatch[] = [];
  const groups: TournamentBracketGroup[] = [];
  const totalRounds = Math.log2(bracketSize);

  for (let roundIndex = 0; roundIndex < totalRounds; roundIndex += 1) {
    const matchesInRound = roundEntries.length / 2;
    const roundName = getSingleElimRoundName(matchesInRound);
    const roundMatches: TournamentMatch[] = [];

    for (let matchIndex = 0; matchIndex < matchesInRound; matchIndex += 1) {
      const id = `single-r${roundIndex + 1}-m${matchIndex + 1}`;
      const nextWinnerMatchId =
        roundIndex < totalRounds - 1
          ? `single-r${roundIndex + 2}-m${Math.floor(matchIndex / 2) + 1}`
          : null;

      const template: MatchTemplate = {
        id,
        roundName,
        groupTitle: roundName,
        bracket: "single",
        bestOf: roundIndex === totalRounds - 1 ? 5 : 3,
        nextWinnerMatchId,
        nextLoserMatchId: null,
      };

      const match = rehydrateMatch(
        template,
        [roundEntries[matchIndex * 2] ?? null, roundEntries[matchIndex * 2 + 1] ?? null],
        previousMap
      );
      roundMatches.push(match);
      allMatches.push(match);
    }

    groups.push({ title: roundName, matchIds: roundMatches.map((match) => match.id) });
    roundEntries = roundMatches.map((match) => match.winnerTeamId);
  }

  const championTeamId = allMatches[allMatches.length - 1]?.winnerTeamId ?? null;

  return {
    matches: allMatches,
    groups,
    championTeamId,
    requiresGrandFinalReset: false,
    bracketType: "single_elimination",
  };
}

export function getBracketTypeForTeamCount(teamCount: number): TournamentBracketType {
  return teamCount === 4 ? "double_elimination" : "single_elimination";
}

export function getTeamCountFromPlayerCount(playerCount: number) {
  return Math.max(MIN_TEAM_COUNT, Math.floor(playerCount / TOURNAMENT_TEAM_SIZE));
}

export function trimPlayerNames(names: string[]) {
  return names.map((name) => name.trim());
}

export function resizePlayerNames(names: string[], teamCount: number) {
  const clampedTeamCount = Math.max(MIN_TEAM_COUNT, Math.min(MAX_TEAM_COUNT, teamCount));
  const targetCount = clampedTeamCount * TOURNAMENT_TEAM_SIZE;
  const next = trimPlayerNames(names).slice(0, targetCount);

  while (next.length < targetCount) {
    next.push(DEFAULT_PLAYER_NAMES[next.length] ?? "");
  }

  return next;
}

export function createRankedPlayers(names: string[]): TournamentPlayer[] {
  return trimPlayerNames(names).map((name, index) => ({
    id: createPlayerId(index + 1),
    name,
    seed: index + 1,
  }));
}

export function buildBalancedTeams(players: TournamentPlayer[]): TournamentTeam[] {
  const pairs = Math.floor(players.length / TOURNAMENT_TEAM_SIZE);
  const teams: TournamentTeam[] = [];

  for (let index = 0; index < pairs; index += 1) {
    const highSeed = players[index];
    const lowSeed = players[players.length - 1 - index];

    if (!highSeed || !lowSeed) continue;

    teams.push({
      id: createTeamId(index + 1),
      seed: index + 1,
      label: `Team ${index + 1}`,
      name: `${highSeed.name} + ${lowSeed.name}`,
      playerIds: [highSeed.id, lowSeed.id],
    });
  }

  return teams;
}

export function getSeriesWinsRequired(bestOf: 3 | 5) {
  return Math.floor(bestOf / 2) + 1;
}

export function validateSeriesScore(bestOf: 3 | 5, score1: number, score2: number) {
  if (!Number.isInteger(score1) || !Number.isInteger(score2) || score1 < 0 || score2 < 0) {
    return {
      valid: false as const,
      message: "Scores must be whole numbers at or above zero.",
    };
  }

  if (score1 === score2) {
    return { valid: false as const, message: "Ties are not allowed." };
  }

  const winsRequired = getSeriesWinsRequired(bestOf);
  const highScore = Math.max(score1, score2);
  const lowScore = Math.min(score1, score2);

  if (highScore !== winsRequired) {
    return {
      valid: false as const,
      message: `This ${bestOf === 3 ? "BO3" : "BO5"} must end when a team reaches ${winsRequired} wins.`,
    };
  }

  if (lowScore >= winsRequired) {
    return {
      valid: false as const,
      message: "The losing team cannot also reach the series win threshold.",
    };
  }

  return {
    valid: true as const,
    winnerIndex: (score1 > score2 ? 0 : 1) as 0 | 1,
  };
}

export function deriveBracket(
  teams: TournamentTeam[],
  previousMatches: TournamentMatch[] = [],
  bracketType = getBracketTypeForTeamCount(teams.length)
): TournamentBracket {
  if (bracketType === "double_elimination" && teams.length === 4) {
    return deriveDoubleEliminationBracket(teams, previousMatches);
  }

  return deriveSingleEliminationBracket(teams, previousMatches);
}

export function deriveTournamentStatus(bracket: TournamentBracket): TournamentStatus {
  if (bracket.championTeamId) return "completed";
  if (
    bracket.matches.some(
      (match) => typeof match.score1 === "number" && typeof match.score2 === "number"
    )
  ) {
    return "live";
  }
  return "pending";
}

export function createInitialTournamentState(playerNames: string[]) {
  const players = createRankedPlayers(playerNames);
  const teams = buildBalancedTeams(players);
  const bracketType = getBracketTypeForTeamCount(teams.length);
  const bracket = deriveBracket(teams, [], bracketType);

  return {
    players,
    teams,
    bracket,
    settings: {
      teamSize: TOURNAMENT_TEAM_SIZE,
      teamCount: teams.length,
      bracketType,
      allowGrandFinalReset: bracketType === "double_elimination",
    } satisfies TournamentSettings,
    status: deriveTournamentStatus(bracket),
  };
}

function asString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function coercePlayer(raw: unknown, index: number): TournamentPlayer | null {
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  const name = asString(record.name);
  if (!name) return null;

  return {
    id: asString(record.id) || createPlayerId(index + 1),
    name,
    seed: Number.isInteger(record.seed) ? Number(record.seed) : index + 1,
  };
}

function coerceTeam(raw: unknown, index: number): TournamentTeam | null {
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  const playerIds = Array.isArray(record.playerIds)
    ? record.playerIds.filter((value): value is string => typeof value === "string")
    : [];

  if (playerIds.length !== TOURNAMENT_TEAM_SIZE) return null;

  const label = asString(record.label) || `Team ${index + 1}`;
  const name = asString(record.name);
  if (!name) return null;

  return {
    id: asString(record.id) || createTeamId(index + 1),
    seed: Number.isInteger(record.seed) ? Number(record.seed) : index + 1,
    label,
    name,
    playerIds: [playerIds[0], playerIds[1]],
  };
}

function coerceMatch(raw: unknown): TournamentMatch | null {
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  const id = asString(record.id);
  const roundName = asString(record.roundName);
  if (!id || !roundName) return null;

  const rawTeamIds = Array.isArray(record.teamIds) ? record.teamIds : [];
  const teamIds: [string | null, string | null] = [
    typeof rawTeamIds[0] === "string" ? rawTeamIds[0] : null,
    typeof rawTeamIds[1] === "string" ? rawTeamIds[1] : null,
  ];

  return {
    id,
    roundName,
    bracket:
      record.bracket === "winners" ||
      record.bracket === "losers" ||
      record.bracket === "finals"
        ? record.bracket
        : "single",
    bestOf: record.bestOf === 5 ? 5 : 3,
    teamIds,
    winnerTeamId: typeof record.winnerTeamId === "string" ? record.winnerTeamId : null,
    loserTeamId: typeof record.loserTeamId === "string" ? record.loserTeamId : null,
    score1: typeof record.score1 === "number" ? record.score1 : null,
    score2: typeof record.score2 === "number" ? record.score2 : null,
    status:
      record.status === "live" || record.status === "completed" ? record.status : "pending",
    nextWinnerMatchId:
      typeof record.nextWinnerMatchId === "string" ? record.nextWinnerMatchId : null,
    nextLoserMatchId:
      typeof record.nextLoserMatchId === "string" ? record.nextLoserMatchId : null,
  };
}

export function coerceTournamentDocument(raw: unknown): TournamentDocument | null {
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;

  const players = Array.isArray(record.players)
    ? record.players
        .map((player, index) => coercePlayer(player, index))
        .filter((player): player is TournamentPlayer => Boolean(player))
    : [];

  const teamsFromDoc = Array.isArray(record.teams)
    ? record.teams
        .map((team, index) => coerceTeam(team, index))
        .filter((team): team is TournamentTeam => Boolean(team))
    : [];

  const teams = teamsFromDoc.length >= MIN_TEAM_COUNT ? teamsFromDoc : buildBalancedTeams(players);
  if (players.length < MIN_TEAM_COUNT * TOURNAMENT_TEAM_SIZE || teams.length < MIN_TEAM_COUNT) {
    return null;
  }

  const settingsRecord =
    record.settings && typeof record.settings === "object"
      ? (record.settings as Record<string, unknown>)
      : null;

  const bracketType =
    settingsRecord?.bracketType === "double_elimination" ||
    settingsRecord?.bracketType === "single_elimination"
      ? settingsRecord.bracketType
      : getBracketTypeForTeamCount(teams.length);

  const previousMatches =
    record.bracket &&
    typeof record.bracket === "object" &&
    Array.isArray((record.bracket as Record<string, unknown>).matches)
      ? ((record.bracket as Record<string, unknown>).matches as unknown[])
          .map((match) => coerceMatch(match))
          .filter((match): match is TournamentMatch => Boolean(match))
      : [];

  const bracket = deriveBracket(teams, previousMatches, bracketType);

  return {
    title: asString(record.title) || DEFAULT_TOURNAMENT_TITLE,
    game: asString(record.game) || DEFAULT_GAME_TITLE,
    format: asString(record.format) || DEFAULT_FORMAT,
    numberOfPlayers:
      typeof record.numberOfPlayers === "number" ? record.numberOfPlayers : players.length,
    ownerId: asString(record.ownerId),
    isPublic: record.isPublic !== false,
    status:
      record.status === "pending" || record.status === "live" || record.status === "completed"
        ? record.status
        : deriveTournamentStatus(bracket),
    players,
    teams,
    settings: {
      teamSize: TOURNAMENT_TEAM_SIZE,
      teamCount:
        typeof settingsRecord?.teamCount === "number" ? settingsRecord.teamCount : teams.length,
      bracketType,
      allowGrandFinalReset:
        typeof settingsRecord?.allowGrandFinalReset === "boolean"
          ? settingsRecord.allowGrandFinalReset
          : bracketType === "double_elimination",
    },
    bracket,
  };
}

export function applyMatchResult(input: {
  teams: TournamentTeam[];
  bracket: TournamentBracket;
  matchId: MatchId;
  score1: number;
  score2: number;
  bracketType?: TournamentBracketType;
}) {
  const currentMatch = input.bracket.matches.find((match) => match.id === input.matchId);
  if (!currentMatch) {
    throw new Error("Match not found.");
  }

  if (!currentMatch.teamIds[0] || !currentMatch.teamIds[1]) {
    throw new Error("Both teams must be assigned before saving a result.");
  }

  const validation = validateSeriesScore(currentMatch.bestOf, input.score1, input.score2);
  if (!validation.valid) {
    throw new Error(validation.message);
  }

  const seededMatches = input.bracket.matches.map((match) =>
    match.id === input.matchId
      ? {
          ...match,
          score1: input.score1,
          score2: input.score2,
        }
      : match
  );

  const bracket = deriveBracket(
    input.teams,
    seededMatches,
    input.bracketType ?? input.bracket.bracketType
  );

  return {
    bracket,
    status: deriveTournamentStatus(bracket),
  };
}

export function resetBracket(
  teams: TournamentTeam[],
  bracketType = getBracketTypeForTeamCount(teams.length)
) {
  const bracket = deriveBracket(teams, [], bracketType);
  return {
    bracket,
    status: deriveTournamentStatus(bracket),
  };
}

export function getTeamById(teams: TournamentTeam[], teamId: string | null) {
  if (!teamId) return null;
  return teams.find((team) => team.id === teamId) ?? null;
}

export function getPlayerById(players: TournamentPlayer[], playerId: string) {
  return players.find((player) => player.id === playerId) ?? null;
}

export function getDefaultTournamentSeedNames() {
  return [...DEFAULT_PLAYER_NAMES];
}

export function getTournamentSharePath(tournamentId: string) {
  return `/tournaments/${tournamentId}`;
}
