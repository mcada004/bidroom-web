import { NextRequest, NextResponse } from "next/server";
import { getTrainingConnection, initializeTraining, TrainingError, verifyTrainingOwner } from "@/src/server/trainingStore";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store, max-age=0", Vary: "Authorization" };
function failure(error: unknown) {
  return NextResponse.json({ error: error instanceof TrainingError ? error.message : "The training connection could not be saved. Check the plan file and try again." }, { status: error instanceof TrainingError ? error.status : 400, headers });
}
export async function GET(request: NextRequest) {
  try { return NextResponse.json({ connection: await getTrainingConnection(await verifyTrainingOwner(request.headers.get("authorization"))) }, { headers }); } catch (error) { return failure(error); }
}
export async function POST(request: NextRequest) {
  try {
    const owner = await verifyTrainingOwner(request.headers.get("authorization"));
    const body = await request.text();
    if (body.length > 700000) throw new TrainingError("This plan file is too large.", 413);
    return NextResponse.json({ connection: await initializeTraining(owner, JSON.parse(body)) }, { headers });
  } catch (error) { return failure(error); }
}
