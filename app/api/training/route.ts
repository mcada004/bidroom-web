import { NextRequest, NextResponse } from "next/server";
import { getTrainingSnapshot, TrainingError, verifyTrainingOwner } from "@/src/server/trainingStore";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store, max-age=0", Vary: "Authorization" };
export async function GET(request: NextRequest) {
  try {
    const owner = await verifyTrainingOwner(request.headers.get("authorization"));
    return NextResponse.json({ ...await getTrainingSnapshot(owner), checkedAt: new Date().toISOString() }, { headers });
  } catch (error) {
    return NextResponse.json({ error: error instanceof TrainingError ? error.message : "Your training plan could not be loaded." }, { status: error instanceof TrainingError ? error.status : 503, headers });
  }
}
