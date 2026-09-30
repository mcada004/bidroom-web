import { NextRequest, NextResponse } from 'next/server';
import { isSaturdayNinePacific, isSurvivorOrganizer } from '@/src/server/survivorScoringAuth';
import { refreshSurvivorScoring } from '@/src/server/survivorScoringStore';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'no-store' };

export async function GET(request: NextRequest) {
  if (!process.env.CRON_SECRET || request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers });
  if (!isSaturdayNinePacific(new Date())) return NextResponse.json({ ok: true, skipped: 'Not Saturday at 9 p.m. Pacific' }, { headers });
  try { return NextResponse.json({ ok: true, ...await refreshSurvivorScoring() }, { headers }); }
  catch (error) { return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : 'Score refresh failed.' }, { status: 503, headers }); }
}

export async function POST(request: NextRequest) {
  if (!await isSurvivorOrganizer(request.headers.get('authorization'))) return NextResponse.json({ error: 'Organizer sign-in required.' }, { status: 403, headers });
  try { return NextResponse.json({ ok: true, ...await refreshSurvivorScoring() }, { headers }); }
  catch (error) { return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : 'Score refresh failed.' }, { status: 503, headers }); }
}
