import { NextRequest, NextResponse } from "next/server";
import { syncRideDirectorySnapshot } from "@/src/server/ridesStore";

export const runtime = "nodejs";

function isAuthorized(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return true;
  return request.headers.get("authorization") === `Bearer ${cronSecret}`;
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await syncRideDirectorySnapshot();
    if (!result.ok) {
      return NextResponse.json(
        {
          ok: true,
          persisted: false,
          reason: result.reason,
          generatedAt: result.snapshot.generatedAt,
          rideCount: result.snapshot.rides.length,
          regionCount: result.snapshot.regions.length,
          sourceCount: result.snapshot.syncSummary?.sourceCount ?? 0,
          crawledSourceCount: result.snapshot.syncSummary?.crawledSourceCount ?? 0,
          successfulSourceCount: result.snapshot.syncSummary?.successfulSourceCount ?? 0,
          failedSourceCount: result.snapshot.syncSummary?.failedSourceCount ?? 0,
          skippedSourceCount: result.snapshot.syncSummary?.skippedSourceCount ?? 0,
        }
      );
    }

    return NextResponse.json({
      ok: true,
      persisted: true,
      generatedAt: result.snapshot.generatedAt,
      rideCount: result.snapshot.rides.length,
      regionCount: result.snapshot.regions.length,
      sourceCount: result.snapshot.syncSummary?.sourceCount ?? 0,
      crawledSourceCount: result.snapshot.syncSummary?.crawledSourceCount ?? 0,
      successfulSourceCount: result.snapshot.syncSummary?.successfulSourceCount ?? 0,
      failedSourceCount: result.snapshot.syncSummary?.failedSourceCount ?? 0,
      skippedSourceCount: result.snapshot.syncSummary?.skippedSourceCount ?? 0,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Sync failed.",
      },
      { status: 500 }
    );
  }
}
