import { parseSurvivorResults } from './survivorResultsParser.ts';
import { SCORE_SOURCE, validateResults } from '../lib/survivor/scoring.ts';
import verified from '../lib/survivor/verified-results.json' with { type: 'json' };

// Resolve the latest revision AT the release cutoff, not the current page.
// A cold cache on Thursday must return exactly the same edition as Sunday.
export async function fetchSundayEdition(cutoff: string, request = fetch) {
  const url = new URL('/w/api.php', SCORE_SOURCE);
  url.search = new URLSearchParams({
    action: 'query', format: 'json', formatversion: '2', prop: 'revisions', titles: 'Survivor_51',
    rvstart: cutoff, rvdir: 'older', rvlimit: '1', rvprop: 'ids|timestamp',
  }).toString();
  const get = (url: URL, accept: string) => request(url, {
    cache: 'no-store', headers: { Accept: accept, 'User-Agent': 'Bidroom Survivor scoring (https://www.bidroom.live/survivor)' },
    signal: AbortSignal.timeout(12000),
  });
  const metadata = await get(url, 'application/json');
  if (!metadata.ok) throw new Error('Sunday results index is unavailable.');
  const page = (await metadata.json()).query?.pages?.[0];
  const revision = page?.revisions?.[0];
  if (page?.title !== 'Survivor 51' || !Number.isSafeInteger(revision?.revid) || revision.revid < 1 ||
      !(Date.parse(revision.timestamp) <= Date.parse(cutoff))) throw new Error('No verified Sunday edition.');
  const pinned = new URL('/w/index.php', SCORE_SOURCE);
  pinned.search = new URLSearchParams({ title: 'Survivor_51', oldid: String(revision.revid) }).toString();
  const html = await get(pinned, 'text/html');
  if (!html.ok) throw new Error('Sunday results are unavailable.');
  return validateResults(parseSurvivorResults(await html.text(), cutoff), verified);
}
