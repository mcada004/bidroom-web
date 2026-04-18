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

export type TournamentStatus = "pending" | "live" | "completed";
export type MatchStatus = "pending" | "live" | "completed";
export type MatchBracket = "winners" | "losers" | "finals";
export type MatchId =
  | "wb-semi-1"
  | "wb-semi-2"
  | "lb-elim"
  | "wb-final"
  | "lb-final"
  | "grand-final"
  | "grand-final-reset";

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

export type TournamentBracket = {
  matches: TournamentMatch[];
  championTeamId: string | null;
  requiresGrandFinalReset: boolean;
};

export type TournamentSettings = {
  teamSize: 2;
  bracketType: "double_elimination";
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

export const TOURNAMENT_MATCH_GROUPS: Array<{
  title: string;
  matchIds: MatchId[];
}> = [
  {
    title: "Winners bracket",
    matchIds: ["wb-semi-1", "wb-semi-2", "wb-final"],
  },
  {
    title: "Losers bracket",
    matchIds: ["lb-elim", "lb-final"],
  },
  {
    title: "Finals",
    matchIds: ["grand-final", "grand-final-reset"],
  },
];

type MatchMeta = Omit<
  TournamentMatch,
  "teamIds" | "winnerTeamId" | "loserTeamId" | "score1" | "score2" | "status"
>;

const MATCHES: MatchMeta[] = [
  {
    id: "wb-semi-1",
    roundName: "WB Semifinal 1",
    bracket: "winners",
    bestOf: 3,
    nextWinnerMatchId: "wb-final",
    nextLoserMatchId: "lb-elim",
  },
  {
    id: "wb-semi-2",
    roundName: "WB Semifinal 2",
    bracket: "winners",
    bestOf: 3,
    nextWinnerMatchId: "wb-final",
    nextLoserMatchId: "lb-elim",
  },
  {
    id: "lb-elim",
    roundName: "LB Elimination",
    bracket: "losers",
    bestOf: 3,
    nextWinnerMatchId: "lb-final",
    nextLoserMatchId: null,
  },
  {
    id: "wb-final",
    roundName: "Winners Final",
    bracket: "winners",
    bestOf: 5,
    nextWinnerMatchId: "grand-final",
    nextLoserMatchId: "lb-final",
  },
  {
    id: "lb-final",
    roundName: "Losers Final",
    bracket: "losers",
    bestOf: 5,
    nextWinnerMatchId: "grand-final",
    nextLoserMatchId: null,
  },
  {
    id: "grand-final",
    roundName: "Grand Final",
    bracket: "finals",
    bestOf: 5,
    nextWinnerMatchId: null,
    nextLoserMatchId: "grand-final-reset",
  },
  {
    id: "grand-final-reset",
    roundName: "Grand Final Reset",
    bracket: "finals",
    bestOf: 5,
    nextWinnerMatchId: null,
    nextLoserMatchId: null,
  },
];

function getMatchMeta(matchId: MatchId) {
  return MATCHES.find((match) => match.id === matchId) ?? null;
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

export function trimPlayerNames(names: string[]) {
  return names.map((name) => name.trim());
}

export function createRankedPlayers(names: string[]): TournamentPlayer[] {
  return trimPlayerNames(names).map((name, index) => ({
    id: createPlayerId(index + 1),
    name,
    seed: index + 1,
  }));
}

export function buildBalancedTeams(players: TournamentPlayer[]): TournamentTeam[] {
  const pairs = Math.floor(players.length / 2);
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

function createPendingOrLiveMatch(
  meta: MatchMeta,
  teamIds: [string | null, string | null]
): TournamentMatch {
  return {
    ...meta,
    teamIds,
    winnerTeamId: null,
    loserTeamId: null,
    score1: null,
    score2: null,
    status: teamIds[0] && teamIds[1] ? "live" : "pending",
  };
}

function createCompletedMatch(
  meta: MatchMeta,
  teamIds: [string, string],
  score1: number,
  score2: number
): TournamentMatch {
  const validation = validateSeriesScore(meta.bestOf, score1, score2);
  if (!validation.valid) {
    return createPendingOrLiveMatch(meta, teamIds);
  }

  const winnerTeamId = teamIds[validation.winnerIndex];
  const loserTeamId = teamIds[validation.winnerIndex === 0 ? 1 : 0];

  return {
    ...meta,
    teamIds,
    winnerTeamId,
    loserTeamId,
    score1,
    score2,
    status: "completed",
  };
}

function rehydrateMatch(
  matchId: MatchId,
  teamIds: [string | null, string | null],
  previousMap: Map<MatchId, TournamentMatch>
) {
  const meta = getMatchMeta(matchId);
  if (!meta) {
    throw new Error(`Unknown match id: ${matchId}`);
  }

  const previous = previousMap.get(matchId);
  if (
    previous &&
    teamIds[0] &&
    teamIds[1] &&
    teamIdsEqual(teamIds, previous.teamIds) &&
    typeof previous.score1 === "number" &&
    typeof previous.score2 === "number"
  ) {
    return createCompletedMatch(meta, [teamIds[0], teamIds[1]], previous.score1, previous.score2);
  }

  return createPendingOrLiveMatch(meta, teamIds);
}

export function deriveBracket(
  teams: TournamentTeam[],
  previousMatches: TournamentMatch[] = []
): TournamentBracket {
  const previousMap = new Map(previousMatches.map((match) => [match.id, match]));
  const team1 = teams[0]?.id ?? null;
  const team2 = teams[1]?.id ?? null;
  const team3 = teams[2]?.id ?? null;
  const team4 = teams[3]?.id ?? null;

  const wbSemi1 = rehydrateMatch("wb-semi-1", [team1, team4], previousMap);
  const wbSemi2 = rehydrateMatch("wb-semi-2", [team2, team3], previousMap);

  const lbElim = rehydrateMatch(
    "lb-elim",
    [wbSemi1.loserTeamId, wbSemi2.loserTeamId],
    previousMap
  );
  const wbFinal = rehydrateMatch(
    "wb-final",
    [wbSemi1.winnerTeamId, wbSemi2.winnerTeamId],
    previousMap
  );
  const lbFinal = rehydrateMatch(
    "lb-final",
    [wbFinal.loserTeamId, lbElim.winnerTeamId],
    previousMap
  );
  const grandFinal = rehydrateMatch(
    "grand-final",
    [wbFinal.winnerTeamId, lbFinal.winnerTeamId],
    previousMap
  );

  const resetTriggered =
    grandFinal.status === "completed" &&
    grandFinal.teamIds[1] !== null &&
    grandFinal.winnerTeamId === grandFinal.teamIds[1];

  const grandFinalReset = rehydrateMatch(
    "grand-final-reset",
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
    championTeamId,
    requiresGrandFinalReset: resetTriggered,
  };
}

export function deriveTournamentStatus(bracket: TournamentBracket): TournamentStatus {
  if (bracket.championTeamId) return "completed";
  if (bracket.matches.some((match) => match.status === "completed")) return "live";
  return "pending";
}

export function createInitialTournamentState(playerNames: string[]) {
  const players = createRankedPlayers(playerNames);
  const teams = buildBalancedTeams(players);
  const bracket = deriveBracket(teams);

  return {
    players,
    teams,
    bracket,
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

  if (playerIds.length !== 2) return null;

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
  const matchId = record.id;
  if (
    matchId !== "wb-semi-1" &&
    matchId !== "wb-semi-2" &&
    matchId !== "lb-elim" &&
    matchId !== "wb-final" &&
    matchId !== "lb-final" &&
    matchId !== "grand-final" &&
    matchId !== "grand-final-reset"
  ) {
    return null;
  }

  const meta = getMatchMeta(matchId);
  if (!meta) return null;

  const rawTeamIds = Array.isArray(record.teamIds) ? record.teamIds : [];
  const teamIds: [string | null, string | null] = [
    typeof rawTeamIds[0] === "string" ? rawTeamIds[0] : null,
    typeof rawTeamIds[1] === "string" ? rawTeamIds[1] : null,
  ];

  return {
    ...meta,
    teamIds,
    winnerTeamId: typeof record.winnerTeamId === "string" ? record.winnerTeamId : null,
    loserTeamId: typeof record.loserTeamId === "string" ? record.loserTeamId : null,
    score1: typeof record.score1 === "number" ? record.score1 : null,
    score2: typeof record.score2 === "number" ? record.score2 : null,
    status:
      record.status === "live" || record.status === "completed" ? record.status : "pending",
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

  const teams = teamsFromDoc.length === 4 ? teamsFromDoc : buildBalancedTeams(players);
  if (players.length !== 8 || teams.length !== 4) return null;

  const previousMatches =
    record.bracket &&
    typeof record.bracket === "object" &&
    Array.isArray((record.bracket as Record<string, unknown>).matches)
      ? ((record.bracket as Record<string, unknown>).matches as unknown[])
          .map((match) => coerceMatch(match))
          .filter((match): match is TournamentMatch => Boolean(match))
      : [];

  const bracket = deriveBracket(teams, previousMatches);

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
      teamSize: 2,
      bracketType: "double_elimination",
      allowGrandFinalReset: true,
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

  const bracket = deriveBracket(input.teams, seededMatches);
  return {
    bracket,
    status: deriveTournamentStatus(bracket),
  };
}

export function resetBracket(teams: TournamentTeam[]) {
  const bracket = deriveBracket(teams);
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
