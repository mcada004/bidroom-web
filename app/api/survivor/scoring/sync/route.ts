import { NextRequest, NextResponse } from 'next/server';
import { isSurvivorOrganizer } from '@/src/server/survivorScoringAuth';
import { isSundayReleaseHour } from '@/src/lib/survivor/schedule';
import { fetchSurvivorSourceResults, getReleasedSundayScores, saveSundayScores } from '@/src/server/survivorScoringStore';
import { isFirestoreServiceAccountConfigured } from '@/src/server/firestoreServiceAccount';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'no-store' };

export async function GET(request: NextRequest) {
  if (process.env.CRON_SECRET && request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers });
  const now = new Date();
  if (!isSundayReleaseHour(now)) return NextResponse.json({ ok: true, skipped: 'Outside Sunday at 9 a.m. Pacific' }, { headers });
  try {
    // With no writer credentials this path can only warm the public feed.
    // Firestore writes still require BOTH the secret and a service account.
    const result = await getReleasedSundayScores(now);
    if (!process.env.CRON_SECRET || !isFirestoreServiceAccountConfigured()) {
      return NextResponse.json({ ok: true, persisted: false, checkedAt: result.checkedAt }, { headers });
    }
    return NextResponse.json({ ok: true, persisted: true, ...await saveSundayScores(result) }, { headers });
  }
  catch (error) { return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : 'Score refresh failed.' }, { status: 503, headers }); }
}

export async function POST(request: NextRequest) {
  if (!await isSurvivorOrganizer(request.headers.get('authorization'))) return NextResponse.json({ error: 'Organizer sign-in required.' }, { status: 403, headers });
  try { return NextResponse.json(await fetchSurvivorSourceResults(), { headers }); }
  catch (error) { return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : 'Score refresh failed.' }, { status: 503, headers }); }
}
