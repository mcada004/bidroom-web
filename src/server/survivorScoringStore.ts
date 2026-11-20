import { unstable_cache } from 'next/cache';
import { fetchSundayEdition } from './survivorSundayResults';
import { lastSundayRelease } from '@/src/lib/survivor/schedule';
import verified from '@/src/lib/survivor/verified-results.json';
import { fromFirestoreValue, toFirestoreValue } from '@/src/server/firestoreRest';
import { getFirestoreProjectId, getFirestoreServiceAccessToken } from '@/src/server/firestoreServiceAccount';
import { emptyResults, SCORE_ROOM, SCORE_SOURCE, validateResults, type SeasonResults } from '@/src/lib/survivor/scoring';
import { parseSurvivorResults } from '@/src/server/survivorResultsParser';

function docUrl(projectId: string) {
  return `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/survivorScores/${SCORE_ROOM}`;
}
export async function saveSundayScores(parsed: SeasonResults) {
  const projectId = getFirestoreProjectId();
  if (!projectId) throw new Error('Scoring database is not configured.');
  const token = await getFirestoreServiceAccessToken();
  const url = docUrl(projectId);
  const auth = { Authorization: `Bearer ${token}` };
  const existing = await fetch(url, { headers: auth, cache: 'no-store' });
  if (existing.status !== 404 && !existing.ok) throw new Error('Could not read existing scores.');
  const priorDoc = existing.ok ? await existing.json() as { fields?: Record<string, unknown>; updateTime?: string } : null;
  const previous = priorDoc?.fields ? Object.fromEntries(Object.entries(priorDoc.fields).map(([key, value]) => [key, fromFirestoreValue(value)])) as SeasonResults : emptyResults();
  const next = validateResults(parsed, previous);
  const writeUrl = new URL(url);
  if (priorDoc?.updateTime) writeUrl.searchParams.set('currentDocument.updateTime', priorDoc.updateTime);
  else writeUrl.searchParams.set('currentDocument.exists', 'false');
  const fields = Object.fromEntries(Object.entries(next).map(([key, value]) => [key, toFirestoreValue(value)]));
  const saved = await fetch(writeUrl, { method: 'PATCH', headers: { ...auth, 'Content-Type': 'application/json' }, body: JSON.stringify({ fields }), cache: 'no-store' });
  if (!saved.ok) throw new Error('Scores changed during refresh. Please retry.');
  return { ...next, newEliminations: next.bootOrder.length - previous.bootOrder.length };
}

export async function fetchSurvivorSourceResults() {
  const source = await fetch(SCORE_SOURCE, { headers: { 'User-Agent': 'Bidroom Survivor 51 scoring/1.0 (fan draft)', Accept: 'text/html' }, cache: 'no-store', signal: AbortSignal.timeout(15000) });
  if (!source.ok) throw new Error(`Season source returned HTTP ${source.status}. Scores were not changed.`);
  const checkedAt = new Date().toISOString();
  return validateResults(parseSurvivorResults(await source.text(), checkedAt), verified);
}

// New cache namespace: never reuse data from the former unrestricted feed.
// The cutoff argument is part of the cache key. Cache misses never fall back to live.
const cachedEdition = unstable_cache((cutoff: string) => fetchSundayEdition(cutoff),
  ['survivor-51-sunday-edition-v1'], { revalidate: false });

export function getReleasedSundayScores(now = new Date()) {
  return cachedEdition(lastSundayRelease(now).toISOString());
}
