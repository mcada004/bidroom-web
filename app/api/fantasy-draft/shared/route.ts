import { NextRequest, NextResponse } from "next/server";
import { getBearerToken, getFirebaseServerConfig } from "@/src/server/firebaseApiAuth";
import { verifyFirebaseUser } from "@/src/server/firestoreRest";
import {
  getSharedDraftState,
  mutateSharedDraftState,
} from "@/src/server/sharedFantasyDraft";
import { SharedDraftError, type SharedDraftPickStatus } from "@/src/lib/sharedFantasyDraftState";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ADMIN_EMAIL = "mcada004@gmail.com";

type RequestBody = {
  action?: unknown;
  rank?: unknown;
  status?: unknown;
  username?: unknown;
};

function normalizeUsername(value: unknown) {
  if (typeof value !== "string") return null;
  const cleaned = value.trim().replace(/\s+/g, " ");
  if (cleaned.length < 2 || cleaned.length > 24) return null;
  return cleaned;
}

function normalizeRank(value: unknown) {
  const rank = Number(value);
  return Number.isInteger(rank) && rank >= 1 && rank <= 200 ? rank : null;
}

function normalizeStatus(value: unknown): SharedDraftPickStatus | null {
  return value === "X" || value === "D" ? value : null;
}

async function resolveRequester(request: NextRequest) {
  const token = getBearerToken(request.headers.get("authorization"));
  if (!token) return { isAdmin: false, uid: null };

  try {
    const config = getFirebaseServerConfig();
    const user = await verifyFirebaseUser(token, config.firebaseApiKey);
    return {
      isAdmin: user.email?.toLowerCase() === ADMIN_EMAIL,
      uid: user.uid,
    };
  } catch {
    return { isAdmin: false, uid: null };
  }
}

function json(payload: unknown, status = 200) {
  return NextResponse.json(payload, {
    status,
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}

export async function GET() {
  try {
    return json({ ok: true, state: await getSharedDraftState() });
  } catch (error) {
    const status = error instanceof SharedDraftError ? error.status : 500;
    return json({ ok: false, error: error instanceof Error ? error.message : "Unable to load draft board." }, status);
  }
}

export async function POST(request: NextRequest) {
  let body: RequestBody;
  try {
    body = (await request.json()) as RequestBody;
  } catch {
    return json({ ok: false, error: "Invalid request body." }, 400);
  }

  const requester = await resolveRequester(request);
  const action = typeof body.action === "string" ? body.action : "";
  const username = normalizeUsername(body.username) ?? (requester.isAdmin ? "Brian" : null);
  if (!username) return json({ ok: false, error: "Enter a username between 2 and 24 characters." }, 400);

  try {
    if (action === "draft") {
      const rank = normalizeRank(body.rank);
      const requestedStatus = normalizeStatus(body.status) ?? "X";
      if (!rank) return json({ ok: false, error: "Choose a valid player." }, 400);
      if (!requester.isAdmin && requestedStatus !== "X") {
        return json({ ok: false, error: "Only the board owner can add players to My Team." }, 403);
      }

      const state = await mutateSharedDraftState({
        action: "draft",
        rank,
        status: requester.isAdmin ? requestedStatus : "X",
        actorName: username,
        actorUid: requester.uid,
      });
      return json({ ok: true, state, isAdmin: requester.isAdmin });
    }

    if (!requester.isAdmin) return json({ ok: false, error: "Admin login required." }, 403);

    if (action === "set") {
      const rank = normalizeRank(body.rank);
      const status = normalizeStatus(body.status);
      if (!rank || !status) return json({ ok: false, error: "Choose a valid player and status." }, 400);
      const state = await mutateSharedDraftState({
        action: "set",
        rank,
        status,
        actorName: username,
        actorUid: requester.uid,
      });
      return json({ ok: true, state, isAdmin: true });
    }

    if (action === "undo") {
      const rank = normalizeRank(body.rank);
      if (!rank) return json({ ok: false, error: "Choose a valid player." }, 400);
      const state = await mutateSharedDraftState({ action: "undo", rank, actorName: username });
      return json({ ok: true, state, isAdmin: true });
    }

    if (action === "reset") {
      const state = await mutateSharedDraftState({ action: "reset", actorName: username });
      return json({ ok: true, state, isAdmin: true });
    }

    return json({ ok: false, error: "Unknown draft action." }, 400);
  } catch (error) {
    const status = error instanceof SharedDraftError ? error.status : 500;
    return json({ ok: false, error: error instanceof Error ? error.message : "Unable to update draft board." }, status);
  }
}
