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
