import { getReleasedSundayScores } from '@/src/server/survivorScoringStore';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    return Response.json(await getReleasedSundayScores(), { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return Response.json({ error: 'Season results are temporarily unavailable.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
