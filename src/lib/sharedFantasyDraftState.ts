export type SharedDraftPickStatus = "X" | "D";

export type SharedDraftPick = {
  rank: number;
  status: SharedDraftPickStatus;
  actorName: string;
  actorUid: string | null;
  updatedAt: string;
};

export type SharedDraftLastAction = {
  action: "draft" | "set" | "undo" | "reset";
  actorName: string;
  rank: number | null;
  at: string;
};

export type SharedDraftState = {
  picks: Record<string, SharedDraftPick>;
  revision: number;
  updatedAt: string | null;
  lastAction: SharedDraftLastAction | null;
};

export type SharedDraftMutation =
  | { action: "draft"; rank: number; status: SharedDraftPickStatus; actorName: string; actorUid: string | null }
  | { action: "set"; rank: number; status: SharedDraftPickStatus; actorName: string; actorUid: string | null }
  | { action: "undo"; rank: number; actorName: string }
  | { action: "reset"; actorName: string };

export class SharedDraftError extends Error {
  status: number;

  constructor(message: string, status = 500) {
    super(message);
    this.name = "SharedDraftError";
    this.status = status;
  }
}

export function emptySharedDraftState(): SharedDraftState {
  return { picks: {}, revision: 0, updatedAt: null, lastAction: null };
}

/** Pick IDs are stable player IDs, not their current display ranks. */
export function getLastDraftedPick(picks: Record<string, SharedDraftPick>) {
  const recorded = Object.values(picks);
  const timed = recorded.filter((pick) => Number.isFinite(Date.parse(pick.updatedAt)));
  timed.sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt) || a.rank - b.rank);
  if (!timed[0]) return null;
  return { pick: timed[0], pickNumber: recorded.length };
}

export function getDraftValueOpinion(boardRank: number, pickNumber: number) {
  if (!Number.isInteger(boardRank) || !Number.isInteger(pickNumber) || boardRank < 1 || pickNumber < 1) {
    throw new RangeError("Board rank and pick number must be positive integers.");
  }
  const difference = pickNumber - boardRank;
  const slots = Math.abs(difference);
  const comparison = difference === 0
    ? "Exactly at our board rank."
    : `${slots} spot${slots === 1 ? "" : "s"} ${difference > 0 ? "later" : "earlier"} than our board rank.`;

  if (difference <= -12) return {
    label: "Reach", tone: "reach", comparison,
    take: "I’d have waited. This is at least a full round ahead of our board’s price.",
  } as const;
  if (difference <= -6) return {
    label: "Slight reach", tone: "caution", comparison,
    take: "A little early for me. Defensible if this fills a need or the tier is drying up.",
  } as const;
  if (difference >= 12) return {
    label: "Great value", tone: "value", comparison,
    take: "I like it. Getting this player at least a round after our ranking is a strong value.",
  } as const;
  if (difference >= 6) return {
    label: "Good value", tone: "value", comparison,
    take: "Nice pick. A useful discount on where I’d take this player.",
  } as const;
  return {
    label: "Fair price", tone: "fair", comparison,
    take: "No reach here. This is right around where I’d take this player.",
  } as const;
}

function isPickStatus(value: unknown): value is SharedDraftPickStatus {
  return value === "X" || value === "D";
}

export function normalizeSharedDraftState(value: unknown): SharedDraftState {
  if (!value || typeof value !== "object") return emptySharedDraftState();
  const raw = value as Record<string, unknown>;
  const picks: Record<string, SharedDraftPick> = {};

  if (raw.picks && typeof raw.picks === "object" && !Array.isArray(raw.picks)) {
    for (const candidate of Object.values(raw.picks as Record<string, unknown>)) {
      if (!candidate || typeof candidate !== "object") continue;
      const pick = candidate as Record<string, unknown>;
      const rank = Number(pick.rank);
      if (!Number.isInteger(rank) || rank < 1 || rank > 200 || !isPickStatus(pick.status)) continue;
      picks[String(rank)] = {
        rank,
        status: pick.status,
        actorName: typeof pick.actorName === "string" ? pick.actorName.slice(0, 24) : "Participant",
        actorUid: typeof pick.actorUid === "string" ? pick.actorUid : null,
        updatedAt: typeof pick.updatedAt === "string" ? pick.updatedAt : "",
      };
    }
  }

  let lastAction: SharedDraftLastAction | null = null;
  if (raw.lastAction && typeof raw.lastAction === "object") {
    const action = raw.lastAction as Record<string, unknown>;
    if (
      (action.action === "draft" || action.action === "set" || action.action === "undo" || action.action === "reset") &&
      typeof action.actorName === "string" &&
      typeof action.at === "string"
    ) {
      lastAction = {
        action: action.action,
        actorName: action.actorName,
        rank: typeof action.rank === "number" ? action.rank : null,
        at: action.at,
      };
    }
  }

  return {
    picks,
    revision: typeof raw.revision === "number" && Number.isInteger(raw.revision) ? raw.revision : 0,
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : null,
    lastAction,
  };
}

export function applySharedDraftMutation(
  current: SharedDraftState,
  mutation: SharedDraftMutation,
  now = new Date().toISOString()
): SharedDraftState {
  const picks = { ...current.picks };
  const rank = "rank" in mutation ? mutation.rank : null;

  if (mutation.action === "draft") {
    if (picks[String(mutation.rank)]) throw new SharedDraftError("That player was already marked drafted.", 409);
    picks[String(mutation.rank)] = {
      rank: mutation.rank,
      status: mutation.status,
      actorName: mutation.actorName,
      actorUid: mutation.actorUid,
      updatedAt: now,
    };
  } else if (mutation.action === "set") {
    picks[String(mutation.rank)] = {
      rank: mutation.rank,
      status: mutation.status,
      actorName: mutation.actorName,
      actorUid: mutation.actorUid,
      updatedAt: now,
    };
  } else if (mutation.action === "undo") {
    delete picks[String(mutation.rank)];
  } else {
    for (const key of Object.keys(picks)) delete picks[key];
  }

  return {
    picks,
    revision: current.revision + 1,
    updatedAt: now,
    lastAction: {
      action: mutation.action,
      actorName: mutation.actorName,
      rank,
      at: now,
    },
  };
}
